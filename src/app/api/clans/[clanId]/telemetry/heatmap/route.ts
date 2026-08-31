import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'

import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'

type TelemetryPeriod = 'week' | 'month' | 'all'

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

    const roleError = await requireNavPermission('clan.heatmap-kills')(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const url = new URL(request.url)
    const period = parsePeriod(url.searchParams.get('period'))
    const periodKey = toPeriodKey(period)
    const mapName = parseMap(url.searchParams.get('map'))

    const bounds = getPeriodBounds(period)
    const dateFilter = bounds
      ? Prisma.sql`AND sm.createdAt >= ${bounds.startDate} AND sm.createdAt <= ${bounds.endDate}`
      : Prisma.empty

    const mapFilter = mapName ? Prisma.sql`AND sm.mapName = ${mapName}` : Prisma.empty

    const rows = await prisma.$queryRaw<
      Array<{
        mapName: string
        matches: number
        killEvents: number
        positionEvents: number
      }>
    >(Prisma.sql`
      SELECT
        sm.mapName,
        COUNT(*) AS matches,
        COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.summary, '$.killEvents')) AS UNSIGNED)), 0) AS killEvents,
        COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.summary, '$.positionEvents')) AS UNSIGNED)), 0) AS positionEvents
      FROM SquadMatchTelemetry t
      INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
      WHERE t.status = 'success'
        ${dateFilter}
        ${mapFilter}
        AND EXISTS (
          SELECT 1
          FROM SquadMember sdm
          INNER JOIN ClanMember cm ON cm.id = sdm.memberId
          WHERE sdm.squadMatchId = sm.id
            AND cm.clanId = ${parsedClanId}
        )
      GROUP BY sm.mapName
      ORDER BY matches DESC, killEvents DESC
    `)

    const totalMatches = rows.reduce((sum, row) => sum + Number(row.matches), 0)

    const maps = rows.map((row) => ({
      mapName: row.mapName,
      matches: Number(row.matches),
      killEvents: Number(row.killEvents),
      positionEvents: Number(row.positionEvents),
    }))

    const note =
      'Heatmap geospatiale fine non disponible avec parser v1: endpoint expose une base map-level pour preparer la couche UI et les filtres.'

    return Response.json(
      buildTelemetrySuccessResponse(
        {
          scope: 'clan',
          clanId: parsedClanId,
          period,
          periodKey,
          count: maps.length,
        },
        {
          selectedMap: mapName,
          totalMatches,
          maps,
          note,
        },
        {
          clanId: parsedClanId,
          period,
          periodKey,
          selectedMap: mapName,
          totalMatches,
          maps,
          note,
        }
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry heatmap failed:', error)
    return Response.json(buildTelemetryErrorResponse('Failed to load telemetry heatmap'), {
      status: 500,
    })
  }
}
