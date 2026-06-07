import { prisma } from '@/lib/prisma'

const TELEMETRY_RESYNC_QUEUE_ACTION = 'telemetry_resync_file'

export interface StaleCleanupResult {
  staleTotalDeleted: number
  failedTotalDeleted: number
  timeoutTotal: number
  summary: string
}

export async function cleanupStaleJobs(options?: {
  staleAgeHours?: number
  failedAgeHours?: number
  runningTimeoutHours?: number
}): Promise<StaleCleanupResult> {
  const staleAgeHours = options?.staleAgeHours ?? 24
  const failedAgeHours = options?.failedAgeHours ?? 7
  const runningTimeoutHours = options?.runningTimeoutHours ?? 4

  const staleThreshold = new Date(Date.now() - staleAgeHours * 60 * 60 * 1000)
  const failedThreshold = new Date(Date.now() - failedAgeHours * 60 * 60 * 1000)
  const runningThreshold = new Date(Date.now() - runningTimeoutHours * 60 * 60 * 1000)

  // Delete stale queued jobs (>24h without processing)
  const staleDeleted = await prisma.cronExecution.deleteMany({
    where: {
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'queued',
      createdAt: { lt: staleThreshold },
    },
  })

  // Delete old failed jobs (>7d without manual retry attempt)
  const failedDeleted = await prisma.cronExecution.deleteMany({
    where: {
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'failed',
      createdAt: { lt: failedThreshold },
    },
  })

  // Mark running jobs as failed if they've been running >4h (timeout)
  const runningTimeout = await prisma.cronExecution.updateMany({
    where: {
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'running',
      startedAt: { lt: runningThreshold },
    },
    data: {
      status: 'failed',
      message: `Timeout: job running for more than ${runningTimeoutHours}h`,
      finishedAt: new Date(),
    },
  })

  return {
    staleTotalDeleted: staleDeleted.count,
    failedTotalDeleted: failedDeleted.count,
    timeoutTotal: runningTimeout.count,
    summary:
      `Cleanup complete: ` +
      `${staleDeleted.count} stale queued jobs (>24h), ` +
      `${failedDeleted.count} old failed jobs (>7d), ` +
      `${runningTimeout.count} timeout jobs (>4h running)`,
  }
}

export async function cleanupClanStaleJobs(
  clanId: number,
  options?: {
    staleAgeHours?: number
    failedAgeHours?: number
    runningTimeoutHours?: number
  }
): Promise<StaleCleanupResult> {
  const staleAgeHours = options?.staleAgeHours ?? 24
  const failedAgeHours = options?.failedAgeHours ?? 7
  const runningTimeoutHours = options?.runningTimeoutHours ?? 4

  const staleThreshold = new Date(Date.now() - staleAgeHours * 60 * 60 * 1000)
  const failedThreshold = new Date(Date.now() - failedAgeHours * 60 * 60 * 1000)
  const runningThreshold = new Date(Date.now() - runningTimeoutHours * 60 * 60 * 1000)

  // Delete stale queued jobs for clan
  const staleDeleted = await prisma.cronExecution.deleteMany({
    where: {
      clanId,
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'queued',
      createdAt: { lt: staleThreshold },
    },
  })

  // Delete old failed jobs for clan
  const failedDeleted = await prisma.cronExecution.deleteMany({
    where: {
      clanId,
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'failed',
      createdAt: { lt: failedThreshold },
    },
  })

  // Mark running jobs as failed if they've been running >4h
  const runningTimeout = await prisma.cronExecution.updateMany({
    where: {
      clanId,
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'running',
      startedAt: { lt: runningThreshold },
    },
    data: {
      status: 'failed',
      message: `Timeout: job running for more than ${runningTimeoutHours}h`,
      finishedAt: new Date(),
    },
  })

  return {
    staleTotalDeleted: staleDeleted.count,
    failedTotalDeleted: failedDeleted.count,
    timeoutTotal: runningTimeout.count,
    summary:
      `Cleanup complete for clan ${clanId}: ` +
      `${staleDeleted.count} stale queued, ` +
      `${failedDeleted.count} old failed, ` +
      `${runningTimeout.count} timeout`,
  }
}
