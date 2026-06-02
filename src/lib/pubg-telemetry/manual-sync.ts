import { fetchMatchDetailsWithTelemetryAsset } from '@/lib/pubg'
import { downloadTelemetryFromAsset } from '@/lib/pubg-telemetry/client'
import {
  captureTelemetryFixtureFromStream,
  getTelemetryFixtureCaptureMaxBytes,
  isTelemetryFixtureCaptureEnabled,
} from '@/lib/pubg-telemetry/fixture-capture'
import { parseTelemetrySnapshotFromStream } from '@/lib/pubg-telemetry/parser'
import {
  buildTelemetrySuccessBasePayload,
  buildTelemetrySuccessPayloadWithJson,
  isTelemetryJsonFieldUnsupportedError,
  normalizeErrorMessage,
} from '@/lib/pubg-telemetry/persistence-payload'
import { prisma } from '@/lib/prisma'

type ManualTelemetrySyncItemResult = {
  squadMatchId: string
  pubgMatchId: string
  status: 'success' | 'failed'
  bytesDownloaded: number
  contentLength: number | null
  errorCode: string | null
  errorMessage: string | null
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

      const { snapshot: parsed, bytesRead } = await parseTelemetrySnapshotFromStream(
        streamForParsing,
        maxAssetSizeBytes
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
      }

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
      const message = normalizeErrorMessage(
        error instanceof Error ? error.message : String(error)
      )
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
          errorCode: 'TELEMETRY_SYNC_FAILED',
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
          errorCode: 'TELEMETRY_SYNC_FAILED',
          errorMessage: message,
        },
      })

      results.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        status: 'failed',
        bytesDownloaded: 0,
        contentLength: null,
        errorCode: 'TELEMETRY_SYNC_FAILED',
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
