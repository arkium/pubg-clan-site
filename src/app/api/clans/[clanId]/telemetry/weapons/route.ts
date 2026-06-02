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
        weaponName: string
        kills: number
        headshots: number
        avgDistance: number
        matchCount: number
      }>
    >(Prisma.sql`
      SELECT
        ws.memberId,
        cm.displayName,
        cm.pubgPlayerName,
        ws.weaponName,
        ws.kills,
        ws.headshots,
        ws.avgDistance,
        ws.matchCount
      FROM MemberWeaponStats ws
      INNER JOIN ClanMember cm ON cm.id = ws.memberId
      WHERE cm.clanId = ${parsedClanId}
        AND ws.period = ${periodKey}
      ORDER BY ws.kills DESC, ws.headshots DESC, ws.matchCount DESC
    `)

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      period,
      periodKey,
      count: rows.length,
      rows,
      note:
        rows.length === 0
          ? 'Aucune ligne disponible actuellement. Le parser v1 ne fournit pas encore une attribution arme par membre.'
          : null,
    })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Telemetry weapons failed:', error)
    return NextResponse.json({ error: 'Failed to load telemetry weapons' }, { status: 500 })
  }
}
