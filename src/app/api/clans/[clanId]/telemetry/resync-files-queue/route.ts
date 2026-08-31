import { NextRequest } from 'next/server'

import { enqueueTelemetryResyncJobs } from '@/lib/pubg-telemetry/resync-queue'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
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