import { NextResponse } from 'next/server'

import { syncTelemetryForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'
import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'
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
      | { squadMatchIds?: unknown; recalculateAggregates?: unknown }
      | null

    if (!Array.isArray(body?.squadMatchIds)) {
      return NextResponse.json({ error: 'squadMatchIds must be an array' }, { status: 400 })
    }

    const squadMatchIds = body.squadMatchIds.filter(
      (value): value is string => typeof value === 'string'
    )
    const shouldRecalculateAggregates = body?.recalculateAggregates === true

    if (squadMatchIds.length === 0) {
      return NextResponse.json({ error: 'No squad match selected' }, { status: 400 })
    }

    const result = await syncTelemetryForSelectedSquadMatches(parsedClanId, squadMatchIds)

    let aggregateSummary:
      | {
          periodsUpdated: number
          memberTelemetryRows: number
          memberWeaponRows: number
          clanSynergyRows: number
        }
      | null = null
    let aggregateWarning: string | null = null

    if (shouldRecalculateAggregates) {
      try {
        const aggregateResult = await recalculateTelemetryPeriodAggregatesForClan(parsedClanId)
        aggregateSummary = {
          periodsUpdated: aggregateResult.summaries.length,
          memberTelemetryRows: aggregateResult.summaries.reduce(
            (sum, summary) => sum + summary.memberTelemetryRows,
            0
          ),
          memberWeaponRows: aggregateResult.summaries.reduce(
            (sum, summary) => sum + summary.memberWeaponRows,
            0
          ),
          clanSynergyRows: aggregateResult.summaries.reduce(
            (sum, summary) => sum + summary.clanSynergyRows,
            0
          ),
        }
      } catch (aggregateError) {
        aggregateWarning =
          aggregateError instanceof Error
            ? aggregateError.message
            : 'Recalcul des aggregates telemetry en echec'
      }
    }

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      aggregatesRecalculated: shouldRecalculateAggregates,
      aggregates: aggregateSummary,
      aggregatesWarning: aggregateWarning,
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
