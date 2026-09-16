import { Prisma } from '@prisma/client'

import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { getMapLocations, type MapLocations } from '@/lib/map-location-service'
import { getPhaseLabels } from '@/lib/phase-label-service'
import {
  parseTacticalPhase,
  tacticalPhaseNumbers,
  type TacticalPhase,
} from '@/lib/tactical-phase'
import {
  loadAggregatedPositionMetricCells,
  loadPositionMetricMapSummary,
  loadPositionMetricMemberPhaseBreakdown,
  loadRawPositionTelemetryRows,
} from '@/lib/position-metric-aggregation'
import {
  aggregateRawPositionRows,
  mergeMapSummaries,
  type PositionMapSummary,
  type RawPositionTelemetryRow,
} from '@/lib/position-metric-raw-aggregation'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import {
  loadPersistedSafeZoneTotals,
  loadUnpersistedSafeZoneRows,
  safeZoneOverlayFromTotals,
  sumSafeZoneRows,
} from '@/lib/safe-zone-phase-stats'

type TelemetryPeriod = 'week' | 'month' | 'all'

type HeatmapCell = {
  xIndex: number
  yIndex: number
  count: number
}

type HeatmapMember = {
  memberKey: string
  memberLabel: string
  points: number
}

type SafeZoneOverlay = {
  x: number
  y: number
  r: number
}

type SelectedHeatmapData = {
  gridSize: number
  selectedMap: string | null
  selectedMapLabel: string | null
  selectedMemberKey: string | null
  selectedPhase: TacticalPhase
  maps: PositionMapSummary[]
  members: HeatmapMember[]
  phases: number[]
  positions: HeatmapCell[]
  rotations: HeatmapCell[]
  deaths: HeatmapCell[]
  kills: HeatmapCell[]
  shots: HeatmapCell[]
  damageDealt: HeatmapCell[]
  damageTaken: HeatmapCell[]
  knockoutsDealt: HeatmapCell[]
  knockoutsTaken: HeatmapCell[]
  revivesGiven: HeatmapCell[]
  revivesTaken: HeatmapCell[]
  vehicles: HeatmapCell[]
  safeZoneOverlay: SafeZoneOverlay | null
  note: string
  mapLabels: Record<string, string>
  phaseLabels: Record<string, string>
  options: {
    mapLocations: MapLocations
  }
}

type MatchCountRow = {
  mapName: string
  matches: bigint | number
}

const GRID_SIZE = 40
const CACHE_TTL_MS = 5 * 60 * 1000
const positionsResponseCache = new Map<string, { expiresAt: number; body: unknown }>()

/**
 * Matchs sans `PositionMetricCell` : leurs échantillons sont relus depuis la télémétrie brute. Les
 * synchronisations n'écrivaient plus aucune cellule du 31/07 au 2026-09-16 ; sans ce complément, une période
 * contenant au moins un match couvert n'affichait silencieusement que les matchs couverts.
 */
const WITHOUT_CELLS = Prisma.sql`NOT EXISTS (SELECT 1 FROM PositionMetricCell pmc WHERE pmc.squadMatchId = sm.id)`

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): TelemetryPeriod {
  if (value === 'month' || value === 'all') {
    return value
  }

  return 'week'
}

function getIsoWeek(date: Date): number {
  const tmp = new Date(date.getTime())
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  )
}

function toPeriodKey(period: TelemetryPeriod, now = new Date()) {
  if (period === 'all') {
    return 'all-time'
  }

  if (period === 'month') {
    return `month-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  return `week-${now.getFullYear()}-${String(getIsoWeek(now)).padStart(2, '0')}`
}

function getPeriodBounds(period: TelemetryPeriod, now = new Date()) {
  if (period === 'all') {
    return null
  }

  if (period === 'month') {
    return {
      startDate: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    }
  }

  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  return {
    startDate: monday,
    endDate: sunday,
  }
}

function parseTrimmed(value: string | null) {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function incrementCellWeighted(map: Map<string, HeatmapCell>, xIndex: number, yIndex: number, weight: number) {
  const key = `${xIndex}:${yIndex}`
  const existing = map.get(key)
  if (existing) {
    existing.count += weight
    return
  }
  map.set(key, { xIndex, yIndex, count: weight })
}

function sortCells(cells: Map<string, HeatmapCell>) {
  return Array.from(cells.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count
    }

    if (left.yIndex !== right.yIndex) {
      return left.yIndex - right.yIndex
    }

    return left.xIndex - right.xIndex
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json(buildTelemetryErrorResponse('Invalid clan id', 'INVALID_CLAN_ID'), {
        status: 400,
      })
    }

    const roleError = await requireNavPermission('clan.positions')(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const url = new URL(request.url)
    const period = parsePeriod(url.searchParams.get('period'))
    const periodKey = toPeriodKey(period)
    const mapName = parseTrimmed(url.searchParams.get('map'))
    const memberKey = parseTrimmed(url.searchParams.get('memberKey'))
    const phaseFilter = parseTacticalPhase(url.searchParams.get('phase'))
    const cacheKey = [parsedClanId, period, mapName ?? '', memberKey ?? '', phaseFilter].join(':')
    const cached = positionsResponseCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return Response.json(cached.body, {
        headers: { 'X-Positions-Cache': 'HIT' },
      })
    }
    if (cached) positionsResponseCache.delete(cacheKey)

    const bounds = getPeriodBounds(period)
    const dateFilter = bounds
      ? Prisma.sql`AND sm.createdAt >= ${bounds.startDate} AND sm.createdAt <= ${bounds.endDate}`
      : Prisma.empty
    const clanFilter = Prisma.sql`
      AND EXISTS (
        SELECT 1
        FROM SquadMember sdm
        INNER JOIN ClanMember cm ON cm.id = sdm.memberId
        WHERE sdm.squadMatchId = sm.id
          AND cm.clanId = ${parsedClanId}
      )`

    // Deux sources additionnées : cellules persistées, et télémétrie brute des seuls matchs qui n'en ont pas.
    const [persistedMapSummary, rawMatchCounts] = await Promise.all([
      loadPositionMetricMapSummary({ clanId: parsedClanId, bounds }),
      prisma.$queryRaw<MatchCountRow[]>(Prisma.sql`
        SELECT sm.mapName, COUNT(*) AS matches
        FROM SquadMatchTelemetry t
        INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
        WHERE t.status = 'success'
          ${dateFilter}
          ${clanFilter}
          AND ${WITHOUT_CELLS}
        GROUP BY sm.mapName
      `),
    ])

    const maps = mergeMapSummaries(
      persistedMapSummary.maps,
      rawMatchCounts.map((row) => ({ mapName: row.mapName, matches: Number(row.matches) }))
    )
    const selectedMap = mapName && maps.some((entry) => entry.mapName === mapName)
      ? mapName
      : maps[0]?.mapName ?? null
    const selectedMapHasRawMatches = rawMatchCounts.some(
      (row) => row.mapName === selectedMap && Number(row.matches) > 0
    )

    const clanMembers = await prisma.clanMember.findMany({
      where: { clanId: parsedClanId },
      select: {
        id: true,
        displayName: true,
        pubgPlayerName: true,
        pubgAccountId: true,
      },
    })

    function canonicalMemberKey(member: typeof clanMembers[number]) {
      return member.pubgAccountId || member.pubgPlayerName || member.displayName || String(member.id)
    }

    const labelByKey = new Map<string, string>()
    const canonicalKeyByLowerKey = new Map<string, string>()
    const clanMemberById = new Map(clanMembers.map((member) => [member.id, member]))
    for (const member of clanMembers) {
      const label = member.displayName || member.pubgPlayerName || member.pubgAccountId || 'Membre inconnu'
      const canonical = canonicalMemberKey(member)
      labelByKey.set(canonical, label)
      if (member.pubgAccountId) canonicalKeyByLowerKey.set(member.pubgAccountId.toLowerCase(), canonical)
      if (member.pubgPlayerName) canonicalKeyByLowerKey.set(member.pubgPlayerName.toLowerCase(), canonical)
    }

    const requestedMember = memberKey
      ? clanMembers.find((member) =>
          [member.pubgAccountId, member.pubgPlayerName, member.displayName]
            .some((key) => key?.toLowerCase() === memberKey.toLowerCase()))
      : undefined
    // Membre demandé mais introuvable dans le clan : aucune donnée plutôt que tout le clan.
    const requestedCanonicalKey = memberKey ? (requestedMember ? canonicalMemberKey(requestedMember) : '\u0000') : null

    const [mapLabels, phaseLabels, configuredLocations] = await Promise.all([
      getMapLabels(),
      getPhaseLabels(),
      getMapLocations(),
    ])
    const activeLocations = Object.fromEntries(
      Object.entries(configuredLocations).map(([locationMapName, locations]) => [
        locationMapName,
        locations.filter((location) => location.enabled),
      ])
    )

    const [persistedCatalog, persistedCells, rawRows, safeZoneTotals] = selectedMap
      ? await Promise.all([
          loadPositionMetricMemberPhaseBreakdown({ clanId: parsedClanId, bounds, selectedMap }),
          loadAggregatedPositionMetricCells({
            clanId: parsedClanId,
            mapName: selectedMap,
            bounds,
            memberId: memberKey ? requestedMember?.id ?? -1 : undefined,
            phases: tacticalPhaseNumbers(phaseFilter),
          }),
          selectedMapHasRawMatches
            ? loadRawPositionTelemetryRows({
                clanId: parsedClanId,
                mapName: selectedMap,
                bounds,
                coverage: 'without_cells',
              })
            : Promise.resolve([] as RawPositionTelemetryRow[]),
          // Cercle moyen de la plage tactique : zones persistées (`SafeZonePhaseStat`, 2026-09-16) + zones relues
          // depuis le JSON pour les seuls matchs pas encore couverts. Même moyenne que la lecture snapshot par snapshot.
          phaseFilter !== 'all'
            ? Promise.all([
                loadPersistedSafeZoneTotals({
                  clanId: parsedClanId,
                  mapName: selectedMap,
                  bounds,
                  phases: tacticalPhaseNumbers(phaseFilter),
                }),
                loadUnpersistedSafeZoneRows({ clanId: parsedClanId, mapName: selectedMap, bounds }).then((rows) =>
                  sumSafeZoneRows(rows, tacticalPhaseNumbers(phaseFilter))
                ),
              ])
            : Promise.resolve(null),
        ])
      : [null, [], [], null]

    const rawAggregation = selectedMap
      ? aggregateRawPositionRows({
          rows: rawRows,
          mapName: selectedMap,
          canonicalKeyByLowerKey,
          requestedMemberKey: requestedCanonicalKey,
          phaseFilter,
        })
      : null

    const metricMaps = {
      position: new Map<string, HeatmapCell>(),
      rotation: new Map<string, HeatmapCell>(),
      death: new Map<string, HeatmapCell>(),
      kill: new Map<string, HeatmapCell>(),
      shot: new Map<string, HeatmapCell>(),
      damage_dealt: new Map<string, HeatmapCell>(),
      damage_taken: new Map<string, HeatmapCell>(),
      knockout_dealt: new Map<string, HeatmapCell>(),
      knockout_taken: new Map<string, HeatmapCell>(),
      revive_given: new Map<string, HeatmapCell>(),
      revive_received: new Map<string, HeatmapCell>(),
      vehicle: new Map<string, HeatmapCell>(),
    }
    for (const cell of [...persistedCells, ...(rawAggregation?.cells ?? [])]) {
      incrementCellWeighted(metricMaps[cell.metric], cell.xIndex, cell.yIndex, cell.count)
    }

    const members = new Map<string, number>()
    const phases = new Set<number>()
    for (const memberSummary of persistedCatalog?.members ?? []) {
      const member = clanMemberById.get(memberSummary.memberId)
      if (member) members.set(canonicalMemberKey(member), memberSummary.points)
    }
    for (const [key, points] of rawAggregation?.memberPoints ?? []) {
      members.set(key, (members.get(key) ?? 0) + points)
    }
    for (const phase of persistedCatalog?.phases ?? []) phases.add(phase)
    for (const phase of rawAggregation?.phases ?? []) phases.add(phase)
    for (const key of Object.keys(phaseLabels)) {
      const numeric = Number(key)
      if (Number.isFinite(numeric) && numeric > 0) {
        phases.add(numeric)
      }
    }

    const memberOptions = Array.from(members.entries())
      .map(([entryMemberKey, points]) => ({
        memberKey: entryMemberKey,
        memberLabel: labelByKey.get(entryMemberKey) ?? entryMemberKey,
        points,
      }))
      .sort((left, right) => {
        if (right.points !== left.points) {
          return right.points - left.points
        }
        return left.memberLabel.localeCompare(right.memberLabel)
      })

    const selectedMemberKey = requestedMember ? canonicalMemberKey(requestedMember) : null
    const phaseOptions = Array.from(phases.values()).sort((left, right) => left - right)
    const selectedMapLabel = selectedMap ? mapDisplayName(selectedMap, mapLabels) : null

    const safeZoneOverlay: SafeZoneOverlay | null =
      phaseFilter !== 'all' && safeZoneTotals ? safeZoneOverlayFromTotals(...safeZoneTotals) : null

    const note =
      'Heatmaps basees sur les positions samplees toutes les ~10 s, les segments de rotation derivent des ecarts entre echantillons, et les zones de mort proviennent des localisations de victime quand elles sont disponibles.'

    const payload: SelectedHeatmapData = {
      gridSize: GRID_SIZE,
      selectedMap,
      selectedMapLabel,
      selectedMemberKey,
      selectedPhase: phaseFilter,
      maps,
      members: memberOptions,
      phases: phaseOptions,
      positions: sortCells(metricMaps.position),
      rotations: sortCells(metricMaps.rotation),
      deaths: sortCells(metricMaps.death),
      kills: sortCells(metricMaps.kill),
      shots: sortCells(metricMaps.shot),
      damageDealt: sortCells(metricMaps.damage_dealt),
      damageTaken: sortCells(metricMaps.damage_taken),
      knockoutsDealt: sortCells(metricMaps.knockout_dealt),
      knockoutsTaken: sortCells(metricMaps.knockout_taken),
      revivesGiven: sortCells(metricMaps.revive_given),
      revivesTaken: sortCells(metricMaps.revive_received),
      vehicles: sortCells(metricMaps.vehicle),
      safeZoneOverlay,
      note,
      mapLabels,
      phaseLabels,
      options: {
        mapLocations: activeLocations,
      },
    }

    const responseBody = buildTelemetrySuccessResponse(
        {
          scope: 'clan',
          clanId: parsedClanId,
          period,
          periodKey,
          count: maps.length,
        },
        payload,
        {
          clanId: parsedClanId,
          period,
          periodKey,
          ...payload,
        }
      )
    positionsResponseCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      body: responseBody,
    })
    if (!mapName && selectedMap) {
      const selectedMapCacheKey = [
        parsedClanId,
        period,
        selectedMap,
        memberKey ?? '',
        phaseFilter,
      ].join(':')
      positionsResponseCache.set(selectedMapCacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        body: responseBody,
      })
    }
    if (positionsResponseCache.size > 100) {
      const oldestKey = positionsResponseCache.keys().next().value
      if (oldestKey) positionsResponseCache.delete(oldestKey)
    }

    return Response.json(responseBody, {
      headers: { 'X-Positions-Cache': 'MISS' },
    })
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry positions heatmap failed:', error)
    return Response.json(buildTelemetryErrorResponse('Failed to load telemetry heatmap'), {
      status: 500,
    })
  }
}
