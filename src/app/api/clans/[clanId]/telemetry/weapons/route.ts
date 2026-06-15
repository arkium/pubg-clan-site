import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { getWeaponLabels, weaponDisplayName } from '@/lib/weapon-label-service'
import {
  getCategoryLabels,
  getWeaponCategories,
  weaponCategoryCode,
  weaponCategoryLabel,
} from '@/lib/weapon-category-service'

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

    const roleError = await requireNavPermission('clan.stats-weapons')(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const url = new URL(request.url)
    const period = parsePeriod(url.searchParams.get('period'))
    const periodKey = toPeriodKey(period)
    const bounds = getPeriodBounds(period)

    const rowsRaw = await prisma.$queryRaw<
      Array<{
        memberId: number
        displayName: string
        pubgPlayerName: string
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
        ws.memberId,
        cm.displayName,
        cm.pubgPlayerName,
        ws.weaponName,
        ws.kills,
        ws.headshots,
        ws.shotsFired,
        ws.hitsLanded,
        ws.avgDistance,
        ws.maxDistance,
        ws.totalDamage,
        ws.matchCount
      FROM MemberWeaponStats ws
      INNER JOIN ClanMember cm ON cm.id = ws.memberId
      WHERE cm.clanId = ${parsedClanId}
        AND ws.period = ${periodKey}
      ORDER BY ws.kills DESC, ws.headshots DESC, ws.matchCount DESC
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
              member: {
                clanId: parsedClanId,
              },
            },
          },
        },
      },
      select: {
        memberStats: true,
        squadMatch: {
          select: {
            members: {
              select: {
                member: {
                  select: {
                    id: true,
                    clanId: true,
                    pubgPlayerName: true,
                    pubgAccountId: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    const maxDistanceByMemberWeapon = new Map<string, number>()

    for (const snapshot of snapshots) {
      const keyToMemberId = new Map<string, number>()

      for (const entry of snapshot.squadMatch.members) {
        const member = entry.member
        if (member.clanId !== parsedClanId) {
          continue
        }

        const normalizedAccountId = normalizeKey(member.pubgAccountId)
        if (normalizedAccountId) {
          keyToMemberId.set(normalizedAccountId, member.id)
        }

        const normalizedPlayerName = normalizeKey(member.pubgPlayerName)
        if (normalizedPlayerName) {
          keyToMemberId.set(normalizedPlayerName, member.id)
        }
      }

      const memberRows = parseSnapshotMemberStatsRows(snapshot.memberStats)
      for (const memberRow of memberRows) {
        const memberId = keyToMemberId.get(normalizeKey(memberRow.memberKey) ?? '')
        if (!memberId) {
          continue
        }

        for (const weapon of memberRow.weapons) {
          const maxDistance = resolveWeaponDistanceMax(weapon)
          if (maxDistance === null) {
            continue
          }

          const mapKey = `${memberId}:${weapon.weaponName}`
          const existing = maxDistanceByMemberWeapon.get(mapKey)
          if (typeof existing !== 'number' || maxDistance > existing) {
            maxDistanceByMemberWeapon.set(mapKey, maxDistance)
          }
        }
      }
    }

    const [weaponLabels, weaponCategories, categoryLabels] = await Promise.all([
      getWeaponLabels(),
      getWeaponCategories(),
      getCategoryLabels(),
    ])
    const rows = rowsRaw.map((row) => {
      const avgDistanceMeters = centimetersToMeters(row.avgDistance)
      const storedMaxDistanceMeters = centimetersToMeters(row.maxDistance)
      const shotsFired = Number.isFinite(row.shotsFired) ? row.shotsFired : 0
      const hitsLanded = Number.isFinite(row.hitsLanded) ? row.hitsLanded : 0
      const inferredMaxDistanceCm = maxDistanceByMemberWeapon.get(`${row.memberId}:${row.weaponName}`)
      const inferredMaxDistanceMeters =
        typeof inferredMaxDistanceCm === 'number'
          ? centimetersToMeters(inferredMaxDistanceCm)
          : null
      const resolvedMaxDistanceMeters =
        storedMaxDistanceMeters > 0 ? storedMaxDistanceMeters : inferredMaxDistanceMeters

      const catCode = weaponCategoryCode(row.weaponName, weaponCategories)
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
        weaponCategoryCode: catCode,
        weaponCategoryLabel: weaponCategoryLabel(catCode, categoryLabels),
      }
    })

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
          weaponLabels,
          note:
            rows.length === 0
              ? 'Aucune ligne disponible actuellement pour cette periode.'
              : null,
        },
        {
          clanId: parsedClanId,
          period,
          periodKey,
          count: rows.length,
          matchCount: snapshots.length,
          categoryLabels,
          rows,
          weaponLabels,
          note:
            rows.length === 0
              ? 'Aucune ligne disponible actuellement pour cette periode.'
              : null,
        }
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry weapons failed:', error)
    return NextResponse.json(buildTelemetryErrorResponse('Failed to load telemetry weapons'), {
      status: 500,
    })
  }
}
