import { NextRequest } from 'next/server'

import { prisma } from '@/lib/prisma'
import { requireRole } from '@/middleware/auth-permission'
import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type RecalcRequest = {
  scope?: 'clan' | 'all-clans'
  includeEmpty?: boolean
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

    const body = (await request.json().catch(() => null)) as RecalcRequest | null
    const scope = body?.scope ?? 'clan'
    const includeEmpty = body?.includeEmpty === true

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

    if (scope === 'all-clans') {
      // Recalc all clans
      const allClans = await prisma.clan.findMany({
        select: { id: true },
        where: includeEmpty ? {} : { members: { some: {} } },
      })

      const results = []
      const startTime = Date.now()
      let totalRows = 0
      let totalErrors = 0

      for (const clan of allClans) {
        try {
          const result = await recalculateTelemetryPeriodAggregatesForClan(clan.id)
          const clantotalRows =
            result.summaries.reduce(
              (sum, s) => sum + s.memberTelemetryRows + s.memberWeaponRows + s.clanSynergyRows,
              0
            ) || 0

          results.push({
            clanId: clan.id,
            status: 'success',
            periodsUpdated: result.summaries.length,
            rowsUpdated: clantotalRows,
          })

          totalRows += clantotalRows
        } catch (error) {
          totalErrors += 1
          results.push({
            clanId: clan.id,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      const duration = Date.now() - startTime

      return Response.json({
        ok: totalErrors === 0,
        scope: 'all-clans',
        clansProcessed: allClans.length,
        clansSuccess: results.filter((r) => r.status === 'success').length,
        clansFailed: totalErrors,
        totalRowsUpdated: totalRows,
        durationMs: duration,
        results,
        message: `Recalculated aggregates for ${allClans.length} clans in ${(duration / 1000).toFixed(2)}s (${totalErrors} errors)`,
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

    // Check what needs to be recalculated
    const memberStats = await prisma.memberTelemetryStats.count({
      where: {
        member: { clanId: parsedClanId }
      },
    })

    const synergyStats = await prisma.clanSynergyTelemetryStats.count({
      where: { clanId: parsedClanId },
    })

    return Response.json({
      ok: true,
      clanId: parsedClanId,
      aggregatesExisting: {
        memberTelemetryRows: memberStats,
        clanSynergyRows: synergyStats,
        total: memberStats + synergyStats,
      },
      recalcEndpoints: {
        singleClan: `POST /api/clans/${parsedClanId}/telemetry/recalc-aggregates-batch { "scope": "clan" }`,
        allClans: `POST /api/clans/${parsedClanId}/telemetry/recalc-aggregates-batch { "scope": "all-clans" }`,
      },
    })
  } catch (error) {
    console.error('Batch recalc check failed:', error)
    return Response.json(
      { error: 'Failed to check aggregates' },
      { status: 500 }
    )
  }
}
