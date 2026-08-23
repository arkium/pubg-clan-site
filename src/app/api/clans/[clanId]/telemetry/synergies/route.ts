import { NextResponse } from 'next/server'
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

    const roleError = await requireNavPermission('clan.overview')(request, {
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
        memberAId: number
        memberAName: string
        memberBId: number
        memberBName: string
        reviveCount: number
        recallCount: number
        coKillCount: number
        sharedDamageEvents: number
      }>
    >(Prisma.sql`
      SELECT
        sts.memberAId,
        a.displayName AS memberAName,
        sts.memberBId,
        b.displayName AS memberBName,
        sts.reviveCount,
        sts.recallCount,
        sts.coKillCount,
        sts.sharedDamageEvents
      FROM ClanSynergyTelemetryStats sts
      INNER JOIN ClanMember a ON a.id = sts.memberAId
      INNER JOIN ClanMember b ON b.id = sts.memberBId
      WHERE sts.clanId = ${parsedClanId}
        AND sts.period = ${periodKey}
      ORDER BY sts.reviveCount DESC, sts.coKillCount DESC, sts.sharedDamageEvents DESC
    `)

    return NextResponse.json(
      buildTelemetrySuccessResponse(
        {
          scope: 'clan',
          clanId: parsedClanId,
          period,
          periodKey,
          count: rows.length,
        },
        {
          rows,
        },
        {
          clanId: parsedClanId,
          period,
          periodKey,
          count: rows.length,
          rows,
        }
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry synergies failed:', error)
    return NextResponse.json(buildTelemetryErrorResponse('Failed to load telemetry synergies'), {
      status: 500,
    })
  }
}
