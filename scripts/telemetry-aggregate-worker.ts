import 'dotenv/config'

import { open, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'

import { Prisma } from '@prisma/client'

import {
  TELEMETRY_AGGREGATE_RECALC_QUEUE_ACTION,
  claimNextTelemetryAggregateRecalcQueueJob,
  finishTelemetryAggregateRecalcQueueJobFailed,
  finishTelemetryAggregateRecalcQueueJobSuccess,
  recoverStuckTelemetryAggregateRecalcJobs,
} from '@/lib/pubg-telemetry/aggregate-recalc-queue'
import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'
import { prisma } from '@/lib/prisma'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolvePollDelayMs() {
  const value = Number(process.env.TELEMETRY_AGGREGATE_WORKER_POLL_MS ?? '3000')
  if (!Number.isFinite(value) || value < 250) {
    return 3000
  }

  return Math.floor(value)
}

function resolveWorkerId() {
  const envId = process.env.TELEMETRY_AGGREGATE_WORKER_ID?.trim()
  if (envId && envId.length > 0) {
    return envId
  }

  return `aggregate-pid-${process.pid}`
}

function resolveMaxParallelWorkers(): number {
  const value = Number(process.env.TELEMETRY_AGGREGATE_WORKER_MAX_PARALLEL ?? '1')
  if (!Number.isFinite(value) || value < 1 || value > 10) {
    return 1
  }

  return Math.floor(value)
}

function resolveSingleInstanceLockFilePath(): string {
  const configured = process.env.TELEMETRY_AGGREGATE_WORKER_LOCK_FILE?.trim()
  if (configured && configured.length > 0) {
    return path.resolve(process.cwd(), configured)
  }

  return path.resolve(process.cwd(), '.telemetry-aggregate-worker.lock')
}

function resolveSingleInstanceLockStaleMs(): number {
  const value = Number(process.env.TELEMETRY_AGGREGATE_WORKER_LOCK_STALE_MS ?? '1800000')
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

function extractWorkerIdFromMessage(message: string | null | undefined): string | null {
  if (!message) return null
  const match = /Claimed by telemetry aggregate worker\s+(.+)$/u.exec(message.trim())
  if (!match?.[1]) return null
  return match[1].trim()
}

async function getLikelyActiveOtherWorkers(windowMs: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - windowMs)
  const rows = await prisma.cronExecution.findMany({
    where: {
      action: TELEMETRY_AGGREGATE_RECALC_QUEUE_ACTION,
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

async function processOneJob(workerId: string): Promise<boolean> {
  const job = await claimNextTelemetryAggregateRecalcQueueJob(workerId)
  if (!job) {
    return false
  }

  const startedAt = Date.now()
  console.info('[TelemetryAggregateWorker] job claimed', {
    workerId,
    jobId: job.id,
    clanId: job.clanId,
    requestedByResyncJobId: job.details.requestedByResyncJobId,
  })

  try {
    const aggregateResult = await recalculateTelemetryPeriodAggregatesForClan(job.clanId)
    const details: Prisma.JsonObject = {
      clanId: job.clanId,
      requestedByResyncJobId: job.details.requestedByResyncJobId,
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
      durationMs: Date.now() - startedAt,
    }

    await finishTelemetryAggregateRecalcQueueJobSuccess(
      job.id,
      details,
      `Telemetry aggregate recalculation success (clan ${job.clanId})`
    )

    console.info('[TelemetryAggregateWorker] job success', {
      workerId,
      jobId: job.id,
      clanId: job.clanId,
      durationMs: Date.now() - startedAt,
    })

    return true
  } catch (error) {
    await finishTelemetryAggregateRecalcQueueJobFailed(
      job.id,
      {
        clanId: job.clanId,
        requestedByResyncJobId: job.details.requestedByResyncJobId,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      error instanceof Error ? error.message : String(error)
    )

    console.error('[TelemetryAggregateWorker] job failed', {
      workerId,
      jobId: job.id,
      clanId: job.clanId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })

    return true
  }
}

async function main() {
  const workerId = resolveWorkerId()
  const once = process.argv.includes('--once')
  const pollDelayMs = resolvePollDelayMs()
  const maxParallelWorkers = resolveMaxParallelWorkers()
  const singleInstanceMode = !once && maxParallelWorkers === 1
  const singleInstanceLockFilePath = resolveSingleInstanceLockFilePath()
  const singleInstanceLockStaleMs = resolveSingleInstanceLockStaleMs()
  let singleInstanceLockHandle: SingleInstanceLockHandle | null = null

  console.info('[TelemetryAggregateWorker] started', {
    workerId,
    once,
    pollDelayMs,
    maxParallelWorkers,
    singleInstanceLockFilePath,
    singleInstanceLockStaleMs,
  })

  if (singleInstanceMode) {
    console.info('[TelemetryAggregateWorker] single-instance lock check', {
      workerId,
      mode: 'exclusive',
      lockFile: singleInstanceLockFilePath,
      staleAfterMs: singleInstanceLockStaleMs,
    })

    const likelyActiveWorkers = await getLikelyActiveOtherWorkers(45_000)
    if (likelyActiveWorkers.length > 0) {
      console.warn('[TelemetryAggregateWorker] another worker is likely active, exiting to avoid parallel crashes', {
        workerId,
        likelyActiveWorkers,
      })
      return
    }

    const lockResult = await acquireSingleInstanceLock({
      filePath: singleInstanceLockFilePath,
      workerId,
      staleMs: singleInstanceLockStaleMs,
    })

    if (!lockResult.handle) {
      console.warn('[TelemetryAggregateWorker] another worker lock is active, exiting', {
        workerId,
        blockedBy: lockResult.blockedBy,
        lockFile: singleInstanceLockFilePath,
      })
      return
    }

    singleInstanceLockHandle = lockResult.handle
    console.info('[TelemetryAggregateWorker] single-instance lock acquired', {
      workerId,
      mode: 'exclusive',
      lockFile: singleInstanceLockFilePath,
    })
  }

  const recovered = await recoverStuckTelemetryAggregateRecalcJobs(workerId)
  if (recovered > 0) {
    console.warn('[TelemetryAggregateWorker] recovered stuck jobs', { workerId, recovered })
  }

  try {
    while (true) {
      const processed = await processOneJob(workerId)
      if (!processed) {
        if (once) {
          break
        }
        await sleep(pollDelayMs)
      }
    }
  } finally {
    if (singleInstanceLockHandle) {
      await releaseSingleInstanceLock(singleInstanceLockHandle)
      singleInstanceLockHandle = null
      console.info('[TelemetryAggregateWorker] single-instance lock released', {
        workerId,
        mode: 'exclusive',
        lockFile: singleInstanceLockFilePath,
      })
    }

    await prisma.$disconnect()
    console.info('[TelemetryAggregateWorker] stopped', { workerId })
  }
}

process.on('uncaughtException', (error) => {
  console.error('[TelemetryAggregateWorker] uncaughtException', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[TelemetryAggregateWorker] unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })
  process.exit(1)
})

void main().catch(async (error) => {
  console.error('[TelemetryAggregateWorker] fatal', {
    error: error instanceof Error ? error.message : String(error),
  })
  await prisma.$disconnect()
  process.exit(1)
})
