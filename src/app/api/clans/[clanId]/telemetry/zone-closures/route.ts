import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { getMapLocations } from '@/lib/map-location-service'
import { parseTacticalPhase, tacticalPhaseNumbers } from '@/lib/tactical-phase'
import { getZoneClosurePeriodBounds, loadZoneClosureSummary, type ZoneClosurePeriod } from '@/lib/zone-closure-stats'
import { requireNavPermission } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): ZoneClosurePeriod {
  if (value === 'month' || value === 'all') return value
  return 'week'
}

function parsePositiveInteger(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
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

    const permissionError = await requireNavPermission('clan.zone-closures')(request, { clanId: parsedClanId })
    if (permissionError) return permissionError

    const searchParams = new URL(request.url).searchParams
    const period = parsePeriod(searchParams.get('period'))
    const phaseFilter = parseTacticalPhase(searchParams.get('phase'))

    const [mapLabels, locations] = await Promise.all([getMapLabels(), getMapLocations()])
    const summary = await loadZoneClosureSummary({
      clanId: parsedClanId,
      period,
      bounds: getZoneClosurePeriodBounds(period),
      mapName: searchParams.get('map')?.trim() || null,
      memberId: parsePositiveInteger(searchParams.get('memberId')),
      phases: tacticalPhaseNumbers(phaseFilter),
      locations,
    })

    return Response.json({
      ...summary,
      phase: phaseFilter,
      mapLabels,
      selectedMapLabel: summary.selectedMap ? mapDisplayName(summary.selectedMap, mapLabels) : null,
      mapOptions: summary.maps.map((entry) => ({
        ...entry,
        label: mapDisplayName(entry.mapName, mapLabels),
      })),
    })
  } catch (error) {
    console.error('Zone closures failed:', error)
    return Response.json({ error: 'Failed to load zone closure positions' }, { status: 500 })
  }
}
