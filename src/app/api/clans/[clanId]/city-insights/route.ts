import {
  aggregateCityCells,
  buildCityGrid,
  buildCityInsights,
  buildCityTimeline,
  getCityPeriodBounds,
  getCityTimelineStart,
  loadCityMatchCoverage,
  loadCityMetricCells,
} from '@/lib/city-insights'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { getMapLocations } from '@/lib/map-location-service'
import { getSquadMatchIdsForTeamMode } from '@/lib/drop-pressure-stats'
import { parseClanMatchTypeFilter } from '@/lib/match-type-filter'
import { parseClanTeamModeFilter } from '@/lib/team-mode'
import { requireNavPermission } from '@/middleware/auth-permission'
import type { ClanMatchTypeFilter } from '@/types/squad-matches'
import type { CityInsightsPeriod } from '@/types/city-insights'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): CityInsightsPeriod {
  if (value === 'month' || value === 'month-1' || value === 'month-2' || value === 'all') return value
  return 'week'
}

/** Mêmes familles que le filtre de matchs du tableau de bord : `casual` couvre aussi l'Air Royale. */
function matchTypesForFilter(filter: ClanMatchTypeFilter): string[] | null {
  if (filter === 'official') return ['official']
  if (filter === 'casual') return ['casual', 'airoyale']
  if (filter === 'custom') return ['custom']
  return null
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

    const permissionError = await requireNavPermission('clan.overview')(request, { clanId: parsedClanId })
    if (permissionError) return permissionError

    const searchParams = new URL(request.url).searchParams
    const period = parsePeriod(searchParams.get('period'))
    const matchType = parseClanMatchTypeFilter(searchParams.get('matchType'))
    const mode = parseClanTeamModeFilter(searchParams.get('mode'))

    const bounds = getCityPeriodBounds(period)
    const squadMatchIds = await getSquadMatchIdsForTeamMode(parsedClanId, mode)
    const filters = {
      clanId: parsedClanId,
      squadMatchIds,
      matchType: matchTypesForFilter(matchType),
    }
    const timelineStart = getCityTimelineStart()

    const [mapLabels, locations, cells, timelineCells, coverage] = await Promise.all([
      getMapLabels(),
      getMapLocations(),
      loadCityMetricCells({ ...filters, bounds }),
      loadCityMetricCells({
        ...filters,
        bounds: { startDate: timelineStart, endDate: new Date() },
        withWeeks: true,
      }),
      loadCityMatchCoverage({ ...filters, bounds }),
    ])

    const grid = buildCityGrid(locations)
    const mapLabel = (mapName: string) => mapDisplayName(mapName, mapLabels)
    const insights = buildCityInsights({
      period,
      aggregation: aggregateCityCells({ rows: cells, grid, mapLabel }),
      timeline: buildCityTimeline(timelineCells, grid),
      matchCount: coverage.matchCount,
      dataStart: coverage.dataStart,
      mapLabel,
    })

    return Response.json({ insights, period, matchType, mode })
  } catch (error) {
    console.error('City insights failed:', error)
    return Response.json({ error: 'Failed to load city insights' }, { status: 500 })
  }
}
