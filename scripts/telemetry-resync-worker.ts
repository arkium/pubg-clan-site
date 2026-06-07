import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { getTelemetryFixtureCaptureMaxBytes } from '@/lib/pubg-telemetry/fixture-capture'
import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'
import {
  claimNextTelemetryResyncQueueJob,
  finishTelemetryResyncQueueJobFailed,
  finishTelemetryResyncQueueJobSuccess,
} from '@/lib/pubg-telemetry/resync-queue'
import {
  resolveCaptureDirectory,
  resyncTelemetryFromCapturedFile,
} from '@/lib/pubg-telemetry/resync-files'
import { prisma } from '@/lib/prisma'

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

async function processOneJob(workerId: string) {
  const job = await claimNextTelemetryResyncQueueJob(workerId)
  if (!job) {
    return false
  }

  const captureDir = resolveCaptureDirectory()
  const maxResyncFileBytes = getTelemetryFixtureCaptureMaxBytes()

  try {
    if (job.details.resetBeforeSync) {
      await prisma.squadMatchTelemetry.deleteMany({
        where: {
          squadMatchId: job.details.squadMatchId,
        },
      })
    }

    const syncFromFile = await resyncTelemetryFromCapturedFile({
      clanId: job.clanId,
      squadMatchId: job.details.squadMatchId,
      captureDir,
      maxResyncFileBytes,
    })

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
        const aggregateResult = await recalculateTelemetryPeriodAggregatesForClan(job.clanId)
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

    return true
  }
}

async function main() {
  const workerId = resolveWorkerId()
  const once = process.argv.includes('--once')
  const pollDelayMs = resolvePollDelayMs()

  console.info('[TelemetryResyncWorker] started', {
    workerId,
    once,
    pollDelayMs,
  })

  while (true) {
    const processed = await processOneJob(workerId)

    if (!processed) {
      if (once) {
        break
      }
      await sleep(pollDelayMs)
      continue
    }
  }

  await prisma.$disconnect()
  console.info('[TelemetryResyncWorker] stopped', {
    workerId,
  })
}

void main().catch(async (error) => {
  console.error('[TelemetryResyncWorker] fatal', {
    error: error instanceof Error ? error.message : String(error),
  })
  await prisma.$disconnect()
  process.exit(1)
})
