import { Prisma } from '@prisma/client'

import {
  countNearbyPlayersBreakdown,
  dropPressureCount,
  dropPressureLevel,
  type DropPressureLevel,
  type DropPressureSample,
} from '@/lib/drop-zone-pressure'
import { getMapLocations } from '@/lib/map-location-service'
import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { getMapBounds, clamp01 } from '@/lib/pubg-telemetry/position-heatmap'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'

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
  nearbyPlayerCount250m: number
  nearbyOpponentCount250m: number | null
  pressureLevel: DropPressureLevel
}


function parseClanId(value: string) {
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
  teamId?: unknown
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

    const roleError = await requireNavPermission('clan.drop-zones')(request, { clanId: parsedClanId })
    if (roleError) return roleError

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
      memberId: number
      memberName: string
      pubgAccountId: string | null
      pubgPlayerName: string
      landingSamples: unknown
      landingSamplesGz: unknown
    }

    const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        t.squadMatchId,
        sm.mapName,
        cm.id AS memberId,
        cm.displayName AS memberName,
        cm.pubgAccountId,
        cm.pubgPlayerName,
        t.landingSamples,
        t.landingSamplesGz
      FROM SquadMatchTelemetry t
      INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
      INNER JOIN SquadMember sdm ON sdm.squadMatchId = sm.id
      INNER JOIN ClanMember cm ON cm.id = sdm.memberId
      WHERE t.status = 'success'
        AND (t.landingSamples IS NOT NULL OR t.landingSamplesGz IS NOT NULL)
        AND cm.clanId = ${parsedClanId}
        ${dateFilter}
      ORDER BY sm.createdAt DESC
    `)

    const landingPoints: LandingPoint[] = []

    for (const row of rows) {
      const mapName = typeof row.mapName === 'string' ? row.mapName : 'Baltic_Main'
      // Les deux formats coexistent le temps du rattrapage.
      const samples = parseLandingSamples(decodeTelemetryRow(row).landingSamples)
      const pressureSamples: DropPressureSample[] = samples.flatMap((sample) => {
        const memberKey =
          typeof sample.memberKey === 'string' ? sample.memberKey.trim().toLowerCase() : ''
        const x = typeof sample.x === 'number' ? sample.x : null
        const y = typeof sample.y === 'number' ? sample.y : null
        // L'équipe permet d'exclure les coéquipiers du niveau de pression.
        const teamId = typeof sample.teamId === 'number' && Number.isInteger(sample.teamId) ? sample.teamId : undefined
        return memberKey && x !== null && y !== null ? [{ memberKey, teamId, x, y }] : []
      })
      const accountId = row.pubgAccountId?.toLowerCase()
      const playerName = row.pubgPlayerName?.toLowerCase()

      for (const sample of pressureSamples) {
        const { memberKey, x, y } = sample

        const mapBounds = getMapBounds(mapName)
        const xPct = clamp01(x / mapBounds.width) * 100
        const yPct = clamp01(y / mapBounds.height) * 100

        // Landing points: only the clan member's own landing, matched by PUBG account ID or player name
        const isClanMember =
          (accountId !== undefined && memberKey === accountId) ||
          (playerName !== undefined && memberKey === playerName)

        if (isClanMember) {
          const pressure = countNearbyPlayersBreakdown(pressureSamples, memberKey, x, y)
          landingPoints.push({
            memberId: row.memberId,
            memberName: row.memberName,
            matchId: row.squadMatchId,
            mapName,
            x,
            y,
            xPct: Number(xPct.toFixed(2)),
            yPct: Number(yPct.toFixed(2)),
            nearbyPlayerCount250m: pressure.nearbyPlayerCount,
            nearbyOpponentCount250m: pressure.nearbyOpponentCount,
            pressureLevel: dropPressureLevel(dropPressureCount(pressure)),
          })
        }
      }
    }

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
          scope: 'clan',
          clanId: parsedClanId,
          period,
          periodKey,
          count: landingPoints.length,
        },
        {
          // La densité de tout le lobby (`heatmap`) a été retirée le 2026-09-27 : plus aucune page ne l'affichait.
          points: landingPoints,
          options: {
            mapLocations: activeLocations,
          },
        },
        {
          clanId: parsedClanId,
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

    console.error('Drop zones telemetry failed:', error)
    return Response.json(buildTelemetryErrorResponse('Failed to load drop zones'), {
      status: 500,
    })
  }
}
