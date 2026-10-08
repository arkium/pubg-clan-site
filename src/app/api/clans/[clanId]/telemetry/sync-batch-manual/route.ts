import { NextRequest } from 'next/server'

import { withAdminActionLog } from '@/lib/admin-action-log'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { enqueueTelemetryResyncJobs } from '@/lib/pubg-telemetry/resync-queue'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseBatchSize(value: string | null): number {
  const parsed = Number(value ?? '5')
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    return 5
  }
  return parsed
}

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requirePlatformAdmin(request)
    if (roleError) {
      return roleError
    }

    const body = (await request.json().catch(() => null)) as {
      squadMatchIds?: unknown
      resetBeforeSync?: unknown
      recalculateAggregates?: unknown
      batchLabel?: unknown
    } | null

    if (!Array.isArray(body?.squadMatchIds)) {
      return Response.json(
        { error: 'squadMatchIds must be an array of strings' },
        { status: 400 }
      )
    }

    const squadMatchIds = body.squadMatchIds
      .filter((value): value is string => typeof value === 'string')
      .slice(0, 50)

    if (squadMatchIds.length === 0) {
      return Response.json({ error: 'No valid squad match ids' }, { status: 400 })
    }

    const resetBeforeSync = body?.resetBeforeSync === true
    const recalculateAggregates = body?.recalculateAggregates !== false
    const batchLabel =
      typeof body?.batchLabel === 'string'
        ? body.batchLabel.slice(0, 100)
        : `Manual sync ${new Date().toISOString().split('T')[0]}`

    // Enqueue jobs
    const enqueueResult = await enqueueTelemetryResyncJobs({
      clanId: parsedClanId,
      squadMatchIds,
      resetBeforeSync,
      recalculateAggregates,
      triggeredBy: null,
    })

    // Get queue status
    const queuedCount = await prisma.cronExecution.count({
      where: {
        clanId: parsedClanId,
        action: 'telemetry_resync_file',
        status: { in: ['queued', 'running'] },
      },
    })

    const successCount = await prisma.cronExecution.count({
      where: {
        clanId: parsedClanId,
        action: 'telemetry_resync_file',
        status: 'success',
      },
    })

    const failedCount = await prisma.cronExecution.count({
      where: {
        clanId: parsedClanId,
        action: 'telemetry_resync_file',
        status: 'failed',
      },
    })

    return Response.json({
      ok: true,
      batchId: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      batchLabel,
      clanId: parsedClanId,
      enqueue: {
        requestedCount: squadMatchIds.length,
        queuedCount: enqueueResult.queuedCount,
        alreadyQueuedCount: enqueueResult.alreadyQueuedCount,
      },
      queue: {
        pendingCount: queuedCount,
        successCount,
        failedCount,
      },
      resetBeforeSync,
      recalculateAggregates,
      message: `Enqueued ${enqueueResult.queuedCount} matches.`,
    })
  } catch (error) {
    console.error('Batch manual sync failed:', error)
    return Response.json(
      { error: 'Failed to enqueue telemetry resync batch' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requirePlatformAdmin(request)
    if (roleError) {
      return roleError
    }

    // Get queue stats
    const [queued, running, success, failed] = await Promise.all([
      prisma.cronExecution.count({
        where: {
          clanId: parsedClanId,
          action: 'telemetry_resync_file',
          status: 'queued',
        },
      }),
      prisma.cronExecution.count({
        where: {
          clanId: parsedClanId,
          action: 'telemetry_resync_file',
          status: 'running',
        },
      }),
      prisma.cronExecution.count({
        where: {
          clanId: parsedClanId,
          action: 'telemetry_resync_file',
          status: 'success',
        },
      }),
      prisma.cronExecution.count({
        where: {
          clanId: parsedClanId,
          action: 'telemetry_resync_file',
          status: 'failed',
        },
      }),
    ])

    // Get recent jobs
    const recentJobs = await prisma.cronExecution.findMany({
      where: {
        clanId: parsedClanId,
        action: 'telemetry_resync_file',
      },
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return Response.json({
      ok: true,
      clanId: parsedClanId,
      queue: {
        queued,
        running,
        success,
        failed,
        total: queued + running + success + failed,
      },
      recentJobs: recentJobs.map((job) => ({
        id: job.id,
        status: job.status,
        message: job.message,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        duration: job.finishedAt && job.startedAt ?
          (job.finishedAt.getTime() - job.startedAt.getTime()) / 1000 :
          null,
      })),
    })
  } catch (error) {
    console.error('Batch sync status failed:', error)
    return Response.json(
      { error: 'Failed to fetch batch sync status' },
      { status: 500 }
    )
  }
}

export const POST = withAdminActionLog('clans/[clanId]/telemetry/sync-batch-manual', handlePost)
