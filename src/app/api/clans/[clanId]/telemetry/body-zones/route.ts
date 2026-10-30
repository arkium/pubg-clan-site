import { getClanBodyZones } from '@/lib/body-zone-service'
import { buildTelemetryErrorResponse, buildTelemetrySuccessResponse } from '@/lib/pubg-telemetry/api-contract'
import type { StatsPeriod } from '@/lib/pubg-telemetry/period-keys'
import { requireNavPermission } from '@/middleware/auth-permission'

/**
 * Zones d'impact d'un clan sur une période (docs/TODO/zones-d-impact.md, lot 2) : somme des membres actifs, période
 * précédente, 8 dernières semaines, et ses membres classés par taux de tête (rang de la période précédente compris).
 */

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): StatsPeriod {
  return value === 'month' || value === 'all' ? value : 'week'
}

export async function GET(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)
    if (!parsedClanId) {
      return Response.json(buildTelemetryErrorResponse('Invalid clan id', 'INVALID_CLAN_ID'), { status: 400 })
    }

    const roleError = await requireNavPermission('clan.stats')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    const period = parsePeriod(new URL(request.url).searchParams.get('period'))
    const report = await getClanBodyZones(parsedClanId, period)

    return Response.json(
      buildTelemetrySuccessResponse(
        { scope: 'clan', clanId: parsedClanId, period, periodKey: report.periodKey, count: report.members.length },
        { period, ...report }
      )
    )
  } catch (error) {
    console.error('[telemetry/body-zones] Lecture des zones d’impact du clan impossible :', error)
    return Response.json(buildTelemetryErrorResponse('Internal Server Error', 'BODY_ZONES_FAILED'), { status: 500 })
  }
}
