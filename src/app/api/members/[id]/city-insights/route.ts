import {
  aggregateCityCells,
  buildCityGrid,
  buildCityInsights,
  buildCityTimeline,
  getCityPeriodBounds,
  getCityTimelineStart,
  loadCityMatchCoverage,
  loadCityMetricCells,
  withClanComparison,
} from '@/lib/city-insights'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { getMapLocations } from '@/lib/map-location-service'
import { prisma } from '@/lib/prisma'
import { requireSameClanAsMember } from '@/middleware/auth-permission'
import type { CityInsightsPeriod } from '@/types/city-insights'

function parseMemberId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): CityInsightsPeriod {
  if (value === 'month' || value === 'month-1' || value === 'month-2' || value === 'all') return value
  return 'week'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)
    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const member = await prisma.clanMember.findUnique({ where: { id: memberId }, select: { clanId: true } })
    if (!member?.clanId) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    const period = parsePeriod(new URL(request.url).searchParams.get('period'))
    const bounds = getCityPeriodBounds(period)
    const timelineStart = getCityTimelineStart()

    const [mapLabels, locations, memberCells, timelineCells, coverage, clanCells] = await Promise.all([
      getMapLabels(),
      getMapLocations(),
      loadCityMetricCells({ clanId: member.clanId, memberId, bounds }),
      loadCityMetricCells({
        clanId: member.clanId,
        memberId,
        bounds: { startDate: timelineStart, endDate: new Date() },
        withWeeks: true,
      }),
      loadCityMatchCoverage({ clanId: member.clanId, memberId, bounds }),
      // Référence de comparaison : tout le clan sur la même période.
      loadCityMetricCells({ clanId: member.clanId, bounds }),
    ])

    const grid = buildCityGrid(locations)
    const mapLabel = (mapName: string) => mapDisplayName(mapName, mapLabels)
    const insights = buildCityInsights({
      period,
      aggregation: aggregateCityCells({ rows: memberCells, grid, mapLabel }),
      timeline: buildCityTimeline(timelineCells, grid),
      matchCount: coverage.matchCount,
      dataStart: coverage.dataStart,
      mapLabel,
    })

    return Response.json({
      insights: withClanComparison(insights, aggregateCityCells({ rows: clanCells, grid, mapLabel })),
      period,
    })
  } catch (error) {
    console.error('Member city insights failed:', error)
    return Response.json({ error: 'Failed to load city insights' }, { status: 500 })
  }
}
