import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { getMapBounds, clamp01 } from '@/lib/pubg-telemetry/position-heatmap'

type TelemetryPeriod = 'week' | 'month' | 'all'

type LandingPoint = {
  memberId: number
  memberName: string
  matchId: string
  mapName: string
  x: number
  y: number
  xPct: number
  yPct: number
}

type HeatmapCell = {
  mapName: string
  xIndex: number
  yIndex: number
  count: number
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

type LandingSampleRow = {
  memberKey?: unknown
  x?: unknown
  y?: unknown
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return NextResponse.json(
        buildTelemetryErrorResponse('Invalid member id', 'INVALID_MEMBER_ID'),
        {
          status: 400,
        }
      )
    }

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
      return NextResponse.json(buildTelemetryErrorResponse('Member not found', 'MEMBER_NOT_FOUND'), {
        status: 404,
      })
    }

    const url = new URL(request.url)
    const period = parsePeriod(url.searchParams.get('period'))
    const periodKey = toPeriodKey(period)
    const bounds = getPeriodBounds(period)
    const dateFilter = bounds
      ? Prisma.sql`AND sm.createdAt >= ${bounds.startDate} AND sm.createdAt <= ${bounds.endDate}`
      : Prisma.empty

    type RawRow = {
      squadMatchId: string
      mapName: string
      landingSamples: unknown
    }

    const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
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

    const landingPoints: LandingPoint[] = []
    const heatmapMap = new Map<string, number>()
    const accountId = member.pubgAccountId?.toLowerCase()
    const playerName = member.pubgPlayerName?.toLowerCase()

    for (const row of rows) {
      const mapName = typeof row.mapName === 'string' ? row.mapName : 'Baltic_Main'
      const samples = parseLandingSamples(row.landingSamples)

      for (const sample of samples as LandingSampleRow[]) {
        const memberKey =
          typeof sample.memberKey === 'string' ? sample.memberKey.toLowerCase() : null
        if (!memberKey) continue

        const x = typeof sample.x === 'number' ? sample.x : null
        const y = typeof sample.y === 'number' ? sample.y : null
        if (x === null || y === null) continue

        const mapBounds = getMapBounds(mapName)
        const xPct = clamp01(x / mapBounds.width) * 100
        const yPct = clamp01(y / mapBounds.height) * 100

        // Landing points: only this member's own landing spot
        const isMember =
          (accountId !== undefined && memberKey === accountId) ||
          (playerName !== undefined && memberKey === playerName)

        if (isMember) {
          landingPoints.push({
            memberId: member.id,
            memberName: member.displayName,
            matchId: row.squadMatchId,
            mapName,
            x,
            y,
            xPct: Number(xPct.toFixed(2)),
            yPct: Number(yPct.toFixed(2)),
          })
        }

        // Heatmap: all players including opponents
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

    return NextResponse.json(
      buildTelemetrySuccessResponse(
        {
          scope: 'member',
          memberId,
          period,
          periodKey,
          count: landingPoints.length,
        },
        {
          member: {
            id: member.id,
            displayName: member.displayName,
            clanId: member.clanId,
          },
          gridSize: GRID_SIZE,
          points: landingPoints,
          heatmap: heatmapCells,
        },
        {
          memberId,
          period,
          periodKey,
          total: landingPoints.length,
        }
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    return NextResponse.json(buildTelemetryErrorResponse('Failed to load member drop zones'), {
      status: 500,
    })
  }
}