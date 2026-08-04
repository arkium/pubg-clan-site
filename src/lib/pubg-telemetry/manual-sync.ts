import { fetchMatchDetailsWithTelemetryAsset } from '@/lib/pubg'
import { downloadTelemetryFromAsset } from '@/lib/pubg-telemetry/client'
import {
  captureTelemetryFixtureFromStream,
  getTelemetryFixtureCaptureMaxBytes,
  isTelemetryFixtureCaptureEnabled,
} from '@/lib/pubg-telemetry/fixture-capture'
import { enqueueTelemetryLiveSyncJobs } from '@/lib/pubg-telemetry/live-sync-queue'
import { parseTelemetrySnapshotFromStream, type ParsedTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'
import {
  buildTelemetrySuccessBasePayload,
  buildTelemetrySuccessPayloadWithJson,
  isTelemetryJsonFieldUnsupportedError,
  normalizeErrorMessage,
} from '@/lib/pubg-telemetry/persistence-payload'
import { persistTelemetryJsonFieldsWithSql } from '@/lib/pubg-telemetry/persistence-fallback'
import { isTelemetryDataExpiredError } from '@/lib/pubg-telemetry/telemetry-error-presentation'
import { prisma } from '@/lib/prisma'
import { persistDropPressureStatsForMatch } from '@/lib/drop-pressure-persistence'
import { persistKillEventsForMatch } from '@/lib/kill-event-persistence'
import { persistThrowableStatsForMatch } from '@/lib/throwable-persistence'
import { persistPositionMetricCellsForMatch } from '@/lib/position-metric-cells'

export type ManualTelemetrySyncItemResult = {
  squadMatchId: string
  pubgMatchId: string
  status: 'success' | 'failed'
  bytesDownloaded: number
  contentLength: number | null
  errorCode: string | null
  errorMessage: string | null
  positionSamplesCount?: number
  trajectorySegmentsCount?: number
  deathSamplesCount?: number
  captureFilePath?: string
  captureEventCount?: number
  captureBytesRead?: number
  captureWasTruncated?: boolean
  captureError?: string
}

export type ManualTelemetrySyncResult = {
  requestedCount: number
  selectedCount: number
  processedCount: number
  successCount: number
  failedCount: number
  skippedCount: number
  captureEnabled: boolean
  captureMaxBytes: number
  results: ManualTelemetrySyncItemResult[]
}

function getTelemetryTimeoutMs() {
  const value = Number(process.env.TELEMETRY_FETCH_TIMEOUT_MS ?? '30000')
  if (!Number.isFinite(value) || value <= 0) {
    return 30000
  }

  return Math.floor(value)
}

function getTelemetryMaxAssetSizeBytes() {
  const valueMb = Number(process.env.TELEMETRY_MAX_ASSET_SIZE_MB ?? '250')
  if (!Number.isFinite(valueMb) || valueMb <= 0) {
    return 250 * 1024 * 1024
  }

  return Math.floor(valueMb * 1024 * 1024)
}

function getTelemetryParserVersion() {
  const raw = process.env.TELEMETRY_PARSER_VERSION?.trim()
  return raw && raw.length > 0 ? raw : 'v1'
}

function sanitizeSquadMatchIds(ids: string[]) {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)))
  return unique.slice(0, 50)
}

const MAX_DB_POSITION_SAMPLES = 2000
const MAX_DB_TRAJECTORY_SEGMENTS = 2000
const MAX_DB_SHOT_SAMPLES = 2000
const MAX_DB_DAMAGE_SAMPLES = 2000

function thinArray<T>(array: T[], maxCount: number): T[] {
  if (array.length <= maxCount) return array
  const step = array.length / maxCount
  const result: T[] = []
  for (let i = 0; i < maxCount; i += 1) {
    result.push(array[Math.floor(i * step)]!)
  }
  return result
}

function capParsedSnapshotForDb(parsed: ParsedTelemetrySnapshot) {
  const positionSamples = thinArray(parsed.positionSamples, MAX_DB_POSITION_SAMPLES)
  const trajectorySegments = thinArray(parsed.trajectorySegments, MAX_DB_TRAJECTORY_SEGMENTS)
  const shotSamples = thinArray(parsed.shotSamples, MAX_DB_SHOT_SAMPLES)
  const damageSamples = thinArray(parsed.damageSamples, MAX_DB_DAMAGE_SAMPLES)
  const capped = {
    positionSamples: positionSamples.length < parsed.positionSamples.length ? positionSamples.length : null,
    trajectorySegments: trajectorySegments.length < parsed.trajectorySegments.length ? trajectorySegments.length : null,
    shotSamples: shotSamples.length < parsed.shotSamples.length ? shotSamples.length : null,
    damageSamples: damageSamples.length < parsed.damageSamples.length ? damageSamples.length : null,
  }
  if (Object.values(capped).some((v) => v !== null)) {
    console.info('[TelemetrySync] capped arrays for DB', {
      positionSamples: { original: parsed.positionSamples.length, capped: capped.positionSamples ?? parsed.positionSamples.length },
      trajectorySegments: { original: parsed.trajectorySegments.length, capped: capped.trajectorySegments ?? parsed.trajectorySegments.length },
      shotSamples: { original: parsed.shotSamples.length, capped: capped.shotSamples ?? parsed.shotSamples.length },
      damageSamples: { original: parsed.damageSamples.length, capped: capped.damageSamples ?? parsed.damageSamples.length },
    })
  }
  return { ...parsed, positionSamples, trajectorySegments, shotSamples, damageSamples }
}

type SyncTelemetryFromStreamInput = {
  clanId: number
  squadMatchId: string
  stream: ReadableStream<Uint8Array>
  contentLength: number | null
  sourceGeneratedAt?: string | null
  minPositionSampleIntervalSeconds?: number
  clanMemberKeys?: Set<string>
  shotClusterRadiusMeters?: number
  damageClusterRadiusMeters?: number
}

export async function syncTelemetryForSquadMatchFromStream(
  input: SyncTelemetryFromStreamInput
): Promise<ManualTelemetrySyncItemResult> {
  const parserVersion = getTelemetryParserVersion()
  const maxAssetSizeBytes = getTelemetryMaxAssetSizeBytes()

  const squadMatchId = input.squadMatchId.trim()
  if (!squadMatchId) {
    return {
      squadMatchId: input.squadMatchId,
      pubgMatchId: 'unknown',
      status: 'failed',
      bytesDownloaded: 0,
      contentLength: input.contentLength,
      errorCode: 'SQUAD_MATCH_ID_INVALID',
      errorMessage: 'Squad match id is required',
    }
  }

  const match = await prisma.squadMatch.findFirst({
    where: {
      id: squadMatchId,
      members: {
        some: {
          member: {
            clanId: input.clanId,
          },
        },
      },
    },
    select: {
      id: true,
      pubgMatchId: true,
      members: {
        include: {
          member: {
            select: {
              pubgAccountId: true,
              pubgPlayerName: true,
            },
          },
        },
      },
    },
  })
  if (!match) {
    return {
      squadMatchId,
      pubgMatchId: 'unknown',
      status: 'failed',
      bytesDownloaded: 0,
      contentLength: input.contentLength,
      errorCode: 'SQUAD_MATCH_NOT_FOUND',
      errorMessage: 'Squad match not found for this clan',
    }
  }

  try {
    const resolvedClanMemberKeys: Set<string> | undefined = (() => {
      if (input.clanMemberKeys) return input.clanMemberKeys
      const keys = new Set<string>()
      for (const entry of match.members) {
        if (entry.member.pubgAccountId) {
          keys.add(entry.member.pubgAccountId.toLowerCase())
        }
        if (entry.member.pubgPlayerName) {
          keys.add(entry.member.pubgPlayerName.toLowerCase())
        }
      }
      return keys.size > 0 ? keys : undefined
    })()

    const { snapshot: parsedRaw, bytesRead } = await parseTelemetrySnapshotFromStream(
      input.stream,
      maxAssetSizeBytes,
      {
        minPositionSampleIntervalSeconds: input.minPositionSampleIntervalSeconds,
        clanMemberKeys: resolvedClanMemberKeys,
        shotClusterRadiusMeters: input.shotClusterRadiusMeters,
        damageClusterRadiusMeters: input.damageClusterRadiusMeters,
      }
    )

    const parsed = capParsedSnapshotForDb(parsedRaw)

    const successBasePayload = buildTelemetrySuccessBasePayload({
      parserVersion,
      parsedAt: new Date(),
      telemetryGeneratedAt: input.sourceGeneratedAt ?? null,
      contentLength: input.contentLength,
      bytesDownloaded: bytesRead,
    })

    console.info('[TelemetrySync] persist-start', {
      squadMatchId: match.id,
      positionSamples: parsed.positionSamples.length,
      trajectorySegments: parsed.trajectorySegments.length,
      memberStats: parsed.memberStats.length,
      deathSamples: parsed.deathSamples.length,
      phaseSnapshots: parsed.phaseSnapshots.length,
    })

    // Prisma Rust engine crashes fatally (non-interceptable) when serializing large JSON
    // objects into SQL parameters. Always persist scalars via Prisma, then JSON via
    // $executeRaw which receives pre-serialized strings — no Rust-side JSON serialization.
    await prisma.squadMatchTelemetry.upsert({
      where: { squadMatchId: match.id },
      update: successBasePayload,
      create: {
        squadMatchId: match.id,
        ...successBasePayload,
      },
    })

    console.info('[TelemetrySync] persist-base-done', { squadMatchId: match.id })

    await persistTelemetryJsonFieldsWithSql({
      squadMatchId: match.id,
      parsed,
    })

    await persistDropPressureStatsForMatch(match.id, parsed.landingSamples)
    await persistKillEventsForMatch(match.id, parsed.killFeedSamples)
    await persistThrowableStatsForMatch(match.id, parsed.throwableSamples)
    await persistPositionMetricCellsForMatch(match.id, parsed)

    console.info('[TelemetrySync] persist-json-done', { squadMatchId: match.id })

    return {
      squadMatchId: match.id,
      pubgMatchId: match.pubgMatchId,
      status: 'success',
      bytesDownloaded: bytesRead,
      contentLength: input.contentLength,
      errorCode: null,
      errorMessage: null,
      positionSamplesCount: parsed.positionSamples.length,
      trajectorySegmentsCount: parsed.trajectorySegments.length,
      deathSamplesCount: parsed.deathSamples.length,
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error)
    const message = normalizeErrorMessage(rawMessage)
    const errorCode = isTelemetryDataExpiredError(null, rawMessage)
      ? 'TELEMETRY_DATA_EXPIRED'
      : 'TELEMETRY_IMPORT_FAILED'
    const now = new Date()

    await prisma.squadMatchTelemetry.upsert({
      where: { squadMatchId: match.id },
      update: {
        status: 'failed',
        attemptCount: {
          increment: 1,
        },
        lastAttemptAt: now,
        nextRetryAt: null,
        parserVersion,
        parsedAt: now,
        sourceGeneratedAt: input.sourceGeneratedAt ? new Date(input.sourceGeneratedAt) : null,
        contentLength: input.contentLength,
        bytesDownloaded: 0,
        errorCode,
        errorMessage: message,
      },
      create: {
        squadMatchId: match.id,
        status: 'failed',
        attemptCount: 1,
        lastAttemptAt: now,
        nextRetryAt: null,
        parserVersion,
        parsedAt: now,
        sourceGeneratedAt: input.sourceGeneratedAt ? new Date(input.sourceGeneratedAt) : null,
        contentLength: input.contentLength,
        bytesDownloaded: 0,
        errorCode,
        errorMessage: message,
      },
    })

    return {
      squadMatchId: match.id,
      pubgMatchId: match.pubgMatchId,
      status: 'failed',
      bytesDownloaded: 0,
      contentLength: input.contentLength,
      errorCode,
      errorMessage: message,
    }
  }
}

export async function syncTelemetryForSelectedSquadMatches(
  clanId: number,
  squadMatchIds: string[]
): Promise<ManualTelemetrySyncResult> {
  const sanitizedIds = sanitizeSquadMatchIds(squadMatchIds)

  if (sanitizedIds.length === 0) {
    return {
      requestedCount: squadMatchIds.length,
      selectedCount: 0,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      captureEnabled: isTelemetryFixtureCaptureEnabled(),
      captureMaxBytes: getTelemetryFixtureCaptureMaxBytes(),
      results: [],
    }
  }

  const matches = await prisma.squadMatch.findMany({
    where: {
      id: { in: sanitizedIds },
      members: {
        some: {
          member: {
            clanId,
          },
        },
      },
    },
    include: {
      members: {
        include: {
          member: {
            select: {
              id: true,
              pubgAccountId: true,
              pubgPlayerName: true,
              platformShard: true,
            },
          },
        },
        orderBy: {
          memberId: 'asc',
        },
      },
    },
  })

  const timeoutMs = getTelemetryTimeoutMs()
  const maxAssetSizeBytes = getTelemetryMaxAssetSizeBytes()
  const parserVersion = getTelemetryParserVersion()
  const captureEnabled = isTelemetryFixtureCaptureEnabled()
  const captureMaxBytes = getTelemetryFixtureCaptureMaxBytes()

  const foundIds = new Set(matches.map((match) => match.id))
  const missingIds = sanitizedIds.filter((id) => !foundIds.has(id))

  const results: ManualTelemetrySyncItemResult[] = []

  for (const missingId of missingIds) {
    results.push({
      squadMatchId: missingId,
      pubgMatchId: 'unknown',
      status: 'failed',
      bytesDownloaded: 0,
      contentLength: null,
      errorCode: 'SQUAD_MATCH_NOT_FOUND',
      errorMessage: 'Squad match not found for this clan',
    })
  }

  for (const match of matches) {
    let captureFilePath: string | undefined
    let captureEventCount: number | undefined
    let captureBytesRead: number | undefined
    let captureWasTruncated: boolean | undefined
    let captureErrorMessage: string | undefined

    const candidateMember = match.members.find((entry) => !!entry.member.pubgAccountId)

    if (!candidateMember?.member.pubgAccountId) {
      const now = new Date()

      await prisma.squadMatchTelemetry.upsert({
        where: { squadMatchId: match.id },
        update: {
          status: 'failed',
          attemptCount: {
            increment: 1,
          },
          lastAttemptAt: now,
          nextRetryAt: null,
          parserVersion,
          parsedAt: now,
          sourceGeneratedAt: null,
          contentLength: null,
          bytesDownloaded: 0,
          errorCode: 'PUBG_ACCOUNT_ID_MISSING',
          errorMessage: 'No clan member with PUBG account id found for this squad match',
        },
        create: {
          squadMatchId: match.id,
          status: 'failed',
          attemptCount: 1,
          lastAttemptAt: now,
          nextRetryAt: null,
          parserVersion,
          parsedAt: now,
          sourceGeneratedAt: null,
          contentLength: null,
          bytesDownloaded: 0,
          errorCode: 'PUBG_ACCOUNT_ID_MISSING',
          errorMessage: 'No clan member with PUBG account id found for this squad match',
        },
      })

      results.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        status: 'failed',
        bytesDownloaded: 0,
        contentLength: null,
        errorCode: 'PUBG_ACCOUNT_ID_MISSING',
        errorMessage: 'No clan member with PUBG account id found for this squad match',
      })
      continue
    }

    try {
      const matchDetails = await fetchMatchDetailsWithTelemetryAsset(
        match.pubgMatchId,
        candidateMember.member.pubgAccountId,
        candidateMember.member.platformShard
      )

      if (!matchDetails.telemetryAssetUrl) {
        const now = new Date()

        await prisma.squadMatchTelemetry.upsert({
          where: { squadMatchId: match.id },
          update: {
            status: 'failed',
            attemptCount: {
              increment: 1,
            },
            lastAttemptAt: now,
            nextRetryAt: null,
            parserVersion,
            parsedAt: now,
            sourceGeneratedAt: matchDetails.telemetryGeneratedAt
              ? new Date(matchDetails.telemetryGeneratedAt)
              : null,
            contentLength: null,
            bytesDownloaded: 0,
            errorCode: 'ASSET_URL_MISSING',
            errorMessage: 'No telemetry asset URL returned by PUBG API for this match',
          },
          create: {
            squadMatchId: match.id,
            status: 'failed',
            attemptCount: 1,
            lastAttemptAt: now,
            nextRetryAt: null,
            parserVersion,
            parsedAt: now,
            sourceGeneratedAt: matchDetails.telemetryGeneratedAt
              ? new Date(matchDetails.telemetryGeneratedAt)
              : null,
            contentLength: null,
            bytesDownloaded: 0,
            errorCode: 'ASSET_URL_MISSING',
            errorMessage: 'No telemetry asset URL returned by PUBG API for this match',
          },
        })

        results.push({
          squadMatchId: match.id,
          pubgMatchId: match.pubgMatchId,
          status: 'failed',
          bytesDownloaded: 0,
          contentLength: null,
          errorCode: 'ASSET_URL_MISSING',
          errorMessage: 'No telemetry asset URL returned by PUBG API for this match',
        })
        continue
      }

      const downloaded = await downloadTelemetryFromAsset(matchDetails.telemetryAssetUrl, {
        timeoutMs,
        maxAssetSizeBytes,
      })

      const shouldCaptureFixture = captureEnabled
      const [streamForParsing, streamForCapture] = shouldCaptureFixture
        ? downloaded.stream.tee()
        : [downloaded.stream, null]

      if (captureEnabled && downloaded.contentLength === null) {
        console.warn('[TelemetryFixtureCapture]', {
          squadMatchId: match.id,
          pubgMatchId: match.pubgMatchId,
          mode: 'streaming_truncate_on_limit',
          reason: 'CONTENT_LENGTH_UNKNOWN',
          captureMaxBytes,
        })
      }

      if (captureEnabled && downloaded.contentLength !== null && downloaded.contentLength > captureMaxBytes) {
        console.warn('[TelemetryFixtureCapture]', {
          squadMatchId: match.id,
          pubgMatchId: match.pubgMatchId,
          mode: 'streaming_truncate_on_limit',
          reason: 'ASSET_EXPECTED_TO_TRUNCATE',
          contentLength: downloaded.contentLength,
          captureMaxBytes,
        })
      }

      if (streamForCapture) {
        try {
          const capture = await captureTelemetryFixtureFromStream({
            stream: streamForCapture,
            squadMatchId: match.id,
            pubgMatchId: match.pubgMatchId,
          })

          captureFilePath = capture.filePath
          captureEventCount = capture.eventCount
          captureBytesRead = capture.bytesRead
          captureWasTruncated = capture.wasTruncated

          console.info('[TelemetryFixtureCapture]', {
            squadMatchId: match.id,
            pubgMatchId: match.pubgMatchId,
            eventCount: capture.eventCount,
            bytesRead: capture.bytesRead,
            wasTruncated: capture.wasTruncated,
            filePath: capture.filePath,
          })
        } catch (captureIssue) {
          captureErrorMessage =
            captureIssue instanceof Error ? captureIssue.message : String(captureIssue)

          console.warn('[TelemetryFixtureCapture]', {
            squadMatchId: match.id,
            pubgMatchId: match.pubgMatchId,
            error: captureErrorMessage,
          })
        }
      }

      const clanMemberKeys = new Set<string>()
      for (const entry of match.members) {
        if (entry.member.pubgAccountId) {
          clanMemberKeys.add(entry.member.pubgAccountId.toLowerCase())
        }
        if (entry.member.pubgPlayerName) {
          clanMemberKeys.add(entry.member.pubgPlayerName.toLowerCase())
        }
      }

      const { snapshot: parsed, bytesRead } = await parseTelemetrySnapshotFromStream(
        streamForParsing,
        maxAssetSizeBytes,
        { clanMemberKeys: clanMemberKeys.size > 0 ? clanMemberKeys : undefined }
      )

      const successBasePayload = buildTelemetrySuccessBasePayload({
        parserVersion,
        parsedAt: new Date(),
        telemetryGeneratedAt: matchDetails.telemetryGeneratedAt,
        contentLength: downloaded.contentLength,
        bytesDownloaded: bytesRead,
      })

      const successPayloadWithJson = buildTelemetrySuccessPayloadWithJson(
        successBasePayload,
        parsed
      )

      try {
        await (prisma.squadMatchTelemetry as unknown as {
          upsert: (args: {
            where: { squadMatchId: string }
            update: Record<string, unknown>
            create: Record<string, unknown>
          }) => Promise<unknown>
        }).upsert({
          where: { squadMatchId: match.id },
          update: successPayloadWithJson,
          create: {
            squadMatchId: match.id,
            ...successPayloadWithJson,
          },
        })
      } catch (persistError) {
        if (!isTelemetryJsonFieldUnsupportedError(persistError)) {
          throw persistError
        }

        await prisma.squadMatchTelemetry.upsert({
          where: { squadMatchId: match.id },
          update: successBasePayload,
          create: {
            squadMatchId: match.id,
            ...successBasePayload,
          },
        })

        try {
          await persistTelemetryJsonFieldsWithSql({
            squadMatchId: match.id,
            parsed,
          })
        } catch (fallbackError) {
          console.warn('[TelemetrySync][FallbackSql] Unable to persist telemetry JSON fields', {
            squadMatchId: match.id,
            pubgMatchId: match.pubgMatchId,
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          })
        }
      }

      await persistDropPressureStatsForMatch(match.id, parsed.landingSamples)
      await persistKillEventsForMatch(match.id, parsed.killFeedSamples)
      await persistThrowableStatsForMatch(match.id, parsed.throwableSamples)

      results.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        status: 'success',
        bytesDownloaded: bytesRead,
        contentLength: downloaded.contentLength,
        errorCode: null,
        errorMessage: null,
        captureFilePath,
        captureEventCount,
        captureBytesRead,
        captureWasTruncated,
        captureError: captureErrorMessage,
      })
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error)
      const message = normalizeErrorMessage(rawMessage)
      const errorCode = isTelemetryDataExpiredError(null, rawMessage)
        ? 'TELEMETRY_DATA_EXPIRED'
        : 'TELEMETRY_SYNC_FAILED'
      const now = new Date()

      await prisma.squadMatchTelemetry.upsert({
        where: { squadMatchId: match.id },
        update: {
          status: 'failed',
          attemptCount: {
            increment: 1,
          },
          lastAttemptAt: now,
          nextRetryAt: null,
          parserVersion,
          parsedAt: now,
          sourceGeneratedAt: null,
          contentLength: null,
          bytesDownloaded: 0,
          errorCode,
          errorMessage: message,
        },
        create: {
          squadMatchId: match.id,
          status: 'failed',
          attemptCount: 1,
          lastAttemptAt: now,
          nextRetryAt: null,
          parserVersion,
          parsedAt: now,
          sourceGeneratedAt: null,
          contentLength: null,
          bytesDownloaded: 0,
          errorCode,
          errorMessage: message,
        },
      })

      results.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        status: 'failed',
        bytesDownloaded: 0,
        contentLength: null,
        errorCode,
        errorMessage: message,
        captureFilePath,
        captureEventCount,
        captureBytesRead,
        captureWasTruncated,
        captureError: captureErrorMessage,
      })
    }
  }

  const successCount = results.filter((item) => item.status === 'success').length
  const failedCount = results.length - successCount

  return {
    requestedCount: squadMatchIds.length,
    selectedCount: sanitizedIds.length,
    processedCount: results.length,
    successCount,
    failedCount,
    skippedCount: Math.max(0, squadMatchIds.length - sanitizedIds.length),
    captureEnabled,
    captureMaxBytes,
    results,
  }
}

export type ManualTelemetryEnqueueItemResult = {
  squadMatchId: string
  pubgMatchId: string
  status: 'queued' | 'already_queued' | 'skipped'
  errorCode?: string | null
  errorMessage?: string | null
}

export type ManualTelemetryEnqueueResult = {
  requestedCount: number
  selectedCount: number
  queuedCount: number
  alreadyQueuedCount: number
  skippedCount: number
  results: ManualTelemetryEnqueueItemResult[]
}

// Unlike syncTelemetryForSelectedSquadMatches, this never downloads/parses telemetry
// itself — it only writes queue rows. The already-running telemetry-resync-worker
// process (claimNextTelemetryLiveSyncJob) picks them up and does the actual work,
// so the web process stays light regardless of asset size or match count.
export async function enqueueTelemetryForSelectedSquadMatches(
  clanId: number,
  squadMatchIds: string[],
  triggeredBy?: number | null
): Promise<ManualTelemetryEnqueueResult> {
  const sanitizedIds = sanitizeSquadMatchIds(squadMatchIds)

  if (sanitizedIds.length === 0) {
    return {
      requestedCount: squadMatchIds.length,
      selectedCount: 0,
      queuedCount: 0,
      alreadyQueuedCount: 0,
      skippedCount: 0,
      results: [],
    }
  }

  const matches = await prisma.squadMatch.findMany({
    where: {
      id: { in: sanitizedIds },
      members: {
        some: {
          member: {
            clanId,
          },
        },
      },
    },
    include: {
      members: {
        include: {
          member: {
            select: {
              pubgAccountId: true,
              platformShard: true,
            },
          },
        },
        orderBy: {
          memberId: 'asc',
        },
      },
    },
  })

  const foundIds = new Set(matches.map((match) => match.id))
  const missingIds = sanitizedIds.filter((id) => !foundIds.has(id))

  const results: ManualTelemetryEnqueueItemResult[] = missingIds.map((squadMatchId) => ({
    squadMatchId,
    pubgMatchId: 'unknown',
    status: 'skipped',
    errorCode: 'SQUAD_MATCH_NOT_FOUND',
    errorMessage: 'Squad match not found for this clan',
  }))

  const matchesToQueue: { squadMatchId: string; pubgMatchId: string; anyPlayerId: string; shard: string }[] = []

  for (const match of matches) {
    const candidateMember = match.members.find((entry) => !!entry.member.pubgAccountId)

    if (!candidateMember?.member.pubgAccountId) {
      results.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        status: 'skipped',
        errorCode: 'PUBG_ACCOUNT_ID_MISSING',
        errorMessage: 'No clan member with PUBG account id found for this squad match',
      })
      continue
    }

    matchesToQueue.push({
      squadMatchId: match.id,
      pubgMatchId: match.pubgMatchId,
      anyPlayerId: candidateMember.member.pubgAccountId,
      shard: candidateMember.member.platformShard,
    })
  }

  const enqueueResult = await enqueueTelemetryLiveSyncJobs({
    clanId,
    matches: matchesToQueue,
    triggeredBy,
  })

  const pubgMatchIdByQueued = new Map(matchesToQueue.map((match) => [match.squadMatchId, match.pubgMatchId]))

  for (const squadMatchId of enqueueResult.queuedMatchIds) {
    results.push({
      squadMatchId,
      pubgMatchId: pubgMatchIdByQueued.get(squadMatchId) ?? 'unknown',
      status: 'queued',
    })
  }

  for (const squadMatchId of enqueueResult.alreadyQueuedMatchIds) {
    results.push({
      squadMatchId,
      pubgMatchId: pubgMatchIdByQueued.get(squadMatchId) ?? 'unknown',
      status: 'already_queued',
    })
  }

  return {
    requestedCount: squadMatchIds.length,
    selectedCount: sanitizedIds.length,
    queuedCount: enqueueResult.queuedCount,
    alreadyQueuedCount: enqueueResult.alreadyQueuedCount,
    skippedCount: results.filter((item) => item.status === 'skipped').length,
    results,
  }
}

export async function fetchTelemetryFilesForSelectedSquadMatches(
  clanId: number,
  squadMatchIds: string[]
): Promise<ManualTelemetrySyncResult> {
  const sanitizedIds = sanitizeSquadMatchIds(squadMatchIds)
  const captureEnabled = isTelemetryFixtureCaptureEnabled()
  const captureMaxBytes = getTelemetryFixtureCaptureMaxBytes()

  if (sanitizedIds.length === 0) {
    return {
      requestedCount: squadMatchIds.length,
      selectedCount: 0,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      captureEnabled,
      captureMaxBytes,
      results: [],
    }
  }

  if (!captureEnabled) {
    return {
      requestedCount: squadMatchIds.length,
      selectedCount: sanitizedIds.length,
      processedCount: sanitizedIds.length,
      successCount: 0,
      failedCount: sanitizedIds.length,
      skippedCount: Math.max(0, squadMatchIds.length - sanitizedIds.length),
      captureEnabled,
      captureMaxBytes,
      results: sanitizedIds.map((squadMatchId) => ({
        squadMatchId,
        pubgMatchId: 'unknown',
        status: 'failed',
        bytesDownloaded: 0,
        contentLength: null,
        errorCode: 'CAPTURE_DISABLED',
        errorMessage: 'Telemetry capture is disabled (TELEMETRY_CAPTURE_FIXTURES=false)',
      })),
    }
  }

  const matches = await prisma.squadMatch.findMany({
    where: {
      id: { in: sanitizedIds },
      members: {
        some: {
          member: {
            clanId,
          },
        },
      },
    },
    include: {
      members: {
        include: {
          member: {
            select: {
              id: true,
              pubgAccountId: true,
              platformShard: true,
            },
          },
        },
        orderBy: {
          memberId: 'asc',
        },
      },
    },
  })

  const timeoutMs = getTelemetryTimeoutMs()
  const maxAssetSizeBytes = getTelemetryMaxAssetSizeBytes()
  const foundIds = new Set(matches.map((match) => match.id))
  const missingIds = sanitizedIds.filter((id) => !foundIds.has(id))

  const results: ManualTelemetrySyncItemResult[] = []

  for (const missingId of missingIds) {
    results.push({
      squadMatchId: missingId,
      pubgMatchId: 'unknown',
      status: 'failed',
      bytesDownloaded: 0,
      contentLength: null,
      errorCode: 'SQUAD_MATCH_NOT_FOUND',
      errorMessage: 'Squad match not found for this clan',
    })
  }

  for (const match of matches) {
    const candidateMember = match.members.find((entry) => !!entry.member.pubgAccountId)

    if (!candidateMember?.member.pubgAccountId) {
      results.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        status: 'failed',
        bytesDownloaded: 0,
        contentLength: null,
        errorCode: 'PUBG_ACCOUNT_ID_MISSING',
        errorMessage: 'No clan member with PUBG account id found for this squad match',
      })
      continue
    }

    try {
      const matchDetails = await fetchMatchDetailsWithTelemetryAsset(
        match.pubgMatchId,
        candidateMember.member.pubgAccountId,
        candidateMember.member.platformShard
      )

      if (!matchDetails.telemetryAssetUrl) {
        results.push({
          squadMatchId: match.id,
          pubgMatchId: match.pubgMatchId,
          status: 'failed',
          bytesDownloaded: 0,
          contentLength: null,
          errorCode: 'ASSET_URL_MISSING',
          errorMessage: 'No telemetry asset URL returned by PUBG API for this match',
        })
        continue
      }

      const downloaded = await downloadTelemetryFromAsset(matchDetails.telemetryAssetUrl, {
        timeoutMs,
        maxAssetSizeBytes,
      })

      const capture = await captureTelemetryFixtureFromStream({
        stream: downloaded.stream,
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
      })

      results.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        status: 'success',
        bytesDownloaded: capture.bytesRead,
        contentLength: downloaded.contentLength,
        errorCode: null,
        errorMessage: null,
        captureFilePath: capture.filePath,
        captureEventCount: capture.eventCount,
        captureBytesRead: capture.bytesRead,
        captureWasTruncated: capture.wasTruncated,
      })
    } catch (error) {
      const message = normalizeErrorMessage(error instanceof Error ? error.message : String(error))
      results.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        status: 'failed',
        bytesDownloaded: 0,
        contentLength: null,
        errorCode: 'TELEMETRY_CAPTURE_FAILED',
        errorMessage: message,
      })
    }
  }

  const successCount = results.filter((item) => item.status === 'success').length
  const failedCount = results.length - successCount

  return {
    requestedCount: squadMatchIds.length,
    selectedCount: sanitizedIds.length,
    processedCount: results.length,
    successCount,
    failedCount,
    skippedCount: Math.max(0, squadMatchIds.length - sanitizedIds.length),
    captureEnabled,
    captureMaxBytes,
    results,
  }
}
