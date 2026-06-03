import { prisma } from '@/lib/prisma'

type StatsPeriod = 'week' | 'month' | 'all'

type TelemetryPeriodAggregateSummary = {
  period: StatsPeriod
  periodKey: string
  memberTelemetryRows: number
  memberWeaponRows: number
  clanSynergyRows: number
}

export type RecalculateTelemetryPeriodAggregatesResult = {
  clanId: number
  summaries: TelemetryPeriodAggregateSummary[]
}

type SnapshotMemberStatsRow = {
  memberKey: string
  kills: number
  revives: number
  knockouts: number
  blueZoneHits: number
  damageDealt: number
  weapons: SnapshotMemberWeaponStatsRow[]
}

type SnapshotMemberWeaponStatsRow = {
  weaponName: string
  kills: number
  headshots: number
  damageDealt: number
  killDistanceTotal: number
  killDistanceCount: number
}

type SquadMatchTelemetryRow = {
  squadMatchId: string
  memberStats: unknown
  weaponStats: unknown
  squadMatch: {
    members: Array<{
      member: {
        id: number
        clanId: number | null
        pubgPlayerName: string
        pubgAccountId: string | null
      }
    }>
  }
}

type MemberTelemetryAggregate = {
  matchesPlayed: number
  totalKills: number
  totalRevives: number
  totalKnockouts: number
  totalBlueZoneHits: number
  totalDamageDealt: number
}

type PairSynergyAggregate = {
  reviveCount: number
  coKillCount: number
  sharedDamageEvents: number
}

type MemberWeaponAggregate = {
  kills: number
  headshots: number
  damageDealt: number
  killDistanceTotal: number
  killDistanceCount: number
  matchCount: number
}

type TelemetryAggregateDelegates = {
  memberTelemetryStats: {
    deleteMany: (args: { where: { period: string; member: { clanId: number } } }) => Promise<unknown>
    createMany: (args: { data: Array<Record<string, unknown>> }) => Promise<unknown>
  }
  memberWeaponStats: {
    deleteMany: (args: { where: { period: string; member: { clanId: number } } }) => Promise<unknown>
    createMany: (args: { data: Array<Record<string, unknown>> }) => Promise<unknown>
  }
  clanSynergyTelemetryStats: {
    deleteMany: (args: { where: { clanId: number; period: string } }) => Promise<unknown>
    createMany: (args: { data: Array<Record<string, unknown>> }) => Promise<unknown>
  }
}

function getTelemetryAggregateDelegates(): TelemetryAggregateDelegates {
  return prisma as unknown as TelemetryAggregateDelegates
}

function getISOWeek(date: Date): number {
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

function getPeriodKey(period: StatsPeriod, referenceDate: Date): string {
  if (period === 'all') {
    return 'all-time'
  }

  if (period === 'week') {
    const week = getISOWeek(referenceDate)
    const year = referenceDate.getFullYear()
    return `week-${year}-${String(week).padStart(2, '0')}`
  }

  const year = referenceDate.getFullYear()
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0')
  return `month-${year}-${month}`
}

function getPeriodBounds(period: StatsPeriod, referenceDate: Date): { startDate: Date; endDate: Date } {
  if (period === 'all') {
    return {
      startDate: new Date(0),
      endDate: new Date('9999-12-31'),
    }
  }

  if (period === 'week') {
    const day = referenceDate.getDay()
    const diff = referenceDate.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(referenceDate)
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

  return {
    startDate: new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0),
    endDate: new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}

function normalizeKey(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function asFiniteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return value
}

function parseSnapshotMemberStatsRows(raw: unknown): SnapshotMemberStatsRow[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const rows: SnapshotMemberStatsRow[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const row = entry as Record<string, unknown>
    const memberKey = typeof row.memberKey === 'string' ? row.memberKey.trim() : ''
    if (memberKey.length === 0) {
      continue
    }

    rows.push({
      memberKey,
      kills: asFiniteNumber(row.kills),
      revives: asFiniteNumber(row.revives),
      knockouts: asFiniteNumber(row.knockouts),
      blueZoneHits: asFiniteNumber(row.blueZoneHits),
      damageDealt: asFiniteNumber(row.damageDealt),
      weapons: parseSnapshotMemberWeaponStatsRows(row.weapons),
    })
  }

  return rows
}

function parseSnapshotMemberWeaponStatsRows(raw: unknown): SnapshotMemberWeaponStatsRow[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const rows: SnapshotMemberWeaponStatsRow[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const row = entry as Record<string, unknown>
    const weaponName = typeof row.weaponName === 'string' ? row.weaponName.trim() : ''
    if (weaponName.length === 0) {
      continue
    }

    rows.push({
      weaponName,
      kills: asFiniteNumber(row.kills),
      headshots: asFiniteNumber(row.headshots),
      damageDealt: asFiniteNumber(row.damageDealt),
      killDistanceTotal: asFiniteNumber(row.killDistanceTotal),
      killDistanceCount: asFiniteNumber(row.killDistanceCount),
    })
  }

  return rows
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  if (value < 0) {
    return 0
  }

  if (value > 100) {
    return 100
  }

  return Number(value.toFixed(2))
}

function buildPairKey(leftMemberId: number, rightMemberId: number): string {
  if (leftMemberId < rightMemberId) {
    return `${leftMemberId}:${rightMemberId}`
  }

  return `${rightMemberId}:${leftMemberId}`
}

function parsePairKey(pairKey: string): { memberAId: number; memberBId: number } {
  const [memberAIdRaw, memberBIdRaw] = pairKey.split(':')
  return {
    memberAId: Number(memberAIdRaw),
    memberBId: Number(memberBIdRaw),
  }
}

function getOrCreateMemberAggregate(
  map: Map<number, MemberTelemetryAggregate>,
  memberId: number
): MemberTelemetryAggregate {
  const existing = map.get(memberId)
  if (existing) {
    return existing
  }

  const created: MemberTelemetryAggregate = {
    matchesPlayed: 0,
    totalKills: 0,
    totalRevives: 0,
    totalKnockouts: 0,
    totalBlueZoneHits: 0,
    totalDamageDealt: 0,
  }

  map.set(memberId, created)
  return created
}

function getOrCreatePairAggregate(
  map: Map<string, PairSynergyAggregate>,
  pairKey: string
): PairSynergyAggregate {
  const existing = map.get(pairKey)
  if (existing) {
    return existing
  }

  const created: PairSynergyAggregate = {
    reviveCount: 0,
    coKillCount: 0,
    sharedDamageEvents: 0,
  }

  map.set(pairKey, created)
  return created
}

function buildMemberWeaponKey(memberId: number, weaponName: string): string {
  return `${memberId}:${weaponName}`
}

function parseMemberWeaponKey(memberWeaponKey: string): { memberId: number; weaponName: string } {
  const separatorIndex = memberWeaponKey.indexOf(':')
  if (separatorIndex < 0) {
    return {
      memberId: Number(memberWeaponKey),
      weaponName: '',
    }
  }

  return {
    memberId: Number(memberWeaponKey.slice(0, separatorIndex)),
    weaponName: memberWeaponKey.slice(separatorIndex + 1),
  }
}

function getOrCreateMemberWeaponAggregate(
  map: Map<string, MemberWeaponAggregate>,
  memberWeaponKey: string
): MemberWeaponAggregate {
  const existing = map.get(memberWeaponKey)
  if (existing) {
    return existing
  }

  const created: MemberWeaponAggregate = {
    kills: 0,
    headshots: 0,
    damageDealt: 0,
    killDistanceTotal: 0,
    killDistanceCount: 0,
    matchCount: 0,
  }

  map.set(memberWeaponKey, created)
  return created
}

async function recalculateTelemetryPeriodForClan(
  clanId: number,
  period: StatsPeriod,
  referenceDate: Date
): Promise<TelemetryPeriodAggregateSummary> {
  const periodKey = getPeriodKey(period, referenceDate)
  const { startDate, endDate } = getPeriodBounds(period, referenceDate)

  const snapshots = (await prisma.squadMatchTelemetry.findMany({
    where: {
      status: 'success',
      squadMatch: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        members: {
          some: {
            member: {
              clanId,
            },
          },
        },
      },
    },
    select: {
      squadMatchId: true,
      memberStats: true,
      weaponStats: true,
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
  })) as SquadMatchTelemetryRow[]

  const memberAggregates = new Map<number, MemberTelemetryAggregate>()
  const pairAggregates = new Map<string, PairSynergyAggregate>()
  const memberWeaponAggregates = new Map<string, MemberWeaponAggregate>()

  for (const snapshot of snapshots) {
    const memberKeyToId = new Map<string, number>()
    const clanMemberIdsForMatch: number[] = []

    for (const squadMember of snapshot.squadMatch.members) {
      if (squadMember.member.clanId !== clanId) {
        continue
      }

      clanMemberIdsForMatch.push(squadMember.member.id)

      const normalizedPlayerName = normalizeKey(squadMember.member.pubgPlayerName)
      if (normalizedPlayerName) {
        memberKeyToId.set(normalizedPlayerName, squadMember.member.id)
      }

      const normalizedAccountId = normalizeKey(squadMember.member.pubgAccountId)
      if (normalizedAccountId) {
        memberKeyToId.set(normalizedAccountId, squadMember.member.id)
      }
    }

    const memberRows = parseSnapshotMemberStatsRows(snapshot.memberStats)
    const memberIdsSeenInMatch = new Set<number>()
    const matchMemberRows = new Map<number, SnapshotMemberStatsRow>()
    const memberWeaponKeysSeenInMatch = new Set<string>()

    for (const row of memberRows) {
      const memberId = memberKeyToId.get(normalizeKey(row.memberKey) ?? '')
      if (!memberId) {
        continue
      }

      const aggregate = getOrCreateMemberAggregate(memberAggregates, memberId)
      aggregate.totalKills += row.kills
      aggregate.totalRevives += row.revives
      aggregate.totalKnockouts += row.knockouts
      aggregate.totalBlueZoneHits += row.blueZoneHits
      aggregate.totalDamageDealt += row.damageDealt

      memberIdsSeenInMatch.add(memberId)
      matchMemberRows.set(memberId, row)

      for (const weaponRow of row.weapons) {
        const memberWeaponKey = buildMemberWeaponKey(memberId, weaponRow.weaponName)
        const memberWeaponAggregate = getOrCreateMemberWeaponAggregate(
          memberWeaponAggregates,
          memberWeaponKey
        )

        memberWeaponAggregate.kills += weaponRow.kills
        memberWeaponAggregate.headshots += weaponRow.headshots
        memberWeaponAggregate.damageDealt += weaponRow.damageDealt
        memberWeaponAggregate.killDistanceTotal += weaponRow.killDistanceTotal
        memberWeaponAggregate.killDistanceCount += weaponRow.killDistanceCount

        const wasUsedInMatch =
          weaponRow.kills > 0 || weaponRow.headshots > 0 || weaponRow.damageDealt > 0
        if (wasUsedInMatch) {
          memberWeaponKeysSeenInMatch.add(memberWeaponKey)
        }
      }
    }

    for (const memberId of memberIdsSeenInMatch) {
      const aggregate = getOrCreateMemberAggregate(memberAggregates, memberId)
      aggregate.matchesPlayed += 1
    }

    for (const memberWeaponKey of memberWeaponKeysSeenInMatch) {
      const aggregate = getOrCreateMemberWeaponAggregate(memberWeaponAggregates, memberWeaponKey)
      aggregate.matchCount += 1
    }

    const dedupedClanMembers = Array.from(new Set(clanMemberIdsForMatch)).sort((left, right) => left - right)

    for (let leftIndex = 0; leftIndex < dedupedClanMembers.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < dedupedClanMembers.length; rightIndex += 1) {
        const leftMemberId = dedupedClanMembers[leftIndex]
        const rightMemberId = dedupedClanMembers[rightIndex]

        const leftStats = matchMemberRows.get(leftMemberId)
        const rightStats = matchMemberRows.get(rightMemberId)

        if (!leftStats || !rightStats) {
          continue
        }

        const pairAggregate = getOrCreatePairAggregate(
          pairAggregates,
          buildPairKey(leftMemberId, rightMemberId)
        )

        if (leftStats.revives > 0 && rightStats.revives > 0) {
          pairAggregate.reviveCount += 1
        }

        if (leftStats.kills > 0 && rightStats.kills > 0) {
          pairAggregate.coKillCount += 1
        }

        if (leftStats.damageDealt > 0 && rightStats.damageDealt > 0) {
          pairAggregate.sharedDamageEvents += 1
        }
      }
    }
  }

  const telemetryDelegates = getTelemetryAggregateDelegates()

  const memberTelemetryRows = Array.from(memberAggregates.entries()).map(([memberId, aggregate]) => {
    const matchesPlayed = Math.max(aggregate.matchesPlayed, 1)

    const aggressionRaw =
      aggregate.totalKills * 8 +
      aggregate.totalKnockouts * 4 +
      aggregate.totalDamageDealt / 150 -
      aggregate.totalBlueZoneHits * 2

    const supportRaw = aggregate.totalRevives * 22 + (aggregate.totalRevives / matchesPlayed) * 12

    const zoneDisciplineRaw = 100 - (aggregate.totalBlueZoneHits / matchesPlayed) * 15

    return {
      memberId,
      period: periodKey,
      periodType: period,
      aggressionScore: clampScore(aggressionRaw),
      supportScore: clampScore(supportRaw),
      zoneDisciplineScore: clampScore(zoneDisciplineRaw),
      avgBlueZoneHits: Number((aggregate.totalBlueZoneHits / matchesPlayed).toFixed(2)),
      avgCircleDelaySeconds: 0,
      matchesPlayed: aggregate.matchesPlayed,
    }
  })

  const clanSynergyRows = Array.from(pairAggregates.entries()).map(([pairKey, aggregate]) => {
    const { memberAId, memberBId } = parsePairKey(pairKey)

    return {
      clanId,
      memberAId,
      memberBId,
      period: periodKey,
      periodType: period,
      reviveCount: aggregate.reviveCount,
      coKillCount: aggregate.coKillCount,
      sharedDamageEvents: aggregate.sharedDamageEvents,
    }
  })

  const memberWeaponRows = Array.from(memberWeaponAggregates.entries()).map(
    ([memberWeaponKey, aggregate]) => {
      const { memberId, weaponName } = parseMemberWeaponKey(memberWeaponKey)

      const avgDistance =
        aggregate.killDistanceCount > 0
          ? Number((aggregate.killDistanceTotal / aggregate.killDistanceCount).toFixed(2))
          : 0

      return {
        memberId,
        period: periodKey,
        periodType: period,
        weaponName,
        kills: aggregate.kills,
        headshots: aggregate.headshots,
        avgDistance,
        matchCount: aggregate.matchCount,
      }
    }
  )

  await prisma.$transaction(async () => {
    await telemetryDelegates.memberTelemetryStats.deleteMany({
      where: {
        period: periodKey,
        member: {
          clanId,
        },
      },
    })

    if (memberTelemetryRows.length > 0) {
      await telemetryDelegates.memberTelemetryStats.createMany({
        data: memberTelemetryRows,
      })
    }

    await telemetryDelegates.memberWeaponStats.deleteMany({
      where: {
        period: periodKey,
        member: {
          clanId,
        },
      },
    })

    if (memberWeaponRows.length > 0) {
      await telemetryDelegates.memberWeaponStats.createMany({
        data: memberWeaponRows,
      })
    }

    await telemetryDelegates.clanSynergyTelemetryStats.deleteMany({
      where: {
        clanId,
        period: periodKey,
      },
    })

    if (clanSynergyRows.length > 0) {
      await telemetryDelegates.clanSynergyTelemetryStats.createMany({
        data: clanSynergyRows,
      })
    }
  })

  return {
    period,
    periodKey,
    memberTelemetryRows: memberTelemetryRows.length,
    memberWeaponRows: memberWeaponRows.length,
    clanSynergyRows: clanSynergyRows.length,
  }
}

export async function recalculateTelemetryPeriodAggregatesForClan(
  clanId: number,
  referenceDate: Date = new Date()
): Promise<RecalculateTelemetryPeriodAggregatesResult> {
  const summaries: TelemetryPeriodAggregateSummary[] = []

  for (const period of ['week', 'month', 'all'] as const) {
    summaries.push(await recalculateTelemetryPeriodForClan(clanId, period, referenceDate))
  }

  return {
    clanId,
    summaries,
  }
}
