import { NextRequest } from 'next/server'

import { enqueueTelemetryForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'
import {
  getTelemetryLiveSyncQueueStats,
  TELEMETRY_LIVE_SYNC_QUEUE_ACTION,
} from '@/lib/pubg-telemetry/live-sync-queue'
import { prisma } from '@/lib/prisma'
import { getActorMemberId, requireRole } from '@/middleware/auth-permission'

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

    const body = (await request.json().catch(() => null)) as { squadMatchIds?: unknown } | null

    if (!Array.isArray(body?.squadMatchIds)) {
      return Response.json({ error: 'squadMatchIds must be an array' }, { status: 400 })
    }

    const squadMatchIds = body.squadMatchIds.filter(
      (value): value is string => typeof value === 'string'
    )

    if (squadMatchIds.length === 0) {
      return Response.json({ error: 'No squad match selected' }, { status: 400 })
    }

    const actorMemberId = await getActorMemberId(request)
    const result = await enqueueTelemetryForSelectedSquadMatches(
      parsedClanId,
      squadMatchIds,
      actorMemberId
    )

    return Response.json({
      ok: true,
      clanId: parsedClanId,
      ...result,
    })
  } catch (error) {
    console.error('Manual telemetry enqueue failed:', error)
    return Response.json(
      { error: 'Failed to enqueue telemetry for selected matches' },
      { status: 500 }
    )
  }
}

// Lets the "Direct Sync" panel poll progress after enqueueing — mirrors the live
// status widget already used by "Queue Resync" mode (telemetry_resync_file), but
// reads the telemetry_live_sync queue instead.
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

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const [queue, recentJobs] = await Promise.all([
      getTelemetryLiveSyncQueueStats({ clanId: parsedClanId }),
      prisma.cronExecution.findMany({
        where: {
          clanId: parsedClanId,
          action: TELEMETRY_LIVE_SYNC_QUEUE_ACTION,
        },
        select: {
          id: true,
          status: true,
          message: true,
          createdAt: true,
          finishedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    return Response.json({
      ok: true,
      clanId: parsedClanId,
      queue,
      recentJobs,
    })
  } catch (error) {
    console.error('Manual telemetry enqueue status failed:', error)
    return Response.json(
      { error: 'Failed to fetch telemetry enqueue status' },
      { status: 500 }
    )
  }
}
