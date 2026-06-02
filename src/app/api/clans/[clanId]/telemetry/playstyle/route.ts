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

    const rows = await prisma.$queryRaw<
      Array<{
        memberId: number
        displayName: string
        pubgPlayerName: string
        aggressionScore: number
        supportScore: number
        zoneDisciplineScore: number
        avgBlueZoneHits: number
        avgCircleDelaySeconds: number
        matchesPlayed: number
      }>
    >(Prisma.sql`
      SELECT
        mts.memberId,
        cm.displayName,
        cm.pubgPlayerName,
        mts.aggressionScore,
        mts.supportScore,
        mts.zoneDisciplineScore,
        mts.avgBlueZoneHits,
        mts.avgCircleDelaySeconds,
        mts.matchesPlayed
      FROM MemberTelemetryStats mts
      INNER JOIN ClanMember cm ON cm.id = mts.memberId
      WHERE cm.clanId = ${parsedClanId}
        AND mts.period = ${periodKey}
      ORDER BY mts.aggressionScore DESC, mts.supportScore DESC, mts.matchesPlayed DESC
    `)

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      period,
      periodKey,
      count: rows.length,
      rows,
    })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Telemetry playstyle failed:', error)
    return NextResponse.json({ error: 'Failed to load telemetry playstyle' }, { status: 500 })
  }
}
