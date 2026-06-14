import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

function truncateMessage(message: string, maxLength = 180): string {
  if (message.length <= maxLength) return message
  return `${message.slice(0, maxLength - 3)}...`
}

export const TELEMETRY_AGGREGATE_RECALC_QUEUE_ACTION = 'telemetry_recalc_aggregates'

type AggregateQueueDetails = {
  clanId: number
  requestedByResyncJobId: string | null
}

function parseAggregateQueueDetails(details: Prisma.JsonValue | null): AggregateQueueDetails | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null
  }

  const record = details as Record<string, unknown>
  const clanId = record.clanId
  if (typeof clanId !== 'number' || !Number.isInteger(clanId) || clanId <= 0) {
    return null
  }

  const requestedByResyncJobIdRaw = record.requestedByResyncJobId

  return {
    clanId,
    requestedByResyncJobId:
      typeof requestedByResyncJobIdRaw === 'string' && requestedByResyncJobIdRaw.trim().length > 0
        ? requestedByResyncJobIdRaw.trim()
        : null,
  }
}

export async function enqueueTelemetryAggregateRecalcJob(input: {
  clanId: number
  requestedByResyncJobId?: string | null
  triggeredBy?: number | null
}): Promise<{ enqueued: boolean; jobId: string | null }> {
  const existing = await prisma.cronExecution.findFirst({
    where: {
      clanId: input.clanId,
      action: TELEMETRY_AGGREGATE_RECALC_QUEUE_ACTION,
      status: {
        in: ['queued', 'running'],
      },
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  })

  if (existing) {
    return { enqueued: false, jobId: existing.id }
  }

  const details: AggregateQueueDetails = {
    clanId: input.clanId,
    requestedByResyncJobId: input.requestedByResyncJobId ?? null,
  }

  const created = await prisma.cronExecution.create({
    data: {
      clanId: input.clanId,
      action: TELEMETRY_AGGREGATE_RECALC_QUEUE_ACTION,
      status: 'queued',
      triggeredBy: input.triggeredBy ?? null,
      source: 'worker',
      message: 'Queued for telemetry aggregate recalc worker',
      details,
    },
    select: { id: true },
  })

  return { enqueued: true, jobId: created.id }
}

export type TelemetryAggregateRecalcQueueJob = {
  id: string
  clanId: number
  startedAt: Date
  details: AggregateQueueDetails
}

export async function recoverStuckTelemetryAggregateRecalcJobs(
  workerId: string,
  stuckThresholdMs = 10 * 60 * 1000
): Promise<number> {
  const cutoff = new Date(Date.now() - stuckThresholdMs)

  const result = await prisma.cronExecution.updateMany({
    where: {
      action: TELEMETRY_AGGREGATE_RECALC_QUEUE_ACTION,
      status: 'running',
      startedAt: { lt: cutoff },
    },
    data: {
      status: 'queued',
      source: 'worker',
      message: `Reset to queued by aggregate worker ${workerId} (stuck recovery)`,
      startedAt: new Date(),
    },
  })

  return result.count
}

export async function claimNextTelemetryAggregateRecalcQueueJob(workerId: string) {
  const nextJob = await prisma.cronExecution.findFirst({
    where: {
      action: TELEMETRY_AGGREGATE_RECALC_QUEUE_ACTION,
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
      message: `Claimed by telemetry aggregate worker ${workerId}`,
      startedAt: new Date(),
    },
  })

  if (claimed.count !== 1) {
    return null
  }

  const details = parseAggregateQueueDetails(nextJob.details)
  if (!details) {
    await prisma.cronExecution.update({
      where: { id: nextJob.id },
      data: {
        status: 'failed',
        source: 'worker',
        message: 'Aggregate queue item details are invalid',
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
  } satisfies TelemetryAggregateRecalcQueueJob
}

export async function finishTelemetryAggregateRecalcQueueJobSuccess(
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

export async function finishTelemetryAggregateRecalcQueueJobFailed(
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
