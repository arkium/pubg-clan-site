import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'

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

function isUnknownCircleColumns(error: unknown) {
  return (
    error instanceof Error &&
    (
      error.message.includes('avgCircleDelayPercent') ||
      error.message.includes('avgSafeZonePresencePercent') ||
      error.message.includes('avgFirstContactPhase') ||
      error.message.includes('avgOnFootDistanceMeters') ||
      error.message.includes('avgVehicleDistanceMeters') ||
      error.message.includes('avgDamageTaken')
    )
  )
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

    let rows: Array<{
      aggressionScore: number
      supportScore: number
      zoneDisciplineScore: number
      avgBlueZoneHits: number
      avgFirstContactPhase: number
      avgCircleDelaySeconds: number
      avgCircleDelayPercent: number
      avgSafeZonePresencePercent: number
      avgOnFootDistanceMeters: number
      avgVehicleDistanceMeters: number
      avgDamageTaken: number
      avgVehicleRideEvents: number
      avgVehicleLeaveEvents: number
      avgPositionEvents: number
      matchesPlayed: number
    }>

    try {
      rows = await prisma.$queryRaw<
        Array<{
          aggressionScore: number
          supportScore: number
          zoneDisciplineScore: number
          avgBlueZoneHits: number
          avgFirstContactPhase: number
          avgCircleDelaySeconds: number
          avgCircleDelayPercent: number
          avgSafeZonePresencePercent: number
          avgOnFootDistanceMeters: number
          avgVehicleDistanceMeters: number
          avgDamageTaken: number
          avgVehicleRideEvents: number
          avgVehicleLeaveEvents: number
          avgPositionEvents: number
          matchesPlayed: number
        }>
      >(Prisma.sql`
        SELECT
          aggressionScore,
          supportScore,
          zoneDisciplineScore,
          avgBlueZoneHits,
          avgFirstContactPhase,
          avgCircleDelaySeconds,
          avgCircleDelayPercent,
          avgSafeZonePresencePercent,
          avgOnFootDistanceMeters,
          avgVehicleDistanceMeters,
          avgDamageTaken,
          avgVehicleRideEvents,
          avgVehicleLeaveEvents,
          avgPositionEvents,
          matchesPlayed
        FROM MemberTelemetryStats
        WHERE memberId = ${memberId}
          AND period = ${periodKey}
        LIMIT 1
      `)
    } catch (queryError) {
      if (!isUnknownCircleColumns(queryError)) {
        throw queryError
      }

      rows = await prisma.$queryRaw<
        Array<{
          aggressionScore: number
          supportScore: number
          zoneDisciplineScore: number
          avgBlueZoneHits: number
          avgFirstContactPhase: number
          avgCircleDelaySeconds: number
          avgCircleDelayPercent: number
          avgSafeZonePresencePercent: number
          avgOnFootDistanceMeters: number
          avgVehicleDistanceMeters: number
          avgDamageTaken: number
          avgVehicleRideEvents: number
          avgVehicleLeaveEvents: number
          avgPositionEvents: number
          matchesPlayed: number
        }>
      >(Prisma.sql`
        SELECT
          aggressionScore,
          supportScore,
          zoneDisciplineScore,
          avgBlueZoneHits,
          0 AS avgFirstContactPhase,
          avgCircleDelaySeconds,
          0 AS avgCircleDelayPercent,
          100 AS avgSafeZonePresencePercent,
          0 AS avgOnFootDistanceMeters,
          0 AS avgVehicleDistanceMeters,
          0 AS avgDamageTaken,
          avgVehicleRideEvents,
          avgVehicleLeaveEvents,
          avgPositionEvents,
          matchesPlayed
        FROM MemberTelemetryStats
        WHERE memberId = ${memberId}
          AND period = ${periodKey}
        LIMIT 1
      `)
    }

    const stats = rows[0] ?? null

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
          count: stats ? 1 : 0,
        },
        {
          member: memberPayload,
          stats,
        },
        {
          member: memberPayload,
          period,
          periodKey,
          stats,
        }
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    return NextResponse.json(buildTelemetryErrorResponse('Failed to load member telemetry playstyle'), {
      status: 500,
    })
  }
}
