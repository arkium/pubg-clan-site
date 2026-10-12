import { withAdminActionLog } from '@/lib/admin-action-log'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { cleanupClanStaleJobs } from '@/lib/pubg-telemetry/stale-cleanup'

/**
 * Maintenance de la file de retraitement de fichiers d'un clan : `cleanup-stale` (Santé des données) et `cancel-old`
 * (soirée). Les actions `reorder-priority` et `cleanup-failed`, sans appelant, ont été retirées le 2026-10-12
 * (docs/TODO/administration.md §8).
 */

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type QueueCleanupAction = 'cleanup-stale' | 'cancel-old'

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
      action?: unknown
      maxAgeHours?: unknown
      cancelMaxAgeMs?: unknown
    } | null

    const action = body?.action as QueueCleanupAction | undefined
    const maxAgeHours = typeof body?.maxAgeHours === 'number' ? body.maxAgeHours : undefined
    const cancelMaxAgeMs = typeof body?.cancelMaxAgeMs === 'number' ? body.cancelMaxAgeMs : undefined

    if (!action) {
      return Response.json(
        { error: 'action is required: cleanup-stale | cancel-old' },
        { status: 400 }
      )
    }

    if (action === 'cleanup-stale') {
      const result = await cleanupClanStaleJobs(parsedClanId, {
        staleAgeHours: maxAgeHours ?? 24,
        failedAgeHours: 7,
        runningTimeoutHours: 4,
      })

      return Response.json({
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

      return Response.json({
        ok: true,
        clanId: parsedClanId,
        action,
        cancelled: cancelled.count,
        message: `Cancelled ${cancelled.count} jobs running longer than ${cancelMaxAgeMs ? cancelMaxAgeMs / 1000 : 3600} seconds`,
      })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Queue cleanup failed:', error)
    return Response.json(
      { error: 'Failed to process queue cleanup' },
      { status: 500 }
    )
  }
}

export const POST = withAdminActionLog('clans/[clanId]/telemetry/queue-cleanup', handlePost)
