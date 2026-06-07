import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { requireRole } from '@/middleware/auth-permission'
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

function isUnknownCircleColumns(error: unknown) {
  return (
    error instanceof Error &&
    (
      error.message.includes('avgCircleDelayPercent') ||
      error.message.includes('avgSafeZonePresencePercent') ||
      error.message.includes('avgFirstContactPhase') ||
      error.message.includes('avgOnFootDistanceMeters') ||
      error.message.includes('avgVehicleDistanceMeters') ||
      error.message.includes('avgDamageTaken') ||
      error.message.includes('avgHealsUsed') ||
      error.message.includes('avgHealAmount') ||
      error.message.includes('avgBoostsUsed') ||
      error.message.includes('maxVehicleSpeedKph')
    )
  )
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

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const url = new URL(request.url)
    const period = parsePeriod(url.searchParams.get('period'))
    const periodKey = toPeriodKey(period)

    let rows: Array<{
      memberId: number
      displayName: string
      pubgPlayerName: string
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
      avgHealsUsed: number
      avgHealAmount: number
      avgBoostsUsed: number
      maxVehicleSpeedKph: number
      avgVehicleRideEvents: number
      avgVehicleLeaveEvents: number
      avgPositionEvents: number
      matchesPlayed: number
    }>

    try {
      rows = await prisma.$queryRaw<
        Array<{
          memberId: number
          displayName: string
          pubgPlayerName: string
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
          avgHealsUsed: number
          avgHealAmount: number
          avgBoostsUsed: number
          maxVehicleSpeedKph: number
          avgVehicleRideEvents: number
          avgVehicleLeaveEvents: number
          avgPositionEvents: number
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
          mts.avgFirstContactPhase,
          mts.avgCircleDelaySeconds,
          mts.avgCircleDelayPercent,
          mts.avgSafeZonePresencePercent,
          mts.avgOnFootDistanceMeters,
          mts.avgVehicleDistanceMeters,
          mts.avgDamageTaken,
          mts.avgHealsUsed,
          mts.avgHealAmount,
          mts.avgBoostsUsed,
          mts.maxVehicleSpeedKph,
          mts.avgVehicleRideEvents,
          mts.avgVehicleLeaveEvents,
          mts.avgPositionEvents,
          mts.matchesPlayed
        FROM MemberTelemetryStats mts
        INNER JOIN ClanMember cm ON cm.id = mts.memberId
        WHERE cm.clanId = ${parsedClanId}
          AND mts.period = ${periodKey}
        ORDER BY mts.aggressionScore DESC, mts.supportScore DESC, mts.matchesPlayed DESC
      `)
    } catch (queryError) {
      if (!isUnknownCircleColumns(queryError)) {
        throw queryError
      }

      rows = await prisma.$queryRaw<
        Array<{
          memberId: number
          displayName: string
          pubgPlayerName: string
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
          avgHealsUsed: number
          avgHealAmount: number
          avgBoostsUsed: number
          maxVehicleSpeedKph: number
          avgVehicleRideEvents: number
          avgVehicleLeaveEvents: number
          avgPositionEvents: number
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
          0 AS avgFirstContactPhase,
          mts.avgCircleDelaySeconds,
          0 AS avgCircleDelayPercent,
          100 AS avgSafeZonePresencePercent,
          0 AS avgOnFootDistanceMeters,
          0 AS avgVehicleDistanceMeters,
          0 AS avgDamageTaken,
          0 AS avgHealsUsed,
          0 AS avgHealAmount,
          0 AS avgBoostsUsed,
          0 AS maxVehicleSpeedKph,
          mts.avgVehicleRideEvents,
          mts.avgVehicleLeaveEvents,
          mts.avgPositionEvents,
          mts.matchesPlayed
        FROM MemberTelemetryStats mts
        INNER JOIN ClanMember cm ON cm.id = mts.memberId
        WHERE cm.clanId = ${parsedClanId}
          AND mts.period = ${periodKey}
        ORDER BY mts.aggressionScore DESC, mts.supportScore DESC, mts.matchesPlayed DESC
      `)
    }

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

    console.error('Telemetry playstyle failed:', error)
    return NextResponse.json(buildTelemetryErrorResponse('Failed to load telemetry playstyle'), {
      status: 500,
    })
  }
}
