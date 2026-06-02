import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

type TelemetryPeriod = 'week' | 'month' | 'all'

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return NextResponse.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: { id: true, displayName: true, clanId: true },
    })

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const period = parsePeriod(new URL(request.url).searchParams.get('period'))
    const periodKey = toPeriodKey(period)

    const rows = await prisma.$queryRaw<
      Array<{
        aggressionScore: number
        supportScore: number
        zoneDisciplineScore: number
        avgBlueZoneHits: number
        avgCircleDelaySeconds: number
        matchesPlayed: number
      }>
    >(Prisma.sql`
      SELECT
        aggressionScore,
        supportScore,
        zoneDisciplineScore,
        avgBlueZoneHits,
        avgCircleDelaySeconds,
        matchesPlayed
      FROM MemberTelemetryStats
      WHERE memberId = ${memberId}
        AND period = ${periodKey}
      LIMIT 1
    `)

    const stats = rows[0] ?? null

    return NextResponse.json({
      ok: true,
      member: {
        id: member.id,
        displayName: member.displayName,
        clanId: member.clanId,
      },
      period,
      periodKey,
      stats,
    })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Failed to load member telemetry playstyle' }, { status: 500 })
  }
}
