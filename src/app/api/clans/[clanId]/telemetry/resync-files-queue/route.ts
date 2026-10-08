import { NextRequest } from 'next/server'

import { withAdminActionLog } from '@/lib/admin-action-log'
import { enqueueTelemetryResyncJobs } from '@/lib/pubg-telemetry/resync-queue'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
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

    const body = (await request.json().catch(() => null)) as
      | {
          squadMatchIds?: unknown
          resetBeforeSync?: unknown
          recalculateAggregates?: unknown
        }
      | null

    if (!Array.isArray(body?.squadMatchIds)) {
      return Response.json({ error: 'squadMatchIds must be an array' }, { status: 400 })
    }

    const squadMatchIds = body.squadMatchIds.filter(
      (value): value is string => typeof value === 'string'
    )

    if (squadMatchIds.length === 0) {
      return Response.json({ error: 'No squad match selected' }, { status: 400 })
    }

    const resetBeforeSync = body.resetBeforeSync === true
    const recalculateAggregates = body.recalculateAggregates !== false

    const queueResult = await enqueueTelemetryResyncJobs({
      clanId: parsedClanId,
      squadMatchIds,
      resetBeforeSync,
      recalculateAggregates,
    })

    return Response.json({
      ok: true,
      clanId: parsedClanId,
      resetBeforeSync,
      recalculateAggregates,
      ...queueResult,
    })
  } catch (error) {
    console.error('Queue telemetry resync jobs failed:', error)
    return Response.json({ error: 'Failed to queue telemetry resync jobs' }, { status: 500 })
  }
}

export const POST = withAdminActionLog('clans/[clanId]/telemetry/resync-files-queue', handlePost)
