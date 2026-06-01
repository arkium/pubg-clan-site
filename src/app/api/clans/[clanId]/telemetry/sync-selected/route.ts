import { NextResponse } from 'next/server'

import { syncTelemetryForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'
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
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const body = (await request.json().catch(() => null)) as
      | { squadMatchIds?: unknown }
      | null

    if (!Array.isArray(body?.squadMatchIds)) {
      return NextResponse.json({ error: 'squadMatchIds must be an array' }, { status: 400 })
    }

    const squadMatchIds = body.squadMatchIds.filter(
      (value): value is string => typeof value === 'string'
    )

    if (squadMatchIds.length === 0) {
      return NextResponse.json({ error: 'No squad match selected' }, { status: 400 })
    }

    const result = await syncTelemetryForSelectedSquadMatches(parsedClanId, squadMatchIds)

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      ...result,
    })
  } catch (error) {
    console.error('Manual telemetry sync failed:', error)
    return NextResponse.json(
      { error: 'Failed to synchronize telemetry for selected matches' },
      { status: 500 }
    )
  }
}
