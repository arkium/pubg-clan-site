import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { getTelemetryFixtureCaptureMaxBytes } from '@/lib/pubg-telemetry/fixture-capture'
import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'
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
          try {
            const aggregateResult = await recalculateTelemetryPeriodAggregatesForClan(
              job.clanId
            )
            aggregates = {
              periodsUpdated: aggregateResult.summaries.length,
              memberTelemetryRows: aggregateResult.summaries.reduce(
                (sum, summary) => sum + summary.memberTelemetryRows,
                0
              ),
              memberWeaponRows: aggregateResult.summaries.reduce(
                (sum, summary) => sum + summary.memberWeaponRows,
                0
              ),
              clanSynergyRows: aggregateResult.summaries.reduce(
                (sum, summary) => sum + summary.clanSynergyRows,
                0
              ),
            }
          } catch (aggregateError) {
            aggregatesWarning =
              aggregateError instanceof Error
                ? aggregateError.message
                : 'Recalcul des aggregates telemetry en echec'
          }
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

async function main() {
  const workerId = resolveWorkerId()
  const once = process.argv.includes('--once')
  const pollDelayMs = resolvePollDelayMs()
  const memoryThresholdPercent = resolveMemoryThresholdPercent()
  const memoryCriticalPercent = resolveMemoryCriticalPercent()
  const gcEnabled = resolveGcEnabled()

  console.info('[TelemetryResyncWorker] started', {
    workerId,
    once,
    pollDelayMs,
    memoryThresholdPercent,
    memoryCriticalPercent,
    gcEnabled,
  })

  const recovered = await recoverStuckTelemetryResyncJobs(workerId)
  if (recovered > 0) {
    console.warn('[TelemetryResyncWorker] recovered stuck jobs', { workerId, recovered })
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
        console.info('[TelemetryResyncWorker] metrics', {
          ...metrics,
          memoryTrend: health.getMemoryTrend(),
          pressure: bpStatus,
          queue,
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
      const { processed } = await processOneJob(workerId, backpressure, health)

      if (!processed) {
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
