import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

function truncateMessage(message: string, maxLength = 180): string {
  if (message.length <= maxLength) return message
  return `${message.slice(0, maxLength - 3)}...`
}

export const TELEMETRY_RESYNC_QUEUE_ACTION = 'telemetry_resync_file'

export type TelemetryResyncQueueStats = {
  queued: number
  running: number
  remaining: number
  success: number
  failed: number
  total: number
}

type QueueDetails = {
  squadMatchId: string
  resetBeforeSync: boolean
  recalculateAggregates: boolean
}

function parseQueueDetails(details: Prisma.JsonValue | null): QueueDetails | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null
  }

  const record = details as Record<string, unknown>
  const squadMatchId = record.squadMatchId
  if (typeof squadMatchId !== 'string' || squadMatchId.trim().length === 0) {
    return null
  }

  return {
    squadMatchId: squadMatchId.trim(),
    resetBeforeSync: record.resetBeforeSync === true,
    recalculateAggregates: record.recalculateAggregates === true,
  }
}

export async function getTelemetryResyncQueueStats(input?: {
  clanId?: number
}): Promise<TelemetryResyncQueueStats> {
  const whereBase = {
    action: TELEMETRY_RESYNC_QUEUE_ACTION,
    ...(typeof input?.clanId === 'number' ? { clanId: input.clanId } : {}),
  }

  const [queued, running, success, failed] = await Promise.all([
    prisma.cronExecution.count({
      where: {
        ...whereBase,
        status: 'queued',
      },
    }),
    prisma.cronExecution.count({
      where: {
        ...whereBase,
        status: 'running',
      },
    }),
    prisma.cronExecution.count({
      where: {
        ...whereBase,
        status: 'success',
      },
    }),
    prisma.cronExecution.count({
      where: {
        ...whereBase,
        status: 'failed',
      },
    }),
  ])

  return {
    queued,
    running,
    remaining: queued + running,
    success,
    failed,
    total: queued + running + success + failed,
  }
}

export async function enqueueTelemetryResyncJobs(input: {
  clanId: number
  squadMatchIds: string[]
  resetBeforeSync: boolean
  recalculateAggregates: boolean
  triggeredBy?: number | null
}) {
  const sanitizedIds = Array.from(
    new Set(
      input.squadMatchIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  )

  if (sanitizedIds.length === 0) {
    return {
      requestedCount: input.squadMatchIds.length,
      queuedCount: 0,
      alreadyQueuedCount: 0,
      queuedMatchIds: [] as string[],
      alreadyQueuedMatchIds: [] as string[],
    }
  }

  const existingJobs = await prisma.cronExecution.findMany({
    where: {
      clanId: input.clanId,
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: {
        in: ['queued', 'running'],
      },
    },
    select: {
      details: true,
    },
    take: 1000,
    orderBy: {
      createdAt: 'desc',
    },
  })

  const alreadyQueuedIds = new Set<string>()
  for (const job of existingJobs) {
    const details = parseQueueDetails(job.details)
    if (details?.squadMatchId) {
      alreadyQueuedIds.add(details.squadMatchId)
    }
  }

  const queuedMatchIds: string[] = []
  const alreadyQueuedMatchIds: string[] = []

  for (const squadMatchId of sanitizedIds) {
    if (alreadyQueuedIds.has(squadMatchId)) {
      alreadyQueuedMatchIds.push(squadMatchId)
      continue
    }

    const details: QueueDetails = {
      squadMatchId,
      resetBeforeSync: input.resetBeforeSync,
      recalculateAggregates: input.recalculateAggregates,
    }

    await prisma.cronExecution.create({
      data: {
        clanId: input.clanId,
        action: TELEMETRY_RESYNC_QUEUE_ACTION,
        status: 'queued',
        triggeredBy: input.triggeredBy ?? null,
        source: 'manual',
        message: 'Queued for telemetry file resync worker',
        details,
      },
    })

    queuedMatchIds.push(squadMatchId)
    alreadyQueuedIds.add(squadMatchId)
  }

  const queue = await getTelemetryResyncQueueStats({ clanId: input.clanId })

  return {
    requestedCount: input.squadMatchIds.length,
    queuedCount: queuedMatchIds.length,
    alreadyQueuedCount: alreadyQueuedMatchIds.length,
    queuedMatchIds,
    alreadyQueuedMatchIds,
    queue,
  }
}

export type TelemetryResyncQueueJob = {
  id: string
  clanId: number
  startedAt: Date
  details: QueueDetails
}

export async function recoverStuckTelemetryResyncJobs(
  workerId: string,
  stuckThresholdMs = 10 * 60 * 1000
): Promise<number> {
  const cutoff = new Date(Date.now() - stuckThresholdMs)

  const result = await prisma.cronExecution.updateMany({
    where: {
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'running',
      startedAt: { lt: cutoff },
    },
    data: {
      status: 'queued',
      source: 'worker',
      message: `Reset to queued by worker ${workerId} (stuck recovery)`,
      startedAt: new Date(),
    },
  })

  return result.count
}

export async function claimNextTelemetryResyncQueueJob(workerId: string) {
  const nextJob = await prisma.cronExecution.findFirst({
    where: {
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'queued',
    },
    select: {
      id: true,
      clanId: true,
      startedAt: true,
      details: true,
    },
    orderBy: {
      startedAt: 'asc',
    },
  })

  if (!nextJob) {
    return null
  }

  const claimed = await prisma.cronExecution.updateMany({
    where: {
      id: nextJob.id,
      status: 'queued',
    },
    data: {
      status: 'running',
      source: 'worker',
      message: `Claimed by telemetry worker ${workerId}`,
      startedAt: new Date(),
    },
  })

  if (claimed.count !== 1) {
    return null
  }

  const details = parseQueueDetails(nextJob.details)
  if (!details) {
    await prisma.cronExecution.update({
      where: { id: nextJob.id },
      data: {
        status: 'failed',
        source: 'worker',
        message: 'Queue item details are invalid',
        finishedAt: new Date(),
        details: {
          ...(typeof nextJob.details === 'object' && nextJob.details ? (nextJob.details as object) : {}),
          queueError: 'QUEUE_DETAILS_INVALID',
        },
      },
    })
    return null
  }

  return {
    id: nextJob.id,
    clanId: nextJob.clanId,
    startedAt: nextJob.startedAt,
    details,
  } satisfies TelemetryResyncQueueJob
}

export async function finishTelemetryResyncQueueJobSuccess(
  jobId: string,
  details: Prisma.JsonObject,
  message: string
) {
  await prisma.cronExecution.update({
    where: { id: jobId },
    data: {
      status: 'success',
      source: 'worker',
      message: truncateMessage(message),
      finishedAt: new Date(),
      details,
    },
  })
}

export async function finishTelemetryResyncQueueJobFailed(
  jobId: string,
  details: Prisma.JsonObject,
  message: string
) {
  await prisma.cronExecution.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      source: 'worker',
      message: truncateMessage(message),
      finishedAt: new Date(),
      details,
    },
  })
}