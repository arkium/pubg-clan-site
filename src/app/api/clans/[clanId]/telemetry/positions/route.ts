import { Prisma } from '@prisma/client'

import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { getMapLocations, type MapLocations } from '@/lib/map-location-service'
import { getPhaseLabels } from '@/lib/phase-label-service'
import {
  isInTacticalPhase,
  parseTacticalPhase,
  tacticalPhaseNumbers,
  type TacticalPhase,
} from '@/lib/tactical-phase'
import {
  loadAggregatedPositionMetricCells,
  loadPositionMetricMapSummary,
  loadPositionMetricMemberPhaseBreakdown,
} from '@/lib/position-metric-aggregation'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { clamp01, getMapBounds, toMapPercent } from '@/lib/pubg-telemetry/position-heatmap'

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

type PositionSampleRow = {
  memberKey?: unknown
  phase?: unknown
  x?: unknown
  y?: unknown
}

type KillSampleRow = { memberKey?: unknown; phase?: unknown; x?: unknown; y?: unknown }
type ShotSampleRow = { memberKey?: unknown; phase?: unknown; count?: unknown; x?: unknown; y?: unknown }
type DamageSampleRow = { memberKey?: unknown; role?: unknown; phase?: unknown; count?: unknown; x?: unknown; y?: unknown }
type KnockoutSampleRow = { memberKey?: unknown; role?: unknown; phase?: unknown; x?: unknown; y?: unknown }
type ReviveSampleRow = { memberKey?: unknown; role?: unknown; phase?: unknown; x?: unknown; y?: unknown }
type VehicleSampleRow = { memberKey?: unknown; phase?: unknown; x?: unknown; y?: unknown }
type PhaseSnapshotRow = { isGame?: unknown; safetyZoneX?: unknown; safetyZoneY?: unknown; safetyZoneRadiusMeters?: unknown }

type MapSummary = {
  mapName: string
  matches: number
  positionPoints: number
  rotationPoints: number
  deathPoints: number
}

type MapSummaryRow = {
  mapName: string
  matches: bigint | number
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
  maps: MapSummary[]
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

type TelemetryRow = {
  mapName: string
  positionSamples: unknown
  deathSamples: unknown
  killSamples: unknown
  shotSamples: unknown
  damageSamples: unknown
  knockoutSamples: unknown
  reviveSamples: unknown
  vehicleSamples: unknown
  phaseSnapshots: unknown
}

type ColumnPresenceRow = {
  total: bigint | number
}

const GRID_SIZE = 40
const CACHE_TTL_MS = 5 * 60 * 1000
const positionsResponseCache = new Map<string, { expiresAt: number; body: unknown }>()

let columnPresenceCache: { hasPositionColumns: boolean; hasNewColumns: boolean } | null = null

async function getColumnPresence() {
  if (columnPresenceCache) {
    return columnPresenceCache
  }

  const [columnPresenceRows, newColumnPresenceRows] = await Promise.all([
    prisma.$queryRaw<ColumnPresenceRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'SquadMatchTelemetry'
        AND COLUMN_NAME IN ('positionSamples', 'deathSamples')
    `),
    prisma.$queryRaw<ColumnPresenceRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'SquadMatchTelemetry'
        AND COLUMN_NAME IN ('killSamples', 'shotSamples', 'damageSamples', 'knockoutSamples', 'reviveSamples', 'vehicleSamples')
    `),
  ])

  const presentColumnsRaw = columnPresenceRows[0]?.total ?? 0
  const presentColumns =
    typeof presentColumnsRaw === 'bigint' ? Number(presentColumnsRaw) : Number(presentColumnsRaw)

  columnPresenceCache = {
    hasPositionColumns: Number.isFinite(presentColumns) && presentColumns >= 2,
    hasNewColumns: Number(newColumnPresenceRows[0]?.total ?? 0) >= 6,
  }

  return columnPresenceCache
}

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

function parseMap(value: string | null) {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseMemberKey(value: string | null) {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[]
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }

  return []
}

function parseNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normalizeCell(x: number, y: number) {
  const normalizedX = clamp01(x / 100)
  const normalizedY = clamp01(y / 100)
  const xIndex = Math.min(GRID_SIZE - 1, Math.floor(normalizedX * GRID_SIZE))
  const yIndex = Math.min(GRID_SIZE - 1, Math.floor(normalizedY * GRID_SIZE))
  return { xIndex, yIndex }
}

function incrementCell(map: Map<string, HeatmapCell>, xIndex: number, yIndex: number) {
  const key = `${xIndex}:${yIndex}`
  const existing = map.get(key)
  if (existing) {
    existing.count += 1
    return
  }

  map.set(key, { xIndex, yIndex, count: 1 })
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
    const mapName = parseMap(url.searchParams.get('map'))
    const memberKey = parseMemberKey(url.searchParams.get('memberKey'))
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
    const persistedMapSummary = await loadPositionMetricMapSummary({
      clanId: parsedClanId,
      bounds,
    })
    const hasPersistedData = persistedMapSummary.maps.length > 0

    const { hasPositionColumns, hasNewColumns } = await getColumnPresence()

    const selectPositionSamples = hasPositionColumns && !hasPersistedData
      ? Prisma.sql`t.positionSamples`
      : Prisma.sql`JSON_ARRAY()`
    const selectDeathSamples = hasPositionColumns && !hasPersistedData
      ? Prisma.sql`t.deathSamples`
      : Prisma.sql`JSON_ARRAY()`
    const selectKillSamples = hasNewColumns && !hasPersistedData ? Prisma.sql`t.killSamples` : Prisma.sql`JSON_ARRAY()`
    const selectShotSamples = hasNewColumns && !hasPersistedData ? Prisma.sql`t.shotSamples` : Prisma.sql`JSON_ARRAY()`
    const selectDamageSamples = hasNewColumns && !hasPersistedData ? Prisma.sql`t.damageSamples` : Prisma.sql`JSON_ARRAY()`
    const selectKnockoutSamples = hasNewColumns && !hasPersistedData ? Prisma.sql`t.knockoutSamples` : Prisma.sql`JSON_ARRAY()`
    const selectReviveSamples = hasNewColumns && !hasPersistedData ? Prisma.sql`t.reviveSamples` : Prisma.sql`JSON_ARRAY()`
    const selectVehicleSamples = hasNewColumns && !hasPersistedData ? Prisma.sql`t.vehicleSamples` : Prisma.sql`JSON_ARRAY()`
    const selectPhaseSnapshots = phaseFilter !== 'all'
      ? Prisma.sql`COALESCE(t.phaseSnapshots, JSON_ARRAY())`
      : Prisma.sql`JSON_ARRAY()`

    const mapSummaryRows = hasPersistedData ? [] : await prisma.$queryRaw<MapSummaryRow[]>(Prisma.sql`
      SELECT
        sm.mapName,
        COUNT(*) AS matches
      FROM SquadMatchTelemetry t
      INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
      WHERE t.status = 'success'
        ${dateFilter}
        AND EXISTS (
          SELECT 1
          FROM SquadMember sdm
          INNER JOIN ClanMember cm ON cm.id = sdm.memberId
          WHERE sdm.squadMatchId = sm.id
            AND cm.clanId = ${parsedClanId}
        )
      GROUP BY sm.mapName
      ORDER BY matches DESC, sm.mapName ASC
    `)

    const maps = hasPersistedData
      ? persistedMapSummary.maps
      : mapSummaryRows.map((row) => ({
          mapName: row.mapName,
          matches: Number(row.matches),
          positionPoints: 0,
          rotationPoints: 0,
          deathPoints: 0,
        }))
    const selectedMap = mapName && maps.some((entry) => entry.mapName === mapName)
      ? mapName
      : maps[0]?.mapName ?? null

    const needsRawRows = !hasPersistedData || phaseFilter !== 'all'
    const rows = selectedMap && needsRawRows ? await prisma.$queryRaw<TelemetryRow[]>(Prisma.sql`
      SELECT
        sm.mapName,
        ${selectPositionSamples} AS positionSamples,
        ${selectDeathSamples} AS deathSamples,
        ${selectKillSamples} AS killSamples,
        ${selectShotSamples} AS shotSamples,
        ${selectDamageSamples} AS damageSamples,
        ${selectKnockoutSamples} AS knockoutSamples,
        ${selectReviveSamples} AS reviveSamples,
        ${selectVehicleSamples} AS vehicleSamples,
        ${selectPhaseSnapshots} AS phaseSnapshots
      FROM SquadMatchTelemetry t
      INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
      WHERE t.status = 'success'
        ${dateFilter}
        AND sm.mapName = ${selectedMap}
        AND EXISTS (
          SELECT 1
          FROM SquadMember sdm
          INNER JOIN ClanMember cm ON cm.id = sdm.memberId
          WHERE sdm.squadMatchId = sm.id
            AND cm.clanId = ${parsedClanId}
        )
      ORDER BY sm.createdAt DESC
    `) : []

    const clanMembers = await prisma.clanMember.findMany({
      where: { clanId: parsedClanId },
      select: {
        id: true,
        displayName: true,
        pubgPlayerName: true,
        pubgAccountId: true,
      },
    })

    const labelByExactKey = new Map<string, string>()
    const labelByLowerKey = new Map<string, string>()
    const clanMemberKeys = new Set<string>()
    const clanMemberById = new Map(clanMembers.map((member) => [member.id, member]))
    for (const member of clanMembers) {
      const label = member.displayName || member.pubgPlayerName || member.pubgAccountId || 'Membre inconnu'
      const keys = [member.pubgAccountId, member.pubgPlayerName, member.displayName]
      for (const key of keys) {
        if (!key) {
          continue
        }
        labelByExactKey.set(key, label)
        labelByLowerKey.set(key.toLowerCase(), label)
      }
      if (member.pubgAccountId) clanMemberKeys.add(member.pubgAccountId.toLowerCase())
      if (member.pubgPlayerName) clanMemberKeys.add(member.pubgPlayerName.toLowerCase())
    }

    const requestedMember = memberKey
      ? clanMembers.find((member) =>
          [member.pubgAccountId, member.pubgPlayerName, member.displayName]
            .some((key) => key?.toLowerCase() === memberKey.toLowerCase()))
      : undefined
    const requestedMemberKeys = new Set(
      requestedMember
        ? [requestedMember.pubgAccountId, requestedMember.pubgPlayerName, requestedMember.displayName]
            .filter((key): key is string => Boolean(key))
            .map((key) => key.toLowerCase())
        : []
    )

    function canonicalMemberKey(member: typeof clanMembers[number]) {
      return member.pubgAccountId || member.pubgPlayerName || member.displayName || String(member.id)
    }

    function matchesRequestedMember(inputKey: string) {
      if (!memberKey) return true
      return requestedMemberKeys.size > 0
        ? requestedMemberKeys.has(inputKey.toLowerCase())
        : inputKey === memberKey
    }

    function resolveMemberLabel(inputKey: string) {
      const exact = labelByExactKey.get(inputKey)
      if (exact) {
        return exact
      }

      const lower = labelByLowerKey.get(inputKey.toLowerCase())
      if (lower) {
        return lower
      }

      return inputKey
    }

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
    const selectedRows = rows
    const persistedCatalog = hasPersistedData && selectedMap
      ? await loadPositionMetricMemberPhaseBreakdown({
          clanId: parsedClanId,
          bounds,
          selectedMap,
        })
      : null
    const persistedCells = hasPersistedData && selectedMap
      ? await loadAggregatedPositionMetricCells({
          clanId: parsedClanId,
          mapName: selectedMap,
          bounds,
          memberId: memberKey ? requestedMember?.id ?? -1 : undefined,
          phases: tacticalPhaseNumbers(phaseFilter),
        })
      : []

    const positions = new Map<string, HeatmapCell>()
    const rotations = new Map<string, HeatmapCell>()
    const deaths = new Map<string, HeatmapCell>()
    const kills = new Map<string, HeatmapCell>()
    const shots = new Map<string, HeatmapCell>()
    const damageDealt = new Map<string, HeatmapCell>()
    const damageTaken = new Map<string, HeatmapCell>()
    const knockoutsDealt = new Map<string, HeatmapCell>()
    const knockoutsTaken = new Map<string, HeatmapCell>()
    const revivesGiven = new Map<string, HeatmapCell>()
    const revivesTaken = new Map<string, HeatmapCell>()
    const vehicles = new Map<string, HeatmapCell>()
    const members = new Map<string, number>()
    const phases = new Set<number>()

    const metricMaps = {
      position: positions,
      rotation: rotations,
      death: deaths,
      kill: kills,
      shot: shots,
      damage_dealt: damageDealt,
      damage_taken: damageTaken,
      knockout_dealt: knockoutsDealt,
      knockout_taken: knockoutsTaken,
      revive_given: revivesGiven,
      revive_received: revivesTaken,
      vehicle: vehicles,
    }
    for (const cell of persistedCells) {
      incrementCellWeighted(metricMaps[cell.metric], cell.xIndex, cell.yIndex, cell.count)
    }
    for (const memberSummary of persistedCatalog?.members ?? []) {
      const member = clanMemberById.get(memberSummary.memberId)
      if (member) members.set(canonicalMemberKey(member), memberSummary.points)
    }
    for (const phase of persistedCatalog?.phases ?? []) phases.add(phase)

    for (const row of selectedRows) {
      for (const point of asArray<PositionSampleRow>(row.positionSamples)) {
        const x = parseNumber(point.x)
        const y = parseNumber(point.y)
        const pointMemberKey = parseString(point.memberKey)
        const pointPhase = parseNumber(point.phase)

        if (!pointMemberKey || !clanMemberKeys.has(pointMemberKey.toLowerCase())) continue

        members.set(pointMemberKey, (members.get(pointMemberKey) ?? 0) + 1)
        if (pointPhase !== null && Number.isFinite(pointPhase) && pointPhase > 0) {
          phases.add(pointPhase)
        }

        if (!matchesRequestedMember(pointMemberKey)) {
          continue
        }
        if (!isInTacticalPhase(pointPhase, phaseFilter)) {
          continue
        }
        if (x === null || y === null) {
          continue
        }
        const percent = toMapPercent(selectedMap, x, y)
        const cell = normalizeCell(percent.x, percent.y)
        incrementCell(positions, cell.xIndex, cell.yIndex)
      }

      for (const point of asArray<PositionSampleRow>(row.deathSamples)) {
        const x = parseNumber(point.x)
        const y = parseNumber(point.y)
        const pointMemberKey = parseString(point.memberKey)
        const pointPhase = parseNumber(point.phase)

        if (!pointMemberKey || !clanMemberKeys.has(pointMemberKey.toLowerCase())) continue

        members.set(pointMemberKey, (members.get(pointMemberKey) ?? 0) + 1)
        if (pointPhase !== null && Number.isFinite(pointPhase) && pointPhase > 0) {
          phases.add(pointPhase)
        }

        if (!matchesRequestedMember(pointMemberKey)) {
          continue
        }
        if (!isInTacticalPhase(pointPhase, phaseFilter)) {
          continue
        }
        if (x === null || y === null) {
          continue
        }
        const percent = toMapPercent(selectedMap, x, y)
        const cell = normalizeCell(percent.x, percent.y)
        incrementCell(deaths, cell.xIndex, cell.yIndex)
      }

      for (const point of asArray<KillSampleRow>(row.killSamples)) {
        const x = parseNumber(point.x)
        const y = parseNumber(point.y)
        const pointMemberKey = parseString(point.memberKey)
        const pointPhase = parseNumber(point.phase)
        if (!pointMemberKey || !clanMemberKeys.has(pointMemberKey.toLowerCase())) continue
        if (!matchesRequestedMember(pointMemberKey)) continue
        if (!isInTacticalPhase(pointPhase, phaseFilter)) continue
        if (x === null || y === null) continue
        const percent = toMapPercent(selectedMap, x, y)
        const cell = normalizeCell(percent.x, percent.y)
        incrementCell(kills, cell.xIndex, cell.yIndex)
      }

      for (const point of asArray<ShotSampleRow>(row.shotSamples)) {
        const x = parseNumber(point.x)
        const y = parseNumber(point.y)
        const pointMemberKey = parseString(point.memberKey)
        const pointPhase = parseNumber(point.phase)
        const weight = parseNumber(point.count) ?? 1
        if (!pointMemberKey || !clanMemberKeys.has(pointMemberKey.toLowerCase())) continue
        if (!matchesRequestedMember(pointMemberKey)) continue
        if (!isInTacticalPhase(pointPhase, phaseFilter)) continue
        if (x === null || y === null) continue
        const percent = toMapPercent(selectedMap, x, y)
        const cell = normalizeCell(percent.x, percent.y)
        incrementCellWeighted(shots, cell.xIndex, cell.yIndex, weight)
      }

      for (const point of asArray<DamageSampleRow>(row.damageSamples)) {
        const x = parseNumber(point.x)
        const y = parseNumber(point.y)
        const pointMemberKey = parseString(point.memberKey)
        const pointPhase = parseNumber(point.phase)
        const role = parseString(point.role)
        const weight = parseNumber(point.count) ?? 1
        if (!pointMemberKey || !clanMemberKeys.has(pointMemberKey.toLowerCase())) continue
        if (!matchesRequestedMember(pointMemberKey)) continue
        if (!isInTacticalPhase(pointPhase, phaseFilter)) continue
        if (x === null || y === null) continue
        const percent = toMapPercent(selectedMap, x, y)
        const cell = normalizeCell(percent.x, percent.y)
        if (role === 'attacker') incrementCellWeighted(damageDealt, cell.xIndex, cell.yIndex, weight)
        else if (role === 'victim') incrementCellWeighted(damageTaken, cell.xIndex, cell.yIndex, weight)
      }

      for (const point of asArray<KnockoutSampleRow>(row.knockoutSamples)) {
        const x = parseNumber(point.x)
        const y = parseNumber(point.y)
        const pointMemberKey = parseString(point.memberKey)
        const pointPhase = parseNumber(point.phase)
        const role = parseString(point.role)
        if (!pointMemberKey || !clanMemberKeys.has(pointMemberKey.toLowerCase())) continue
        if (!matchesRequestedMember(pointMemberKey)) continue
        if (!isInTacticalPhase(pointPhase, phaseFilter)) continue
        if (x === null || y === null) continue
        const percent = toMapPercent(selectedMap, x, y)
        const cell = normalizeCell(percent.x, percent.y)
        if (role === 'knocker') incrementCell(knockoutsDealt, cell.xIndex, cell.yIndex)
        else if (role === 'victim') incrementCell(knockoutsTaken, cell.xIndex, cell.yIndex)
      }

      for (const point of asArray<ReviveSampleRow>(row.reviveSamples)) {
        const x = parseNumber(point.x)
        const y = parseNumber(point.y)
        const pointMemberKey = parseString(point.memberKey)
        const pointPhase = parseNumber(point.phase)
        const role = parseString(point.role)
        if (!pointMemberKey || !clanMemberKeys.has(pointMemberKey.toLowerCase())) continue
        if (!matchesRequestedMember(pointMemberKey)) continue
        if (!isInTacticalPhase(pointPhase, phaseFilter)) continue
        if (x === null || y === null) continue
        const percent = toMapPercent(selectedMap, x, y)
        const cell = normalizeCell(percent.x, percent.y)
        if (role === 'reviver') incrementCell(revivesGiven, cell.xIndex, cell.yIndex)
        else if (role === 'revived') incrementCell(revivesTaken, cell.xIndex, cell.yIndex)
      }

      for (const point of asArray<VehicleSampleRow>(row.vehicleSamples)) {
        const x = parseNumber(point.x)
        const y = parseNumber(point.y)
        const pointMemberKey = parseString(point.memberKey)
        const pointPhase = parseNumber(point.phase)
        if (!pointMemberKey || !clanMemberKeys.has(pointMemberKey.toLowerCase())) continue
        if (!matchesRequestedMember(pointMemberKey)) continue
        if (!isInTacticalPhase(pointPhase, phaseFilter)) continue
        if (x === null || y === null) continue
        const percent = toMapPercent(selectedMap, x, y)
        const cell = normalizeCell(percent.x, percent.y)
        incrementCell(vehicles, cell.xIndex, cell.yIndex)
      }
    }

    const memberOptions = Array.from(members.entries())
      .map(([entryMemberKey, points]) => ({
        memberKey: entryMemberKey,
        memberLabel: resolveMemberLabel(entryMemberKey),
        points,
      }))
      .sort((left, right) => {
        if (right.points !== left.points) {
          return right.points - left.points
        }
        return left.memberLabel.localeCompare(right.memberLabel)
      })

    const selectedMemberKey = hasPersistedData
      ? requestedMember ? canonicalMemberKey(requestedMember) : null
      : memberKey && members.has(memberKey) ? memberKey : null
    for (const key of Object.keys(phaseLabels)) {
      const numeric = Number(key)
      if (Number.isFinite(numeric) && numeric > 0) {
        phases.add(numeric)
      }
    }

    const phaseOptions = Array.from(phases.values()).sort((left, right) => left - right)
    const selectedPhase = phaseFilter

    const selectedMapLabel = selectedMap ? mapDisplayName(selectedMap, mapLabels) : null
    let safeZoneOverlay: SafeZoneOverlay | null = null
    if (phaseFilter !== 'all' && selectedMap) {
      const bounds = getMapBounds(selectedMap)
      const snapPoints: Array<{ x: number; y: number; r: number }> = []
      for (const row of selectedRows) {
        const snapshots = asArray<PhaseSnapshotRow>(row.phaseSnapshots).filter((snap) => {
          const isGame = parseNumber(snap.isGame)
          return isInTacticalPhase(isGame, phaseFilter)
        })
        for (const snapshot of snapshots) {
          const sx = parseNumber(snapshot.safetyZoneX)
          const sy = parseNumber(snapshot.safetyZoneY)
          const sr = parseNumber(snapshot.safetyZoneRadiusMeters)
          if (sx !== null && sy !== null && sr !== null && sr > 0) {
            const pct = toMapPercent(selectedMap, sx, sy)
            snapPoints.push({ x: pct.x, y: pct.y, r: (sr / bounds.width) * 100 })
          }
        }
      }
      if (snapPoints.length > 0) {
        safeZoneOverlay = {
          x: snapPoints.reduce((s, p) => s + p.x, 0) / snapPoints.length,
          y: snapPoints.reduce((s, p) => s + p.y, 0) / snapPoints.length,
          r: snapPoints.reduce((s, p) => s + p.r, 0) / snapPoints.length,
        }
      }
    }

    const note =
      'Heatmaps basees sur les positions samplees toutes les ~10 s, les segments de rotation derivent des ecarts entre echantillons, et les zones de mort proviennent des localisations de victime quand elles sont disponibles.'

    const payload: SelectedHeatmapData = {
      gridSize: GRID_SIZE,
      selectedMap,
      selectedMapLabel,
      selectedMemberKey,
      selectedPhase,
      maps,
      members: memberOptions,
      phases: phaseOptions,
      positions: sortCells(positions),
      rotations: sortCells(rotations),
      deaths: sortCells(deaths),
      kills: sortCells(kills),
      shots: sortCells(shots),
      damageDealt: sortCells(damageDealt),
      damageTaken: sortCells(damageTaken),
      knockoutsDealt: sortCells(knockoutsDealt),
      knockoutsTaken: sortCells(knockoutsTaken),
      revivesGiven: sortCells(revivesGiven),
      revivesTaken: sortCells(revivesTaken),
      vehicles: sortCells(vehicles),
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
