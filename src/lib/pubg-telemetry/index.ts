import { fetchMatchDetailsWithTelemetryAsset } from '@/lib/pubg'
import { downloadTelemetryFromAsset } from '@/lib/pubg-telemetry/client'
import { parseTelemetrySnapshotFromStream } from '@/lib/pubg-telemetry/parser'
import {
  buildTelemetrySuccessBasePayload,
  buildTelemetrySuccessPayloadWithJson,
  isTelemetryJsonFieldUnsupportedError,
  normalizeErrorMessage,
} from '@/lib/pubg-telemetry/persistence-payload'
import { persistTelemetryJsonFieldsWithSql } from '@/lib/pubg-telemetry/persistence-fallback'
import { isTelemetryDataExpiredError } from '@/lib/pubg-telemetry/telemetry-error-presentation'
import { prisma } from '@/lib/prisma'

export type SyncTelemetryForSquadMatchInput = {
  squadMatchId: string
  pubgMatchId: string
  anyPlayerId: string
  shard: string
  parserVersion: string
  timeoutMs: number
  maxAssetSizeBytes: number
}

export type SyncTelemetryForSquadMatchResult = {
  squadMatchId: string
  pubgMatchId: string
  status: 'success' | 'failed'
  bytesDownloaded: number
  contentLength: number | null
  errorCode: string | null
  errorMessage: string | null
  durationMs: number
  metrics?: {
    fetchMatchMs: number
    downloadAssetMs: number
    parseMs: number
    persistMs: number
  }
}

type FailedSnapshotInput = {
  squadMatchId: string
  parserVersion: string
  errorCode: string
  errorMessage: string
  telemetryGeneratedAt?: string | null
  contentLength?: number | null
  bytesDownloaded?: number
}

type TelemetryStep =
  | 'fetch-match'
  | 'validate-asset-url'
  | 'download-asset'
  | 'parse-stream'
  | 'persist-snapshot'
  | 'complete'
  | 'failed'

function logTelemetryStep(payload: {
  step: TelemetryStep
  squadMatchId: string
  pubgMatchId: string
  durationMs?: number
  bytes?: number
  errorCode?: string | null
}) {
  console.info('[TelemetrySync]', {
    step: payload.step,
    squadMatchId: payload.squadMatchId,
    pubgMatchId: payload.pubgMatchId,
    durationMs: payload.durationMs ?? null,
    bytes: payload.bytes ?? null,
    errorCode: payload.errorCode ?? null,
  })
}

export async function upsertFailedTelemetrySnapshot(input: FailedSnapshotInput) {
  const now = new Date()

  await prisma.squadMatchTelemetry.upsert({
    where: { squadMatchId: input.squadMatchId },
    update: {
      status: 'failed',
      attemptCount: {
        increment: 1,
      },
      lastAttemptAt: now,
      nextRetryAt: null,
      parserVersion: input.parserVersion,
      parsedAt: now,
      sourceGeneratedAt: input.telemetryGeneratedAt ? new Date(input.telemetryGeneratedAt) : null,
      contentLength: input.contentLength ?? null,
      bytesDownloaded: input.bytesDownloaded ?? 0,
      errorCode: input.errorCode,
      errorMessage: normalizeErrorMessage(input.errorMessage),
    },
    create: {
      squadMatchId: input.squadMatchId,
      status: 'failed',
      attemptCount: 1,
      lastAttemptAt: now,
      nextRetryAt: null,
      parserVersion: input.parserVersion,
      parsedAt: now,
      sourceGeneratedAt: input.telemetryGeneratedAt ? new Date(input.telemetryGeneratedAt) : null,
      contentLength: input.contentLength ?? null,
      bytesDownloaded: input.bytesDownloaded ?? 0,
      errorCode: input.errorCode,
      errorMessage: normalizeErrorMessage(input.errorMessage),
    },
  })
}

export async function syncTelemetryForSquadMatch(
  input: SyncTelemetryForSquadMatchInput
): Promise<SyncTelemetryForSquadMatchResult> {
  const startedAt = Date.now()
  let fetchMatchMs = 0
  let downloadAssetMs = 0
  let parseMs = 0
  let persistMs = 0

  try {
    const fetchStartedAt = Date.now()
    const matchDetails = await fetchMatchDetailsWithTelemetryAsset(
      input.pubgMatchId,
      input.anyPlayerId,
      input.shard
    )
    fetchMatchMs = Date.now() - fetchStartedAt
    logTelemetryStep({
      step: 'fetch-match',
      squadMatchId: input.squadMatchId,
      pubgMatchId: input.pubgMatchId,
      durationMs: fetchMatchMs,
    })

    if (!matchDetails.telemetryAssetUrl) {
      const errorMessage = 'No telemetry asset URL returned by PUBG API for this match'
      logTelemetryStep({
        step: 'validate-asset-url',
        squadMatchId: input.squadMatchId,
        pubgMatchId: input.pubgMatchId,
        errorCode: 'ASSET_URL_MISSING',
      })
      await upsertFailedTelemetrySnapshot({
        squadMatchId: input.squadMatchId,
        parserVersion: input.parserVersion,
        errorCode: 'ASSET_URL_MISSING',
        errorMessage,
        telemetryGeneratedAt: matchDetails.telemetryGeneratedAt,
      })

      return {
        squadMatchId: input.squadMatchId,
        pubgMatchId: input.pubgMatchId,
        status: 'failed',
        bytesDownloaded: 0,
        contentLength: null,
        errorCode: 'ASSET_URL_MISSING',
        errorMessage,
        durationMs: Date.now() - startedAt,
        metrics: {
          fetchMatchMs,
          downloadAssetMs,
          parseMs,
          persistMs,
        },
      }
    }

    const downloadStartedAt = Date.now()
    const downloaded = await downloadTelemetryFromAsset(matchDetails.telemetryAssetUrl, {
      timeoutMs: input.timeoutMs,
      maxAssetSizeBytes: input.maxAssetSizeBytes,
    })
    downloadAssetMs = Date.now() - downloadStartedAt
    logTelemetryStep({
      step: 'download-asset',
      squadMatchId: input.squadMatchId,
      pubgMatchId: input.pubgMatchId,
      durationMs: downloadAssetMs,
      bytes: downloaded.contentLength ?? undefined,
    })

    const parseStartedAt = Date.now()
    const { snapshot: parsed, bytesRead } = await parseTelemetrySnapshotFromStream(
      downloaded.stream,
      input.maxAssetSizeBytes
    )
    parseMs = Date.now() - parseStartedAt
    logTelemetryStep({
      step: 'parse-stream',
      squadMatchId: input.squadMatchId,
      pubgMatchId: input.pubgMatchId,
      durationMs: parseMs,
      bytes: bytesRead,
    })

    const successBasePayload = buildTelemetrySuccessBasePayload({
      parserVersion: input.parserVersion,
      parsedAt: new Date(),
      telemetryGeneratedAt: matchDetails.telemetryGeneratedAt,
      contentLength: downloaded.contentLength,
      bytesDownloaded: bytesRead,
    })

    const successPayloadWithJson = buildTelemetrySuccessPayloadWithJson(successBasePayload, parsed)

    try {
      const persistStartedAt = Date.now()
      await (prisma.squadMatchTelemetry as unknown as {
        upsert: (args: {
          where: { squadMatchId: string }
          update: Record<string, unknown>
          create: Record<string, unknown>
        }) => Promise<unknown>
      }).upsert({
        where: { squadMatchId: input.squadMatchId },
        update: successPayloadWithJson,
        create: {
          squadMatchId: input.squadMatchId,
          ...successPayloadWithJson,
        },
      })
      persistMs = Date.now() - persistStartedAt
      logTelemetryStep({
        step: 'persist-snapshot',
        squadMatchId: input.squadMatchId,
        pubgMatchId: input.pubgMatchId,
        durationMs: persistMs,
        bytes: bytesRead,
      })
    } catch (persistError) {
      if (!isTelemetryJsonFieldUnsupportedError(persistError)) {
        throw persistError
      }

      const persistStartedAt = Date.now()
      await prisma.squadMatchTelemetry.upsert({
        where: { squadMatchId: input.squadMatchId },
        update: successBasePayload,
        create: {
          squadMatchId: input.squadMatchId,
          ...successBasePayload,
        },
      })

      try {
        await persistTelemetryJsonFieldsWithSql({
          squadMatchId: input.squadMatchId,
          parsed,
        })
      } catch (fallbackError) {
        console.warn('[TelemetrySync][FallbackSql] Unable to persist telemetry JSON fields', {
          squadMatchId: input.squadMatchId,
          pubgMatchId: input.pubgMatchId,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        })
      }

      persistMs = Date.now() - persistStartedAt
      logTelemetryStep({
        step: 'persist-snapshot',
        squadMatchId: input.squadMatchId,
        pubgMatchId: input.pubgMatchId,
        durationMs: persistMs,
        bytes: bytesRead,
      })
    }

    logTelemetryStep({
      step: 'complete',
      squadMatchId: input.squadMatchId,
      pubgMatchId: input.pubgMatchId,
      durationMs: Date.now() - startedAt,
      bytes: bytesRead,
    })

    return {
      squadMatchId: input.squadMatchId,
      pubgMatchId: input.pubgMatchId,
      status: 'success',
      bytesDownloaded: bytesRead,
      contentLength: downloaded.contentLength,
      errorCode: null,
      errorMessage: null,
      durationMs: Date.now() - startedAt,
      metrics: {
        fetchMatchMs,
        downloadAssetMs,
        parseMs,
        persistMs,
      },
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error)
    const message = normalizeErrorMessage(rawMessage)
    const errorCode = isTelemetryDataExpiredError(null, rawMessage)
      ? 'TELEMETRY_DATA_EXPIRED'
      : 'TELEMETRY_SYNC_FAILED'

    logTelemetryStep({
      step: 'failed',
      squadMatchId: input.squadMatchId,
      pubgMatchId: input.pubgMatchId,
      durationMs: Date.now() - startedAt,
      errorCode,
    })

    await upsertFailedTelemetrySnapshot({
      squadMatchId: input.squadMatchId,
      parserVersion: input.parserVersion,
      errorCode,
      errorMessage: message,
    })

    return {
      squadMatchId: input.squadMatchId,
      pubgMatchId: input.pubgMatchId,
      status: 'failed',
      bytesDownloaded: 0,
      contentLength: null,
      errorCode,
      errorMessage: message,
      durationMs: Date.now() - startedAt,
      metrics: {
        fetchMatchMs,
        downloadAssetMs,
        parseMs,
        persistMs,
      },
    }
  }
}
