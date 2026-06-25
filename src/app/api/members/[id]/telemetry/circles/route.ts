import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

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
      return NextResponse.json(buildTelemetryErrorResponse('Invalid member id', 'INVALID_MEMBER_ID'), {
        status: 400,
      })
    }

    const authError = await requireSameClanAsMember(memberId, request)
    if (authError) return authError

    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: { id: true, displayName: true, clanId: true },
    })

    if (!member) {
      return NextResponse.json(buildTelemetryErrorResponse('Member not found', 'MEMBER_NOT_FOUND'), {
        status: 404,
      })
    }

    const period = parsePeriod(new URL(request.url).searchParams.get('period'))
    const periodKey = toPeriodKey(period)

    const rows = await prisma.$queryRaw<
      Array<{
        avgBlueZoneHits: number
        avgCircleDelaySeconds: number
        avgVehicleRideEvents: number
        avgVehicleLeaveEvents: number
        avgPositionEvents: number
        zoneDisciplineScore: number
        matchesPlayed: number
      }>
    >(Prisma.sql`
      SELECT
        avgBlueZoneHits,
        avgCircleDelaySeconds,
        avgVehicleRideEvents,
        avgVehicleLeaveEvents,
        avgPositionEvents,
        zoneDisciplineScore,
        matchesPlayed
      FROM MemberTelemetryStats
      WHERE memberId = ${memberId}
        AND period = ${periodKey}
      LIMIT 1
    `)

    const circles = rows[0] ?? null

    const memberPayload = {
      id: member.id,
      displayName: member.displayName,
      clanId: member.clanId,
    }

    return NextResponse.json(
      buildTelemetrySuccessResponse(
        {
          scope: 'member',
          memberId: member.id,
          period,
          periodKey,
          count: circles ? 1 : 0,
        },
        {
          member: memberPayload,
          circles,
        },
        {
          member: memberPayload,
          period,
          periodKey,
          circles,
        }
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    return NextResponse.json(buildTelemetryErrorResponse('Failed to load member telemetry circles'), {
      status: 500,
    })
  }
}
