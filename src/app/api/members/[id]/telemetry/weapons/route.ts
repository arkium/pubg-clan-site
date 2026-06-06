import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { getWeaponLabels, weaponDisplayName } from '@/lib/weapon-label-service'

type TelemetryPeriod = 'week' | 'month' | 'all'

type SnapshotWeaponRow = {
  weaponName: string
  killDistanceTotal: number
  killDistanceCount: number
  killDistanceMax?: number
}

type SnapshotMemberRow = {
  memberKey: string
  weapons: SnapshotWeaponRow[]
}

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

function getPeriodBounds(period: TelemetryPeriod, now = new Date()) {
  if (period === 'all') {
    return {
      startDate: new Date(0),
      endDate: new Date('9999-12-31T23:59:59.999Z'),
    }
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

function normalizeKey(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function asFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function parseSnapshotMemberStatsRows(raw: unknown): SnapshotMemberRow[] {
  if (typeof raw === 'string') {
    try {
      return parseSnapshotMemberStatsRows(JSON.parse(raw))
    } catch {
      return []
    }
  }

  if (!Array.isArray(raw)) {
    return []
  }

  const rows: SnapshotMemberRow[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const row = entry as Record<string, unknown>
    const memberKey = typeof row.memberKey === 'string' ? row.memberKey.trim() : ''
    if (!memberKey) {
      continue
    }

    const weaponsSource = Array.isArray(row.weapons) ? row.weapons : []
    const weapons: SnapshotWeaponRow[] = []

    for (const weaponEntry of weaponsSource) {
      if (!weaponEntry || typeof weaponEntry !== 'object') {
        continue
      }

      const weapon = weaponEntry as Record<string, unknown>
      const weaponName = typeof weapon.weaponName === 'string' ? weapon.weaponName.trim() : ''
      if (!weaponName) {
        continue
      }

      weapons.push({
        weaponName,
        killDistanceTotal: asFiniteNumber(weapon.killDistanceTotal),
        killDistanceCount: asFiniteNumber(weapon.killDistanceCount),
        killDistanceMax: asFiniteNumber(weapon.killDistanceMax),
      })
    }

    rows.push({
      memberKey,
      weapons,
    })
  }

  return rows
}

function resolveWeaponDistanceMax(weapon: SnapshotWeaponRow) {
  if (typeof weapon.killDistanceMax === 'number' && weapon.killDistanceMax > 0) {
    return weapon.killDistanceMax
  }

  if (weapon.killDistanceCount === 1 && weapon.killDistanceTotal > 0) {
    return weapon.killDistanceTotal
  }

  return null
}

function centimetersToMeters(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return value / 100
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
      select: { id: true, displayName: true, clanId: true, pubgAccountId: true, pubgPlayerName: true },
    })

    if (!member) {
      return NextResponse.json(buildTelemetryErrorResponse('Member not found', 'MEMBER_NOT_FOUND'), {
        status: 404,
      })
    }

    const period = parsePeriod(new URL(request.url).searchParams.get('period'))
    const periodKey = toPeriodKey(period)
    const bounds = getPeriodBounds(period)

    const rowsRaw = await prisma.$queryRaw<
      Array<{
        weaponName: string
        kills: number
        headshots: number
        shotsFired: number
        hitsLanded: number
        avgDistance: number
        maxDistance: number
        totalDamage: number
        matchCount: number
      }>
    >(Prisma.sql`
      SELECT
        weaponName,
        kills,
        headshots,
        shotsFired,
        hitsLanded,
        avgDistance,
        maxDistance,
        totalDamage,
        matchCount
      FROM MemberWeaponStats
      WHERE memberId = ${memberId}
        AND period = ${periodKey}
      ORDER BY kills DESC, headshots DESC, matchCount DESC
    `)

    const snapshots = await prisma.squadMatchTelemetry.findMany({
      where: {
        status: 'success',
        squadMatch: {
          createdAt: {
            gte: bounds.startDate,
            lte: bounds.endDate,
          },
          members: {
            some: {
              memberId,
            },
          },
        },
      },
      select: {
        memberStats: true,
      },
    })

    const targetKeys = new Set<string>()
    const normalizedAccountId = normalizeKey(member.pubgAccountId)
    if (normalizedAccountId) {
      targetKeys.add(normalizedAccountId)
    }
    const normalizedPlayerName = normalizeKey(member.pubgPlayerName)
    if (normalizedPlayerName) {
      targetKeys.add(normalizedPlayerName)
    }

    const maxDistanceByWeapon = new Map<string, number>()

    for (const snapshot of snapshots) {
      const memberRows = parseSnapshotMemberStatsRows(snapshot.memberStats)
      const matchedMemberRows = memberRows.filter((row) => {
        const normalizedKey = normalizeKey(row.memberKey)
        return !!normalizedKey && targetKeys.has(normalizedKey)
      })

      for (const memberRow of matchedMemberRows) {
        for (const weapon of memberRow.weapons) {
          const maxDistance = resolveWeaponDistanceMax(weapon)
          if (maxDistance === null) {
            continue
          }

          const existing = maxDistanceByWeapon.get(weapon.weaponName)
          if (typeof existing !== 'number' || maxDistance > existing) {
            maxDistanceByWeapon.set(weapon.weaponName, maxDistance)
          }
        }
      }
    }

    const weaponLabels = await getWeaponLabels()
    const rows = rowsRaw.map((row) => {
      const avgDistanceMeters = centimetersToMeters(row.avgDistance)
      const storedMaxDistanceMeters = centimetersToMeters(row.maxDistance)
      const shotsFired = Number.isFinite(row.shotsFired) ? row.shotsFired : 0
      const hitsLanded = Number.isFinite(row.hitsLanded) ? row.hitsLanded : 0
      const inferredMaxDistanceCm = maxDistanceByWeapon.get(row.weaponName)
      const inferredMaxDistanceMeters =
        typeof inferredMaxDistanceCm === 'number'
          ? centimetersToMeters(inferredMaxDistanceCm)
          : null
      const resolvedMaxDistanceMeters =
        storedMaxDistanceMeters > 0 ? storedMaxDistanceMeters : inferredMaxDistanceMeters

      return {
        ...row,
        avgDistance: avgDistanceMeters,
        maxDistance:
          typeof resolvedMaxDistanceMeters === 'number'
            ? Math.max(resolvedMaxDistanceMeters, avgDistanceMeters)
            : null,
        shotsFired,
        hitsLanded,
        accuracy: shotsFired > 0 ? (hitsLanded / shotsFired) * 100 : 0,
        weaponLabel: weaponDisplayName(row.weaponName, weaponLabels),
      }
    })

    const memberPayload = {
      id: member.id,
      displayName: member.displayName,
      clanId: member.clanId,
    }

    const note =
      rows.length === 0 ? 'Aucune ligne disponible actuellement pour cette periode.' : null

    return NextResponse.json(
      buildTelemetrySuccessResponse(
        {
          scope: 'member',
          memberId: member.id,
          period,
          periodKey,
          count: rows.length,
        },
        {
          member: memberPayload,
          rows,
          weaponLabels,
          note,
        },
        {
          member: memberPayload,
          period,
          periodKey,
          count: rows.length,
          rows,
          weaponLabels,
          note,
        }
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    return NextResponse.json(buildTelemetryErrorResponse('Failed to load member telemetry weapons'), {
      status: 500,
    })
  }
}
