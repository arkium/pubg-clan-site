import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { requireRole } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { getPhaseLabels } from '@/lib/phase-label-service'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { clamp01, toMapPercent } from '@/lib/pubg-telemetry/position-heatmap'

type TelemetryPeriod = 'week' | 'month' | 'all'

type HeatmapView = 'predilection' | 'rotation' | 'death'

type PhaseFilter = 'all' | number

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

type TrajectoryLine = {
  fromX: number
  fromY: number
  toX: number
  toY: number
  count: number
}

type PositionSampleRow = {
  memberKey?: unknown
  phase?: unknown
  x?: unknown
  y?: unknown
}

type TrajectorySegmentRow = {
  memberKey?: unknown
  phase?: unknown
  fromX?: unknown
  fromY?: unknown
  toX?: unknown
  toY?: unknown
}

type MapSummary = {
  mapName: string
  matches: number
  positionPoints: number
  rotationPoints: number
  deathPoints: number
}

type SelectedHeatmapData = {
  gridSize: number
  selectedMap: string | null
  selectedMapLabel: string | null
  selectedMemberKey: string | null
  selectedPhase: PhaseFilter
  view: HeatmapView
  maps: MapSummary[]
  members: HeatmapMember[]
  phases: number[]
  positions: HeatmapCell[]
  rotations: HeatmapCell[]
  trajectoryLines: TrajectoryLine[]
  deaths: HeatmapCell[]
  note: string
  mapLabels: Record<string, string>
  phaseLabels: Record<string, string>
}

type TelemetryRow = {
  mapName: string
  positionSamples: unknown
  trajectorySegments: unknown
  deathSamples: unknown
}

type ColumnPresenceRow = {
  total: bigint | number
}

const GRID_SIZE = 40

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

function parsePhase(value: string | null): PhaseFilter {
  if (!value || value === 'all') {
    return 'all'
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 'all'
  }

  return parsed
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

function incrementLine(
  map: Map<string, { fromXIndex: number; fromYIndex: number; toXIndex: number; toYIndex: number; count: number }>,
  fromXIndex: number,
  fromYIndex: number,
  toXIndex: number,
  toYIndex: number
) {
  const key = `${fromXIndex}:${fromYIndex}:${toXIndex}:${toYIndex}`
  const existing = map.get(key)
  if (existing) {
    existing.count += 1
    return
  }

  map.set(key, {
    fromXIndex,
    fromYIndex,
    toXIndex,
    toYIndex,
    count: 1,
  })
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
      return NextResponse.json(buildTelemetryErrorResponse('Invalid clan id', 'INVALID_CLAN_ID'), {
        status: 400,
      })
    }

    const roleError = await requireRole(['Owner'])(request, {
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
    const phaseFilter = parsePhase(url.searchParams.get('phase'))

    const bounds = getPeriodBounds(period)
    const dateFilter = bounds
      ? Prisma.sql`AND sm.createdAt >= ${bounds.startDate} AND sm.createdAt <= ${bounds.endDate}`
      : Prisma.empty

    const columnPresenceRows = await prisma.$queryRaw<ColumnPresenceRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'SquadMatchTelemetry'
        AND COLUMN_NAME IN ('positionSamples', 'trajectorySegments', 'deathSamples')
    `)

    const presentColumnsRaw = columnPresenceRows[0]?.total ?? 0
    const presentColumns =
      typeof presentColumnsRaw === 'bigint'
        ? Number(presentColumnsRaw)
        : Number(presentColumnsRaw)
    const hasPositionColumns = Number.isFinite(presentColumns) && presentColumns >= 3

    const selectPositionSamples = hasPositionColumns
      ? Prisma.sql`t.positionSamples`
      : Prisma.sql`JSON_ARRAY()`
    const selectTrajectorySegments = hasPositionColumns
      ? Prisma.sql`t.trajectorySegments`
      : Prisma.sql`JSON_ARRAY()`
    const selectDeathSamples = hasPositionColumns
      ? Prisma.sql`t.deathSamples`
      : Prisma.sql`JSON_ARRAY()`

    const rows = await prisma.$queryRaw<TelemetryRow[]>(Prisma.sql`
      SELECT
        sm.mapName,
        ${selectPositionSamples} AS positionSamples,
        ${selectTrajectorySegments} AS trajectorySegments,
        ${selectDeathSamples} AS deathSamples
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
      ORDER BY sm.createdAt DESC
    `)

    const clanMembers = await prisma.clanMember.findMany({
      where: { clanId: parsedClanId },
      select: {
        displayName: true,
        pubgPlayerName: true,
        pubgAccountId: true,
      },
    })

    const labelByExactKey = new Map<string, string>()
    const labelByLowerKey = new Map<string, string>()
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

    const mapSummaries = new Map<string, MapSummary>()

    for (const row of rows) {
      const current = mapSummaries.get(row.mapName) ?? {
        mapName: row.mapName,
        matches: 0,
        positionPoints: 0,
        rotationPoints: 0,
        deathPoints: 0,
      }

      current.matches += 1
      current.positionPoints += asArray<unknown>(row.positionSamples).length
      current.rotationPoints += asArray<unknown>(row.trajectorySegments).length
      current.deathPoints += asArray<unknown>(row.deathSamples).length
      mapSummaries.set(row.mapName, current)
    }

    const maps = Array.from(mapSummaries.values()).sort((left, right) => {
      if (right.matches !== left.matches) {
        return right.matches - left.matches
      }

      return left.mapName.localeCompare(right.mapName)
    })

    const mapLabels = await getMapLabels()
    const phaseLabels = await getPhaseLabels()
    const selectedMap = mapName && maps.some((entry) => entry.mapName === mapName)
      ? mapName
      : maps[0]?.mapName ?? null

    const selectedRows = selectedMap
      ? rows.filter((row) => row.mapName === selectedMap)
      : []

    const positions = new Map<string, HeatmapCell>()
    const rotations = new Map<string, HeatmapCell>()
    const deaths = new Map<string, HeatmapCell>()
    const lines = new Map<
      string,
      { fromXIndex: number; fromYIndex: number; toXIndex: number; toYIndex: number; count: number }
    >()
    const members = new Map<string, number>()
    const phases = new Set<number>()

    for (const row of selectedRows) {
      for (const point of asArray<PositionSampleRow>(row.positionSamples)) {
        const x = parseNumber(point.x)
        const y = parseNumber(point.y)
        const pointMemberKey = parseString(point.memberKey)
        const pointPhase = parseNumber(point.phase)

        if (pointMemberKey) {
          members.set(pointMemberKey, (members.get(pointMemberKey) ?? 0) + 1)
        }
        if (pointPhase !== null && Number.isFinite(pointPhase) && pointPhase > 0) {
          phases.add(pointPhase)
        }

        if (memberKey && pointMemberKey !== memberKey) {
          continue
        }
        if (phaseFilter !== 'all' && pointPhase !== phaseFilter) {
          continue
        }
        if (x === null || y === null) {
          continue
        }
        const percent = toMapPercent(selectedMap, x, y)
        const cell = normalizeCell(percent.x, percent.y)
        incrementCell(positions, cell.xIndex, cell.yIndex)
      }

      for (const segment of asArray<TrajectorySegmentRow>(row.trajectorySegments)) {
        const fromX = parseNumber(segment.fromX)
        const fromY = parseNumber(segment.fromY)
        const toX = parseNumber(segment.toX)
        const toY = parseNumber(segment.toY)
        const segmentMemberKey = parseString(segment.memberKey)
        const segmentPhase = parseNumber(segment.phase)

        if (segmentMemberKey) {
          members.set(segmentMemberKey, (members.get(segmentMemberKey) ?? 0) + 1)
        }
        if (segmentPhase !== null && Number.isFinite(segmentPhase) && segmentPhase > 0) {
          phases.add(segmentPhase)
        }

        if (memberKey && segmentMemberKey !== memberKey) {
          continue
        }
        if (phaseFilter !== 'all' && segmentPhase !== phaseFilter) {
          continue
        }
        if (fromX === null || fromY === null || toX === null || toY === null) {
          continue
        }

        const midX = (fromX + toX) / 2
        const midY = (fromY + toY) / 2
        const percent = toMapPercent(selectedMap, midX, midY)
        const cell = normalizeCell(percent.x, percent.y)
        incrementCell(rotations, cell.xIndex, cell.yIndex)

        const fromPercent = toMapPercent(selectedMap, fromX, fromY)
        const toPercent = toMapPercent(selectedMap, toX, toY)
        const fromCell = normalizeCell(fromPercent.x, fromPercent.y)
        const toCell = normalizeCell(toPercent.x, toPercent.y)
        incrementLine(lines, fromCell.xIndex, fromCell.yIndex, toCell.xIndex, toCell.yIndex)
      }

      for (const point of asArray<PositionSampleRow>(row.deathSamples)) {
        const x = parseNumber(point.x)
        const y = parseNumber(point.y)
        const pointMemberKey = parseString(point.memberKey)
        const pointPhase = parseNumber(point.phase)

        if (pointMemberKey) {
          members.set(pointMemberKey, (members.get(pointMemberKey) ?? 0) + 1)
        }
        if (pointPhase !== null && Number.isFinite(pointPhase) && pointPhase > 0) {
          phases.add(pointPhase)
        }

        if (memberKey && pointMemberKey !== memberKey) {
          continue
        }
        if (phaseFilter !== 'all' && pointPhase !== phaseFilter) {
          continue
        }
        if (x === null || y === null) {
          continue
        }
        const percent = toMapPercent(selectedMap, x, y)
        const cell = normalizeCell(percent.x, percent.y)
        incrementCell(deaths, cell.xIndex, cell.yIndex)
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

    const selectedMemberKey = memberKey && members.has(memberKey) ? memberKey : null
    for (const key of Object.keys(phaseLabels)) {
      const numeric = Number(key)
      if (Number.isFinite(numeric) && numeric > 0) {
        phases.add(numeric)
      }
    }

    const phaseOptions = Array.from(phases.values()).sort((left, right) => left - right)
    const selectedPhase =
      phaseFilter !== 'all' && phases.has(phaseFilter)
        ? phaseFilter
        : 'all'

    const selectedMapLabel = selectedMap ? mapDisplayName(selectedMap, mapLabels) : null
    const note =
      'Heatmaps basees sur les positions samplees toutes les ~10 s, les segments de rotation derivent des ecarts entre echantillons, et les zones de mort proviennent des localisations de victime quand elles sont disponibles.'

    const payload: SelectedHeatmapData = {
      gridSize: GRID_SIZE,
      selectedMap,
      selectedMapLabel,
      selectedMemberKey,
      selectedPhase,
      view: 'predilection',
      maps,
      members: memberOptions,
      phases: phaseOptions,
      positions: sortCells(positions),
      rotations: sortCells(rotations),
      trajectoryLines: Array.from(lines.values())
        .map((entry) => ({
          fromX: ((entry.fromXIndex + 0.5) / GRID_SIZE) * 100,
          fromY: ((entry.fromYIndex + 0.5) / GRID_SIZE) * 100,
          toX: ((entry.toXIndex + 0.5) / GRID_SIZE) * 100,
          toY: ((entry.toYIndex + 0.5) / GRID_SIZE) * 100,
          count: entry.count,
        }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 300),
      deaths: sortCells(deaths),
      note,
      mapLabels,
      phaseLabels,
    }

    return NextResponse.json(
      buildTelemetrySuccessResponse(
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
    )
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry positions heatmap failed:', error)
    return NextResponse.json(buildTelemetryErrorResponse('Failed to load telemetry heatmap'), {
      status: 500,
    })
  }
}
