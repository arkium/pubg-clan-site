import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/middleware/auth-permission'
import { reorderQueueByPriority, getQueuePriority } from '@/lib/pubg-telemetry/queue-priority'
import {
  cleanupClanStaleJobs,
  type StaleCleanupResult,
} from '@/lib/pubg-telemetry/stale-cleanup'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type QueueCleanupAction = 'cleanup-stale' | 'reorder-priority' | 'cancel-old' | 'cleanup-failed'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const body = (await request.json().catch(() => null)) as {
      action?: unknown
      maxAgeHours?: unknown
      cancelMaxAgeMs?: unknown
    } | null

    const action = body?.action as QueueCleanupAction | undefined
    const maxAgeHours = typeof body?.maxAgeHours === 'number' ? body.maxAgeHours : undefined
    const cancelMaxAgeMs = typeof body?.cancelMaxAgeMs === 'number' ? body.cancelMaxAgeMs : undefined

    if (!action) {
      return NextResponse.json(
        { error: 'action is required: cleanup-stale | reorder-priority | cancel-old' },
        { status: 400 }
      )
    }

    if (action === 'reorder-priority') {
      const result = await reorderQueueByPriority(parsedClanId)
      return NextResponse.json({
        ok: true,
        clanId: parsedClanId,
        action,
        reordered: result.reordered,
        message: result.summary,
      })
    }

    if (action === 'cleanup-stale') {
      const result = await cleanupClanStaleJobs(parsedClanId, {
        staleAgeHours: maxAgeHours ?? 24,
        failedAgeHours: 7,
        runningTimeoutHours: 4,
      })

      return NextResponse.json({
        ok: true,
        clanId: parsedClanId,
        action,
        ...result,
      })
    }

    if (action === 'cancel-old') {
      const cancelThreshold = cancelMaxAgeMs
        ? new Date(Date.now() - cancelMaxAgeMs)
        : new Date(Date.now() - 60 * 60 * 1000) // 1 hour default

      const cancelled = await prisma.cronExecution.updateMany({
        where: {
          clanId: parsedClanId,
          action: 'telemetry_resync_file',
          status: 'running',
          startedAt: { lt: cancelThreshold },
        },
        data: {
          status: 'failed',
          message: 'Cancelled: exceeded max running time',
          finishedAt: new Date(),
        },
      })

      return NextResponse.json({
        ok: true,
        clanId: parsedClanId,
        action,
        cancelled: cancelled.count,
        message: `Cancelled ${cancelled.count} jobs running longer than ${cancelMaxAgeMs ? cancelMaxAgeMs / 1000 : 3600} seconds`,
      })
    }

    if (action === 'cleanup-failed') {
      const result = await cleanupClanStaleJobs(parsedClanId, {
        staleAgeHours: 999999, // Don't delete stale queued jobs
        failedAgeHours: maxAgeHours ?? 1, // Default: 1 hour
        runningTimeoutHours: 999999, // Don't timeout running jobs
      })

      return NextResponse.json({
        ok: true,
        clanId: parsedClanId,
        action,
        deleted: result.failedTotalDeleted,
        message: `Deleted ${result.failedTotalDeleted} failed jobs older than ${maxAgeHours ?? 1}h`,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Queue cleanup failed:', error)
    return NextResponse.json(
      { error: 'Failed to process queue cleanup' },
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
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const priority = await getQueuePriority(parsedClanId)

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

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      queue: {
        queued,
        running,
        success,
        failed,
        total: queued + running + success + failed,
      },
      priority: {
        nextJobId: priority.nextJobId,
        nextJobMatchId: priority.nextJobMatchId,
        queuedCount: priority.queuedCount,
      },
      availableActions: {
        'reorder-priority':
          'Sort queued jobs by match recency (recent matches first)',
        'cleanup-stale': 'Delete jobs queued for >24h',
        'cleanup-failed': 'Delete failed jobs older than specified hours',
        'cancel-old': 'Cancel running jobs older than specified milliseconds',
      },
    })
  } catch (error) {
    console.error('Queue cleanup GET failed:', error)
    return NextResponse.json(
      { error: 'Failed to get queue status' },
      { status: 500 }
    )
  }
}
