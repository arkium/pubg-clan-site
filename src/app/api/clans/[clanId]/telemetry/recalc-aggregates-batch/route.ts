import { NextRequest } from 'next/server'

import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type RecalcRequest = {
  scope?: 'clan' | 'all-clans'
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

    const body = (await request.json().catch(() => null)) as RecalcRequest | null
    const scope = body?.scope ?? 'clan'

    // Q13 (docs/TODO/administration.md) : recalculer tous les clans dans une requête HTTP plantait au hasard en
    // masse ; ce passage se fait désormais en ligne de commande.
    if (scope === 'all-clans') {
      return Response.json(
        { error: 'Recalcul de tous les clans : npm run telemetry:batch -- --all-clans --recalc-aggregates-only' },
        { status: 400 }
      )
    }

    if (scope === 'clan') {
      // Recalc single clan
      const startTime = Date.now()
      const result = await recalculateTelemetryPeriodAggregatesForClan(parsedClanId)

      const duration = Date.now() - startTime
      const totalRows = result.summaries.reduce(
        (sum, s) => sum + s.memberTelemetryRows + s.memberWeaponRows + s.clanSynergyRows,
        0
      )

      return Response.json({
        ok: true,
        scope: 'clan',
        clanId: parsedClanId,
        periodsUpdated: result.summaries.length,
        totalRowsUpdated: totalRows,
        durationMs: duration,
        summary: {
          memberTelemetryRows: result.summaries.reduce(
            (sum, s) => sum + s.memberTelemetryRows,
            0
          ),
          memberWeaponRows: result.summaries.reduce((sum, s) => sum + s.memberWeaponRows, 0),
          clanSynergyRows: result.summaries.reduce((sum, s) => sum + s.clanSynergyRows, 0),
        },
        message: `Recalculated aggregates for clan ${parsedClanId} in ${(duration / 1000).toFixed(2)}s`,
      })
    }

    return Response.json({ error: 'Invalid scope' }, { status: 400 })
  } catch (error) {
    console.error('Batch recalc aggregates failed:', error)
    return Response.json(
      { error: 'Failed to recalculate aggregates' },
      { status: 500 }
    )
  }
}

export const POST = withAdminActionLog('clans/[clanId]/telemetry/recalc-aggregates-batch', handlePost)
