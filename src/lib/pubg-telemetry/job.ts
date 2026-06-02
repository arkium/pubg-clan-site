import { listSquadMatchesNeedingTelemetry } from '@/lib/pubg-telemetry/backlog'
import {
  syncTelemetryForSquadMatch,
  upsertFailedTelemetrySnapshot,
  type SyncTelemetryForSquadMatchResult,
} from '@/lib/pubg-telemetry/index'

export type SyncTelemetryBatchOptions = {
  maxMatchesPerRun: number
  concurrency: number
  clanId?: number
  parserVersion?: string
  timeoutMs?: number
  maxAssetSizeBytes?: number
}

export type SyncTelemetryBatchResult = {
  scanned: number
  parsed: number
  failed: number
  skipped: number
  durationMs: number
  metrics: {
    bytesDownloaded: number
    fetchMatchMs: number
    downloadAssetMs: number
    parseMs: number
    persistMs: number
  }
  results: SyncTelemetryForSquadMatchResult[]
}

function logTelemetryBatchStep(payload: {
  step: 'batch-start' | 'match-skipped' | 'match-retry' | 'batch-complete'
  clanId: number | null
  durationMs?: number
  scanned?: number
  parsed?: number
  failed?: number
  skipped?: number
  squadMatchId?: string
  pubgMatchId?: string
  errorCode?: string
  retryAttempt?: number
  retryDelayMs?: number
  bytesDownloaded?: number
  fetchMatchMs?: number
  downloadAssetMs?: number
  parseMs?: number
  persistMs?: number
}) {
  console.info('[TelemetryBatch]', {
    step: payload.step,
    clanId: payload.clanId,
    durationMs: payload.durationMs ?? null,
    scanned: payload.scanned ?? null,
    parsed: payload.parsed ?? null,
    failed: payload.failed ?? null,
    skipped: payload.skipped ?? null,
    squadMatchId: payload.squadMatchId ?? null,
    pubgMatchId: payload.pubgMatchId ?? null,
    errorCode: payload.errorCode ?? null,
    retryAttempt: payload.retryAttempt ?? null,
    retryDelayMs: payload.retryDelayMs ?? null,
    bytesDownloaded: payload.bytesDownloaded ?? null,
    fetchMatchMs: payload.fetchMatchMs ?? null,
    downloadAssetMs: payload.downloadAssetMs ?? null,
    parseMs: payload.parseMs ?? null,
    persistMs: payload.persistMs ?? null,
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeConcurrency(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 2
  }

  return Math.min(Math.floor(value), 8)
}

function resolveTimeoutMs(input?: number) {
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
    return Math.floor(input)
  }

  const value = Number(process.env.TELEMETRY_FETCH_TIMEOUT_MS ?? '30000')
  if (!Number.isFinite(value) || value <= 0) {
    return 30000
  }

  return Math.floor(value)
}

function resolveMaxAssetSizeBytes(input?: number) {
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
    return Math.floor(input)
  }

  const valueMb = Number(process.env.TELEMETRY_MAX_ASSET_SIZE_MB ?? '250')
  if (!Number.isFinite(valueMb) || valueMb <= 0) {
    return 250 * 1024 * 1024
  }

  return Math.floor(valueMb * 1024 * 1024)
}

function resolveParserVersion(input?: string) {
  const direct = input?.trim()
  if (direct && direct.length > 0) {
    return direct
  }

  const fromEnv = process.env.TELEMETRY_PARSER_VERSION?.trim()
  return fromEnv && fromEnv.length > 0 ? fromEnv : 'v1'
}

function resolveRetryMax() {
  const value = Number(process.env.TELEMETRY_RETRY_MAX ?? '2')
  if (!Number.isFinite(value) || value < 0) {
    return 2
  }

  return Math.min(Math.floor(value), 5)
}

function resolveRetryBaseDelayMs() {
  const value = Number(process.env.TELEMETRY_RETRY_BASE_DELAY_MS ?? '500')
  if (!Number.isFinite(value) || value <= 0) {
    return 500
  }

  return Math.max(50, Math.floor(value))
}

function isRetryableTelemetryFailure(result: SyncTelemetryForSquadMatchResult) {
  if (result.status !== 'failed') {
    return false
  }

  if (result.errorCode === 'ASSET_URL_MISSING' || result.errorCode === 'PUBG_ACCOUNT_ID_MISSING') {
    return false
  }

  const message = (result.errorMessage ?? '').toLowerCase()

  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('abort') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('(429)') ||
    message.includes('(500)') ||
    message.includes('(502)') ||
    message.includes('(503)') ||
    message.includes('(504)')
  )
}

function getRetryDelayMs(baseDelayMs: number, retryAttempt: number) {
  return Math.min(baseDelayMs * 2 ** (retryAttempt - 1), 10_000)
}

export async function syncTelemetryBatchForRecentSquadMatches(
  options: SyncTelemetryBatchOptions
): Promise<SyncTelemetryBatchResult> {
  const startedAt = Date.now()
  const clanId = typeof options.clanId === 'number' ? options.clanId : null
  const parserVersion = resolveParserVersion(options.parserVersion)
  const retryMax = resolveRetryMax()
  const backlog = await listSquadMatchesNeedingTelemetry(options.maxMatchesPerRun, {
    clanId: options.clanId,
    parserVersion,
    retryMax,
  })

  logTelemetryBatchStep({
    step: 'batch-start',
    clanId,
    scanned: backlog.length,
  })

  const timeoutMs = resolveTimeoutMs(options.timeoutMs)
  const maxAssetSizeBytes = resolveMaxAssetSizeBytes(options.maxAssetSizeBytes)
  const retryBaseDelayMs = resolveRetryBaseDelayMs()

  const results: SyncTelemetryForSquadMatchResult[] = []
  let nextIndex = 0
  let skipped = 0

  async function workerLoop() {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= backlog.length) {
        return
      }

      const match = backlog[currentIndex]
      const candidateMember = match.members.find((entry) => !!entry.member.pubgAccountId)

      if (!candidateMember?.member.pubgAccountId) {
        const errorMessage = 'No clan member with PUBG account id found for this squad match'
        await upsertFailedTelemetrySnapshot({
          squadMatchId: match.id,
          parserVersion,
          errorCode: 'PUBG_ACCOUNT_ID_MISSING',
          errorMessage,
        })

        results.push({
          squadMatchId: match.id,
          pubgMatchId: match.pubgMatchId,
          status: 'failed',
          bytesDownloaded: 0,
          contentLength: null,
          errorCode: 'PUBG_ACCOUNT_ID_MISSING',
          errorMessage,
          durationMs: 0,
        })
        logTelemetryBatchStep({
          step: 'match-skipped',
          clanId,
          squadMatchId: match.id,
          pubgMatchId: match.pubgMatchId,
          errorCode: 'PUBG_ACCOUNT_ID_MISSING',
        })
        skipped += 1
        continue
      }

      let syncResult = await syncTelemetryForSquadMatch({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        anyPlayerId: candidateMember.member.pubgAccountId,
        shard: candidateMember.member.platformShard,
        parserVersion,
        timeoutMs,
        maxAssetSizeBytes,
      })

      for (let retryAttempt = 1; retryAttempt <= retryMax; retryAttempt += 1) {
        if (!isRetryableTelemetryFailure(syncResult)) {
          break
        }

        const retryDelayMs = getRetryDelayMs(retryBaseDelayMs, retryAttempt)

        logTelemetryBatchStep({
          step: 'match-retry',
          clanId,
          squadMatchId: match.id,
          pubgMatchId: match.pubgMatchId,
          errorCode: syncResult.errorCode ?? undefined,
          retryAttempt,
          retryDelayMs,
        })

        await sleep(retryDelayMs)

        syncResult = await syncTelemetryForSquadMatch({
          squadMatchId: match.id,
          pubgMatchId: match.pubgMatchId,
          anyPlayerId: candidateMember.member.pubgAccountId,
          shard: candidateMember.member.platformShard,
          parserVersion,
          timeoutMs,
          maxAssetSizeBytes,
        })
      }

      results.push(syncResult)
    }
  }

  const workerCount = Math.min(normalizeConcurrency(options.concurrency), Math.max(1, backlog.length))
  await Promise.all(Array.from({ length: workerCount }, () => workerLoop()))

  const parsed = results.filter((item) => item.status === 'success').length
  const failed = results.length - parsed
  const durationMs = Date.now() - startedAt
  const metrics = results.reduce(
    (acc, item) => {
      acc.bytesDownloaded += item.bytesDownloaded
      acc.fetchMatchMs += item.metrics?.fetchMatchMs ?? 0
      acc.downloadAssetMs += item.metrics?.downloadAssetMs ?? 0
      acc.parseMs += item.metrics?.parseMs ?? 0
      acc.persistMs += item.metrics?.persistMs ?? 0
      return acc
    },
    {
      bytesDownloaded: 0,
      fetchMatchMs: 0,
      downloadAssetMs: 0,
      parseMs: 0,
      persistMs: 0,
    }
  )

  logTelemetryBatchStep({
    step: 'batch-complete',
    clanId,
    durationMs,
    scanned: backlog.length,
    parsed,
    failed,
    skipped,
    bytesDownloaded: metrics.bytesDownloaded,
    fetchMatchMs: metrics.fetchMatchMs,
    downloadAssetMs: metrics.downloadAssetMs,
    parseMs: metrics.parseMs,
    persistMs: metrics.persistMs,
  })

  return {
    scanned: backlog.length,
    parsed,
    failed,
    skipped,
    durationMs,
    metrics,
    results,
  }
}
