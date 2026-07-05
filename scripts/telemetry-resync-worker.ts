import 'dotenv/config'

import { open, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'

import { Prisma } from '@prisma/client'

import { getTelemetryFixtureCaptureMaxBytes } from '@/lib/pubg-telemetry/fixture-capture'
import { enqueueTelemetryAggregateRecalcJob } from '@/lib/pubg-telemetry/aggregate-recalc-queue'
import { syncTelemetryForSquadMatch } from '@/lib/pubg-telemetry/index'
import {
  claimNextTelemetryLiveSyncJob,
  finishTelemetryLiveSyncJobFailed,
  finishTelemetryLiveSyncJobSuccess,
  getTelemetryLiveSyncQueueStats,
  recoverStuckTelemetryLiveSyncJobs,
} from '@/lib/pubg-telemetry/live-sync-queue'
import {
  claimNextTelemetryResyncQueueJob,
  finishTelemetryResyncQueueJobFailed,
  finishTelemetryResyncQueueJobSuccess,
  getTelemetryResyncQueueStats,
  recoverStuckTelemetryResyncJobs,
} from '@/lib/pubg-telemetry/resync-queue'
import {
  resolveCaptureDirectory,
  resyncTelemetryFromCapturedFile,
} from '@/lib/pubg-telemetry/resync-files'
import { prisma } from '@/lib/prisma'
import { MemoryMonitor } from '@/lib/pubg-telemetry/memory-monitor'
import { BackpressureController } from '@/lib/pubg-telemetry/worker-backpressure'
import { WorkerHealthMonitor } from '@/lib/pubg-telemetry/worker-health'
import { TELEMETRY_RESYNC_QUEUE_ACTION } from '@/lib/pubg-telemetry/resync-queue'

function resolveLiveSyncParserVersion() {
  const raw = process.env.TELEMETRY_PARSER_VERSION?.trim()
  return raw && raw.length > 0 ? raw : 'v1'
}

function resolveLiveSyncTimeoutMs() {
  const value = Number(process.env.TELEMETRY_FETCH_TIMEOUT_MS ?? '30000')
  if (!Number.isFinite(value) || value <= 0) {
    return 30000
  }
  return Math.floor(value)
}

function resolveLiveSyncMaxAssetSizeBytes() {
  const valueMb = Number(process.env.TELEMETRY_MAX_ASSET_SIZE_MB ?? '250')
  if (!Number.isFinite(valueMb) || valueMb <= 0) {
    return 250 * 1024 * 1024
  }
  return Math.floor(valueMb * 1024 * 1024)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolvePollDelayMs() {
  const value = Number(process.env.TELEMETRY_RESYNC_WORKER_POLL_MS ?? '2000')
  if (!Number.isFinite(value) || value < 250) {
    return 2000
  }

  return Math.floor(value)
}

function resolveWorkerId() {
  const envId = process.env.TELEMETRY_RESYNC_WORKER_ID?.trim()
  if (envId && envId.length > 0) {
    return envId
  }

  return `pid-${process.pid}`
}

function resolveMemoryThresholdPercent(): number {
  const value = Number(process.env.TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT ?? '80')
  if (!Number.isFinite(value) || value < 50 || value > 100) {
    return 80
  }
  return Math.floor(value)
}

function resolveMemoryCriticalPercent(): number {
  const value = Number(process.env.TELEMETRY_WORKER_MEMORY_CRITICAL_PCT ?? '95')
  if (!Number.isFinite(value) || value < 70 || value > 100) {
    return 95
  }
  return Math.floor(value)
}

function resolveGcEnabled(): boolean {
  if (process.env.TELEMETRY_WORKER_GC_ENABLED === 'false') return false
  return typeof global.gc === 'function'
}

function resolveStuckRecoveryMs(): number {
  const value = Number(process.env.TELEMETRY_RESYNC_STUCK_RECOVERY_MS ?? '120000')
  if (!Number.isFinite(value) || value < 30_000 || value > 60 * 60 * 1000) {
    return 120_000
  }
  return Math.floor(value)
}

function resolveMaxParallelWorkers(): number {
  const value = Number(process.env.TELEMETRY_RESYNC_WORKER_MAX_PARALLEL ?? '1')
  if (!Number.isFinite(value) || value < 1 || value > 10) {
    return 1
  }
  return Math.floor(value)
}

function resolveSingleInstanceLockFilePath(): string {
  const configured = process.env.TELEMETRY_RESYNC_WORKER_LOCK_FILE?.trim()
  if (configured && configured.length > 0) {
    return path.resolve(process.cwd(), configured)
  }

  return path.resolve(process.cwd(), '.telemetry-resync-worker.lock')
}

function resolveSingleInstanceLockStaleMs(): number {
  const value = Number(process.env.TELEMETRY_RESYNC_WORKER_LOCK_STALE_MS ?? '1800000')
  if (!Number.isFinite(value) || value < 60_000 || value > 24 * 60 * 60 * 1000) {
    return 1_800_000
  }

  return Math.floor(value)
}

type SingleInstanceLockPayload = {
  workerId: string
  pid: number
  acquiredAt: string
}

type SingleInstanceLockHandle = {
  filePath: string
}

async function isProcessAlive(pid: number): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function parseSingleInstanceLockPayload(raw: string): SingleInstanceLockPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SingleInstanceLockPayload>
    if (
      typeof parsed.workerId === 'string' &&
      parsed.workerId.trim().length > 0 &&
      typeof parsed.pid === 'number' &&
      Number.isInteger(parsed.pid) &&
      parsed.pid > 0 &&
      typeof parsed.acquiredAt === 'string' &&
      !Number.isNaN(Date.parse(parsed.acquiredAt))
    ) {
      return {
        workerId: parsed.workerId.trim(),
        pid: parsed.pid,
        acquiredAt: parsed.acquiredAt,
      }
    }
    return null
  } catch {
    return null
  }
}

async function acquireSingleInstanceLock(input: {
  filePath: string
  workerId: string
  staleMs: number
}): Promise<{ handle: SingleInstanceLockHandle | null; blockedBy: SingleInstanceLockPayload | null }> {
  const payload: SingleInstanceLockPayload = {
    workerId: input.workerId,
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const file = await open(input.filePath, 'wx')
      try {
        await file.writeFile(JSON.stringify(payload), 'utf8')
      } finally {
        await file.close()
      }

      return {
        handle: { filePath: input.filePath },
        blockedBy: null,
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError?.code !== 'EEXIST') {
        throw error
      }

      let blockedBy: SingleInstanceLockPayload | null = null
      try {
        const raw = await readFile(input.filePath, 'utf8')
        blockedBy = parseSingleInstanceLockPayload(raw)
      } catch {
        blockedBy = null
      }

      const acquiredAtMs = blockedBy ? Date.parse(blockedBy.acquiredAt) : NaN
      const lockAgeMs = Number.isFinite(acquiredAtMs) ? Date.now() - acquiredAtMs : Number.POSITIVE_INFINITY
      const ownerAlive = blockedBy ? await isProcessAlive(blockedBy.pid) : false
      const stale = !blockedBy || !ownerAlive || lockAgeMs > input.staleMs

      if (stale) {
        try {
          await unlink(input.filePath)
        } catch {
          // Ignore remove races; next attempt decides.
        }
        continue
      }

      return {
        handle: null,
        blockedBy,
      }
    }
  }

  return {
    handle: null,
    blockedBy: null,
  }
}

async function releaseSingleInstanceLock(handle: SingleInstanceLockHandle | null): Promise<void> {
  if (!handle) {
    return
  }

  try {
    await unlink(handle.filePath)
  } catch {
    // Lock file may already be removed after an abnormal interruption.
  }
}

function extractWorkerIdFromMessage(message: string | null | undefined): string | null {
  if (!message) return null
  const match = /Claimed by telemetry worker\s+(.+)$/u.exec(message.trim())
  if (!match?.[1]) return null
  return match[1].trim()
}

async function getLikelyActiveOtherWorkers(windowMs: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - windowMs)
  const rows = await prisma.cronExecution.findMany({
    where: {
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'running',
      startedAt: { gte: cutoff },
    },
    select: {
      message: true,
    },
    take: 100,
  })

  const workers = new Set<string>()
  for (const row of rows) {
    const workerId = extractWorkerIdFromMessage(row.message)
    if (workerId) {
      workers.add(workerId)
    }
  }

  return Array.from(workers)
}

async function processOneJob(
  workerId: string,
  backpressure: BackpressureController,
  health: WorkerHealthMonitor
): Promise<{ processed: boolean; durationMs: number }> {
  const startTime = Date.now()

  const jobResult = await backpressure.processWithBackpressure(
    async () => {
      const job = await claimNextTelemetryResyncQueueJob(workerId)
      if (!job) {
        return null
      }

      console.info('[TelemetryResyncWorker] job claimed', {
        workerId,
        jobId: job.id,
        clanId: job.clanId,
        squadMatchId: job.details.squadMatchId,
        resetBeforeSync: job.details.resetBeforeSync,
        recalculateAggregates: job.details.recalculateAggregates,
      })

      const captureDir = resolveCaptureDirectory()
      const maxResyncFileBytes = getTelemetryFixtureCaptureMaxBytes()

      try {
        if (job.details.resetBeforeSync) {
          console.info('[TelemetryResyncWorker] step reset-db', { jobId: job.id, squadMatchId: job.details.squadMatchId })
          await prisma.squadMatchTelemetry.deleteMany({
            where: {
              squadMatchId: job.details.squadMatchId,
            },
          })
          console.info('[TelemetryResyncWorker] step reset-db done', { jobId: job.id })
        }

        console.info('[TelemetryResyncWorker] step resync-start', { jobId: job.id, squadMatchId: job.details.squadMatchId })
        const syncFromFile = await resyncTelemetryFromCapturedFile({
          clanId: job.clanId,
          squadMatchId: job.details.squadMatchId,
          captureDir,
          maxResyncFileBytes,
        })
        console.info('[TelemetryResyncWorker] step resync-done', { jobId: job.id, status: syncFromFile.status })

        if (syncFromFile.status === 'missing') {
          await finishTelemetryResyncQueueJobFailed(
            job.id,
            {
              squadMatchId: job.details.squadMatchId,
              status: 'missing',
              resetBeforeSync: job.details.resetBeforeSync,
              recalculateAggregates: job.details.recalculateAggregates,
            },
            'Captured telemetry file is missing'
          )
          return true
        }

        if (syncFromFile.status === 'oversized') {
          await finishTelemetryResyncQueueJobFailed(
            job.id,
            {
              squadMatchId: job.details.squadMatchId,
              status: 'oversized',
              fileSize: syncFromFile.size,
              maxResyncFileBytes,
              resetBeforeSync: job.details.resetBeforeSync,
              recalculateAggregates: job.details.recalculateAggregates,
            },
            `Captured file exceeds size limit (${syncFromFile.size} > ${maxResyncFileBytes})`
          )
          return true
        }

        if (syncFromFile.status !== 'processed') {
          return true
        }

        const syncResult = syncFromFile.result

        if (syncResult.status === 'failed') {
          await finishTelemetryResyncQueueJobFailed(
            job.id,
            {
              squadMatchId: job.details.squadMatchId,
              status: syncResult.status,
              errorCode: syncResult.errorCode,
              errorMessage: syncResult.errorMessage,
              bytesDownloaded: syncResult.bytesDownloaded,
              contentLength: syncResult.contentLength,
              resetBeforeSync: job.details.resetBeforeSync,
              recalculateAggregates: job.details.recalculateAggregates,
            },
            `Telemetry file resync failed: ${syncResult.errorMessage ?? 'unknown error'}`
          )
          return true
        }

        let aggregates:
          | {
              periodsUpdated: number
              memberTelemetryRows: number
              memberWeaponRows: number
              clanSynergyRows: number
            }
          | null = null
        let aggregatesWarning: string | null = null

        if (job.details.recalculateAggregates) {
          const aggregateQueue = await enqueueTelemetryAggregateRecalcJob({
            clanId: job.clanId,
            requestedByResyncJobId: job.id,
          })
          aggregatesWarning = aggregateQueue.enqueued
            ? `Recalcul des aggregates queue (job: ${aggregateQueue.jobId})`
            : `Recalcul des aggregates deja en cours/queue (job: ${aggregateQueue.jobId})`
        }

        const details: Prisma.JsonObject = {
          squadMatchId: job.details.squadMatchId,
          status: syncResult.status,
          pubgMatchId: syncResult.pubgMatchId,
          bytesDownloaded: syncResult.bytesDownloaded,
          contentLength: syncResult.contentLength,
          positionSamplesCount: syncResult.positionSamplesCount ?? null,
          trajectorySegmentsCount: syncResult.trajectorySegmentsCount ?? null,
          deathSamplesCount: syncResult.deathSamplesCount ?? null,
          resetBeforeSync: job.details.resetBeforeSync,
          recalculateAggregates: job.details.recalculateAggregates,
          aggregates,
          aggregatesWarning,
        }

        await finishTelemetryResyncQueueJobSuccess(
          job.id,
          details,
          `Telemetry file resync success (${job.details.squadMatchId})`
        )

        const queue = await getTelemetryResyncQueueStats({ clanId: job.clanId })
        console.info('[TelemetryResyncWorker] job success', {
          workerId,
          jobId: job.id,
          clanId: job.clanId,
          squadMatchId: job.details.squadMatchId,
          durationMs: Date.now() - startTime,
          queue,
        })

        return true
      } catch (error) {
        await finishTelemetryResyncQueueJobFailed(
          job.id,
          {
            squadMatchId: job.details.squadMatchId,
            status: 'exception',
            resetBeforeSync: job.details.resetBeforeSync,
            recalculateAggregates: job.details.recalculateAggregates,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          error instanceof Error ? error.message : String(error)
        )

        const queue = await getTelemetryResyncQueueStats({ clanId: job.clanId })
        console.error('[TelemetryResyncWorker] job failed', {
          workerId,
          jobId: job.id,
          clanId: job.clanId,
          squadMatchId: job.details.squadMatchId,
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
          queue,
        })

        return true
      }
    },
    `job-${Date.now()}`,
    workerId
  )

  const durationMs = Date.now() - startTime
  const processed = jobResult !== null

  if (processed) {
    health.recordJobEnd(jobResult === true, durationMs)
  }

  return { processed, durationMs }
}

async function processOneLiveSyncJob(
  workerId: string,
  backpressure: BackpressureController,
  health: WorkerHealthMonitor
): Promise<{ processed: boolean; durationMs: number }> {
  const startTime = Date.now()

  const jobResult = await backpressure.processWithBackpressure(
    async () => {
      const job = await claimNextTelemetryLiveSyncJob(workerId)
      if (!job) {
        return null
      }

      console.info('[TelemetryLiveSyncWorker] job claimed', {
        workerId,
        jobId: job.id,
        clanId: job.clanId,
        squadMatchId: job.details.squadMatchId,
      })

      try {
        const syncResult = await syncTelemetryForSquadMatch({
          squadMatchId: job.details.squadMatchId,
          pubgMatchId: job.details.pubgMatchId,
          anyPlayerId: job.details.anyPlayerId,
          shard: job.details.shard,
          parserVersion: resolveLiveSyncParserVersion(),
          timeoutMs: resolveLiveSyncTimeoutMs(),
          maxAssetSizeBytes: resolveLiveSyncMaxAssetSizeBytes(),
        })

        if (syncResult.status === 'failed') {
          await finishTelemetryLiveSyncJobFailed(
            job.id,
            {
              squadMatchId: job.details.squadMatchId,
              status: syncResult.status,
              errorCode: syncResult.errorCode,
              errorMessage: syncResult.errorMessage,
              bytesDownloaded: syncResult.bytesDownloaded,
              contentLength: syncResult.contentLength,
            },
            `Telemetry live sync failed: ${syncResult.errorMessage ?? 'unknown error'}`
          )
          return true
        }

        const aggregateQueue = await enqueueTelemetryAggregateRecalcJob({
          clanId: job.clanId,
          requestedByResyncJobId: job.id,
        })

        await finishTelemetryLiveSyncJobSuccess(
          job.id,
          {
            squadMatchId: job.details.squadMatchId,
            status: syncResult.status,
            pubgMatchId: syncResult.pubgMatchId,
            bytesDownloaded: syncResult.bytesDownloaded,
            contentLength: syncResult.contentLength,
            aggregatesWarning: aggregateQueue.enqueued
              ? `Recalcul des aggregates queue (job: ${aggregateQueue.jobId})`
              : `Recalcul des aggregates deja en cours/queue (job: ${aggregateQueue.jobId})`,
          },
          `Telemetry live sync success (${job.details.squadMatchId})`
        )

        const queue = await getTelemetryLiveSyncQueueStats()
        console.info('[TelemetryLiveSyncWorker] job success', {
          workerId,
          jobId: job.id,
          clanId: job.clanId,
          squadMatchId: job.details.squadMatchId,
          durationMs: Date.now() - startTime,
          queue,
        })

        return true
      } catch (error) {
        await finishTelemetryLiveSyncJobFailed(
          job.id,
          {
            squadMatchId: job.details.squadMatchId,
            status: 'exception',
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          error instanceof Error ? error.message : String(error)
        )

        console.error('[TelemetryLiveSyncWorker] job failed', {
          workerId,
          jobId: job.id,
          clanId: job.clanId,
          squadMatchId: job.details.squadMatchId,
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        })

        return true
      }
    },
    `live-sync-job-${Date.now()}`,
    workerId
  )

  const durationMs = Date.now() - startTime
  const processed = jobResult !== null

  if (processed) {
    health.recordJobEnd(jobResult === true, durationMs)
  }

  return { processed, durationMs }
}

async function main() {
  const workerId = resolveWorkerId()
  const once = process.argv.includes('--once')
  const pollDelayMs = resolvePollDelayMs()
  const memoryThresholdPercent = resolveMemoryThresholdPercent()
  const memoryCriticalPercent = resolveMemoryCriticalPercent()
  const gcEnabled = resolveGcEnabled()
  const maxParallelWorkers = resolveMaxParallelWorkers()
  const stuckRecoveryMs = resolveStuckRecoveryMs()
  const singleInstanceMode = !once && maxParallelWorkers === 1
  const singleInstanceLockFilePath = resolveSingleInstanceLockFilePath()
  const singleInstanceLockStaleMs = resolveSingleInstanceLockStaleMs()
  let singleInstanceLockHandle: SingleInstanceLockHandle | null = null

  console.info('[TelemetryResyncWorker] started', {
    workerId,
    once,
    pollDelayMs,
    memoryThresholdPercent,
    memoryCriticalPercent,
    gcEnabled,
    maxParallelWorkers,
    stuckRecoveryMs,
    singleInstanceLockFilePath,
    singleInstanceLockStaleMs,
  })

  if (singleInstanceMode) {
    console.info('[TelemetryResyncWorker] single-instance lock check', {
      workerId,
      mode: 'exclusive',
      lockFile: singleInstanceLockFilePath,
      staleAfterMs: singleInstanceLockStaleMs,
    })

    const lockResult = await acquireSingleInstanceLock({
      filePath: singleInstanceLockFilePath,
      workerId,
      staleMs: singleInstanceLockStaleMs,
    })

    if (!lockResult.handle) {
      console.warn('[TelemetryResyncWorker] another worker is likely active, exiting to avoid parallel crashes', {
        workerId,
        blockedBy: lockResult.blockedBy,
        lockFile: singleInstanceLockFilePath,
      })
      return
    }

    singleInstanceLockHandle = lockResult.handle
    console.info('[TelemetryResyncWorker] single-instance lock acquired', {
      workerId,
      mode: 'exclusive',
      lockFile: singleInstanceLockFilePath,
    })
  }

  const recovered = await recoverStuckTelemetryResyncJobs(workerId, stuckRecoveryMs)
  if (recovered > 0) {
    console.warn('[TelemetryResyncWorker] recovered stuck jobs', { workerId, recovered, stuckRecoveryMs })
  }

  const recoveredLiveSync = await recoverStuckTelemetryLiveSyncJobs(workerId, stuckRecoveryMs)
  if (recoveredLiveSync > 0) {
    console.warn('[TelemetryLiveSyncWorker] recovered stuck jobs', {
      workerId,
      recovered: recoveredLiveSync,
      stuckRecoveryMs,
    })
  }

  const monitor = new MemoryMonitor({
    thresholdPercent: memoryThresholdPercent,
    criticalThresholdPercent: memoryCriticalPercent,
    gcEnabled,
  })

  const backpressure = new BackpressureController(monitor, {
    highPressureDelayMs: 5000,
    criticalPauseDelayMs: 2000,
  })

  const health = new WorkerHealthMonitor()

  let metricsLogInterval: NodeJS.Timeout | null = null

  // Log metrics every 30s in background
  if (!once) {
    metricsLogInterval = setInterval(() => {
      void (async () => {
        const metrics = health.getMetrics()
        const bpStatus = backpressure.getStatus()
        const queue = await getTelemetryResyncQueueStats()
        const liveSyncQueue = await getTelemetryLiveSyncQueueStats()
        console.info('[TelemetryResyncWorker] metrics', {
          ...metrics,
          memoryTrend: health.getMemoryTrend(),
          pressure: bpStatus,
          queue,
          liveSyncQueue,
        })
      })().catch((error) => {
        console.warn('[TelemetryResyncWorker] metrics snapshot failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }, 30000)
  }

  try {
    while (true) {
      const { processed } = await processOneJob(
        workerId,
        backpressure,
        health
      )

      if (processed) {
        continue
      }

      const { processed: processedLiveSync } = await processOneLiveSyncJob(
        workerId,
        backpressure,
        health
      )

      if (!processedLiveSync) {
        if (once) {
          break
        }
        await sleep(pollDelayMs)
        continue
      }
    }
  } catch (fatalError) {
    console.error('[TelemetryResyncWorker] fatal error', {
      error: fatalError instanceof Error ? fatalError.message : String(fatalError),
    })

    // Try to log final metrics
    const finalMetrics = health.getMetrics()
    console.info('[TelemetryResyncWorker] final metrics', finalMetrics)

    if (metricsLogInterval) {
      clearInterval(metricsLogInterval)
    }

    throw fatalError
  } finally {
    if (metricsLogInterval) {
      clearInterval(metricsLogInterval)
    }

    if (singleInstanceLockHandle) {
      await releaseSingleInstanceLock(singleInstanceLockHandle)
      singleInstanceLockHandle = null
      console.info('[TelemetryResyncWorker] single-instance lock released', {
        workerId,
        mode: 'exclusive',
        lockFile: singleInstanceLockFilePath,
      })
    }

    await prisma.$disconnect()
    const finalMetrics = health.getMetrics()
    console.info('[TelemetryResyncWorker] stopped', {
      workerId,
      ...finalMetrics,
    })
  }
}

process.on('uncaughtException', (error) => {
  console.error('[TelemetryResyncWorker] uncaughtException', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[TelemetryResyncWorker] unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })
  process.exit(1)
})

void main().catch(async (error) => {
  console.error('[TelemetryResyncWorker] fatal', {
    error: error instanceof Error ? error.message : String(error),
  })
  await prisma.$disconnect()
  process.exit(1)
})
