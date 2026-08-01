import { Prisma } from '@prisma/client'

import {
  countNearbyPlayers,
  dropPressureLevel,
  type DropPressureLevel,
  type DropPressureSample,
} from '@/lib/drop-zone-pressure'
import { getMapLocations } from '@/lib/map-location-service'
import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { clamp01, getMapBounds } from '@/lib/pubg-telemetry/position-heatmap'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

type TelemetryPeriod = 'week' | 'month' | 'all'
type DropZonesScope = 'self' | 'member' | 'clan' | 'best'
type BestMode = 'duo' | 'trio' | 'squad'

type LandingPoint = {
  memberId: number
  memberName: string
  matchId: string
  mapName: string
  x: number
  y: number
  xPct: number
  yPct: number
  nearbyPlayerCount250m: number
  pressureLevel: DropPressureLevel
}

type HeatmapCell = {
  mapName: string
  xIndex: number
  yIndex: number
  count: number
}

type LandingSampleRow = {
  memberKey?: unknown
  x?: unknown
  y?: unknown
}

type RawRow = {
  squadMatchId: string
  mapName: string
  landingSamples: unknown
}

const GRID_SIZE = 40

function parseMemberId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): TelemetryPeriod {
  if (value === 'month' || value === 'all') return value
  return 'week'
}

function parseScope(value: string | null): DropZonesScope {
  if (value === 'member' || value === 'clan' || value === 'best') return value
  return 'self'
}

function parseBestMode(value: string | null): BestMode {
  if (value === 'trio' || value === 'squad') return value
  return 'duo'
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
  if (period === 'all') return 'all-time'
  if (period === 'month') {
    return `month-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
  return `week-${now.getFullYear()}-${String(getIsoWeek(now)).padStart(2, '0')}`
}

function getPeriodBounds(period: TelemetryPeriod, now = new Date()) {
  if (period === 'all') return null
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
  return { startDate: monday, endDate: sunday }
}

function parseLandingSamples(raw: unknown): LandingSampleRow[] {
  if (Array.isArray(raw)) return raw as LandingSampleRow[]
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as LandingSampleRow[]) : []
    } catch {
      return []
    }
  }
  return []
}

function normalizeMemberKey(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return Response.json(buildTelemetryErrorResponse('Invalid member id', 'INVALID_MEMBER_ID'), {
        status: 400,
      })
    }

    const authError = await requireSameClanAsMember(memberId, request)
    if (authError) return authError

    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        displayName: true,
        pubgAccountId: true,
        pubgPlayerName: true,
        clanId: true,
      },
    })

    if (!member) {
      return Response.json(buildTelemetryErrorResponse('Member not found', 'MEMBER_NOT_FOUND'), {
        status: 404,
      })
    }

    const url = new URL(request.url)
    const period = parsePeriod(url.searchParams.get('period'))
    const scope = parseScope(url.searchParams.get('scope'))
    const bestMode = parseBestMode(url.searchParams.get('bestMode'))
    const targetMemberIdValue = url.searchParams.get('targetMemberId')
    const targetMemberId = targetMemberIdValue ? Number(targetMemberIdValue) : null
    const periodKey = toPeriodKey(period)
    const bounds = getPeriodBounds(period)
    const dateFilter = bounds
      ? Prisma.sql`AND sm.createdAt >= ${bounds.startDate} AND sm.createdAt <= ${bounds.endDate}`
      : Prisma.empty

    const clanMembers = member.clanId
      ? await prisma.clanMember.findMany({
          where: { clanId: member.clanId, isActive: true },
          select: {
            id: true,
            displayName: true,
            pubgAccountId: true,
            pubgPlayerName: true,
          },
          orderBy: { displayName: 'asc' },
        })
      : [
          {
            id: member.id,
            displayName: member.displayName,
            pubgAccountId: member.pubgAccountId,
            pubgPlayerName: member.pubgPlayerName,
          },
        ]

    const memberOptions = clanMembers.map((entry) => ({
      id: entry.id,
      displayName: entry.displayName,
    }))

    const effectiveScope = scope === 'clan' && !member.clanId ? 'self' : scope
    const effectiveMemberId =
      effectiveScope === 'member' &&
      targetMemberId &&
      memberOptions.some((entry) => entry.id === targetMemberId)
        ? targetMemberId
        : memberId

    let scopeLabel = `Drop zones de ${member.displayName}`
    let selectedTargetMemberId: number | null = null
    let rows: RawRow[] = []
    const landingMemberIds = new Set<number>()

    if (effectiveScope === 'member') {
      selectedTargetMemberId = effectiveMemberId
      const selectedMember = clanMembers.find((entry) => entry.id === effectiveMemberId)
      scopeLabel = `Drop zones de ${selectedMember?.displayName ?? `Joueur #${effectiveMemberId}`}`
      landingMemberIds.add(effectiveMemberId)

      rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
        SELECT
          t.squadMatchId,
          sm.mapName,
          t.landingSamples
        FROM SquadMatchTelemetry t
        INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
        INNER JOIN SquadMember sdm ON sdm.squadMatchId = sm.id
        WHERE t.status = 'success'
          AND t.landingSamples IS NOT NULL
          AND sdm.memberId = ${effectiveMemberId}
          ${dateFilter}
        ORDER BY sm.createdAt DESC
      `)
    } else if (effectiveScope === 'clan') {
      scopeLabel = 'Drop zones du clan'
      const clanId = member.clanId
      for (const clanMember of clanMembers) {
        landingMemberIds.add(clanMember.id)
      }

      if (clanId) {
        rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
          SELECT DISTINCT
            t.squadMatchId,
            sm.mapName,
            t.landingSamples
          FROM SquadMatchTelemetry t
          INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
          INNER JOIN SquadMember sdm ON sdm.squadMatchId = sm.id
          INNER JOIN ClanMember cm ON cm.id = sdm.memberId
          WHERE t.status = 'success'
            AND t.landingSamples IS NOT NULL
            AND cm.clanId = ${clanId}
            ${dateFilter}
          ORDER BY sm.createdAt DESC
        `)
      }
    } else if (effectiveScope === 'best') {
      type TeamAggregate = {
        teammateIds: number[]
        matches: number
        wins: number
        placements: number
        matchIds: string[]
      }

      const squadMatches = await prisma.squadMatch.findMany({
        where: {
          ...(bounds ? { createdAt: { gte: bounds.startDate, lte: bounds.endDate } } : {}),
          members: {
            some: { memberId },
          },
        },
        select: {
          id: true,
          placement: true,
          members: {
            select: {
              memberId: true,
            },
            orderBy: { memberId: 'asc' },
          },
        },
      })

      const aggregates = new Map<string, TeamAggregate>()

      for (const match of squadMatches) {
        const members = match.members
        const isMatchingMode =
          (bestMode === 'duo' && members.length === 2) ||
          (bestMode === 'trio' && members.length === 3) ||
          (bestMode === 'squad' && members.length >= 4)

        if (!isMatchingMode) {
          continue
        }

        const teammates = members.filter((entry) => entry.memberId !== memberId)
        if (teammates.length === 0) {
          continue
        }

        const teammateIds = teammates.map((entry) => entry.memberId)
        const key = teammateIds.join(':')
        const current = aggregates.get(key) ?? {
          teammateIds,
          matches: 0,
          wins: 0,
          placements: 0,
          matchIds: [],
        }

        current.matches += 1
        current.wins += match.placement === 1 ? 1 : 0
        current.placements += match.placement
        current.matchIds.push(match.id)
        aggregates.set(key, current)
      }

      const bestTeam = Array.from(aggregates.values()).sort((left, right) => {
        if (right.wins !== left.wins) {
          return right.wins - left.wins
        }
        if (right.matches !== left.matches) {
          return right.matches - left.matches
        }
        const leftAveragePlacement =
          left.matches > 0 ? left.placements / left.matches : Number.POSITIVE_INFINITY
        const rightAveragePlacement =
          right.matches > 0 ? right.placements / right.matches : Number.POSITIVE_INFINITY
        return leftAveragePlacement - rightAveragePlacement
      })[0]

      const bestTeamMemberIds = bestTeam ? [memberId, ...bestTeam.teammateIds] : [memberId]
      for (const id of bestTeamMemberIds) {
        landingMemberIds.add(id)
      }

      const bestTeamNames = bestTeamMemberIds
        .map((id) => clanMembers.find((entry) => entry.id === id)?.displayName)
        .filter((name): name is string => typeof name === 'string' && name.length > 0)

      scopeLabel =
        bestTeamNames.length > 0
          ? `Meilleur ${bestMode}: ${bestTeamNames.join(', ')}`
          : `Meilleur ${bestMode} indisponible`

      if (bestTeam && bestTeam.matchIds.length > 0) {
        rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
          SELECT
            t.squadMatchId,
            sm.mapName,
            t.landingSamples
          FROM SquadMatchTelemetry t
          INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
          WHERE t.status = 'success'
            AND t.landingSamples IS NOT NULL
            AND t.squadMatchId IN (${Prisma.join(bestTeam.matchIds)})
          ORDER BY sm.createdAt DESC
        `)
      }
    } else {
      landingMemberIds.add(memberId)

      rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
        SELECT
          t.squadMatchId,
          sm.mapName,
          t.landingSamples
        FROM SquadMatchTelemetry t
        INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
        INNER JOIN SquadMember sdm ON sdm.squadMatchId = sm.id
        WHERE t.status = 'success'
          AND t.landingSamples IS NOT NULL
          AND sdm.memberId = ${memberId}
          ${dateFilter}
        ORDER BY sm.createdAt DESC
      `)
    }

    const trackedMemberKeys = new Map<string, { memberId: number; memberName: string }>()
    for (const id of landingMemberIds) {
      const selectedMember = clanMembers.find((entry) => entry.id === id)
      const memberName = selectedMember?.displayName ?? `Joueur #${id}`
      const accountKey = normalizeMemberKey(selectedMember?.pubgAccountId)
      const playerKey = normalizeMemberKey(selectedMember?.pubgPlayerName)
      if (accountKey) {
        trackedMemberKeys.set(accountKey, { memberId: id, memberName })
      }
      if (playerKey) {
        trackedMemberKeys.set(playerKey, { memberId: id, memberName })
      }
    }

    const landingPoints: LandingPoint[] = []
    const heatmapMap = new Map<string, number>()

    for (const row of rows) {
      const mapName = typeof row.mapName === 'string' ? row.mapName : 'Baltic_Main'
      const samples = parseLandingSamples(row.landingSamples)
      const pressureSamples: DropPressureSample[] = samples.flatMap((sample) => {
        const memberKey =
          typeof sample.memberKey === 'string' ? sample.memberKey.trim().toLowerCase() : ''
        const x = typeof sample.x === 'number' ? sample.x : null
        const y = typeof sample.y === 'number' ? sample.y : null
        return memberKey && x !== null && y !== null ? [{ memberKey, x, y }] : []
      })

      for (const sample of pressureSamples) {
        const { memberKey, x, y } = sample

        const mapBounds = getMapBounds(mapName)
        const xPct = clamp01(x / mapBounds.width) * 100
        const yPct = clamp01(y / mapBounds.height) * 100

        const trackedMember = trackedMemberKeys.get(memberKey)
        if (trackedMember) {
          const nearbyPlayerCount250m = countNearbyPlayers(pressureSamples, memberKey, x, y)
          landingPoints.push({
            memberId: trackedMember.memberId,
            memberName: trackedMember.memberName,
            matchId: row.squadMatchId,
            mapName,
            x,
            y,
            xPct: Number(xPct.toFixed(2)),
            yPct: Number(yPct.toFixed(2)),
            nearbyPlayerCount250m,
            pressureLevel: dropPressureLevel(nearbyPlayerCount250m),
          })
        }

        const xIndex = Math.min(Math.floor((xPct / 100) * GRID_SIZE), GRID_SIZE - 1)
        const yIndex = Math.min(Math.floor((yPct / 100) * GRID_SIZE), GRID_SIZE - 1)
        const cellKey = `${mapName}:${xIndex}:${yIndex}`
        heatmapMap.set(cellKey, (heatmapMap.get(cellKey) ?? 0) + 1)
      }
    }

    const heatmapCells: HeatmapCell[] = Array.from(heatmapMap.entries()).map(([key, count]) => {
      const parts = key.split(':')
      return {
        mapName: parts[0],
        xIndex: Number(parts[1]),
        yIndex: Number(parts[2]),
        count,
      }
    })
    const configuredLocations = await getMapLocations()
    const activeLocations = Object.fromEntries(
      Object.entries(configuredLocations).map(([mapName, locations]) => [
        mapName,
        locations.filter((location) => location.enabled),
      ])
    )

    return Response.json(
      buildTelemetrySuccessResponse(
        {
          scope: effectiveScope === 'clan' ? 'clan' : 'member',
          memberId,
          period,
          periodKey,
          count: landingPoints.length,
          scopeLabel,
        },
        {
          member: {
            id: member.id,
            displayName: member.displayName,
            clanId: member.clanId,
          },
          options: {
            members: memberOptions,
            bestModes: ['duo', 'trio', 'squad'] as BestMode[],
            mapLocations: activeLocations,
          },
          selected: {
            memberId,
            targetMemberId: selectedTargetMemberId,
            bestMode,
            period,
          },
          gridSize: GRID_SIZE,
          points: landingPoints,
          heatmap: heatmapCells,
        },
        {
          scope: effectiveScope,
          memberId,
          period,
          periodKey,
          total: landingPoints.length,
        }
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    return Response.json(buildTelemetryErrorResponse('Failed to load member drop zones'), {
      status: 500,
    })
  }
}