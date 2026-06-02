import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { requireRole } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
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
    const bounds = getPeriodBounds(period)
    const dateFilter = bounds
      ? Prisma.sql`AND sm.createdAt >= ${bounds.startDate} AND sm.createdAt <= ${bounds.endDate}`
      : Prisma.empty

    const rows = await prisma.$queryRaw<
      Array<{
        snapshots: number
        itemUseEvents: number
      }>
    >(Prisma.sql`
      SELECT
        COUNT(*) AS snapshots,
        COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.summary, '$.itemUseEvents')) AS UNSIGNED)), 0) AS itemUseEvents
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
    `)

    const summary = rows[0] ?? { snapshots: 0, itemUseEvents: 0 }
    const snapshots = Number(summary.snapshots)
    const itemUseEvents = Number(summary.itemUseEvents)

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      period,
      periodKey,
      loot: {
        snapshots,
        itemUseEvents,
        avgItemUseEventsPerMatch: snapshots > 0 ? Number((itemUseEvents / snapshots).toFixed(2)) : 0,
      },
    })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Telemetry loot failed:', error)
    return NextResponse.json({ error: 'Failed to load telemetry loot' }, { status: 500 })
  }
}
