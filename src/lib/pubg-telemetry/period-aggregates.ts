import { Prisma } from '@prisma/client'

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
  firstKillPhase: number
  kills: number
  revives: number
  knockouts: number
  damageTaken: number
  onFootDistanceMeters: number
  vehicleDistanceMeters: number
  blueZoneHits: number
  circleDelaySeconds: number
  circleDelayPercent: number
  damageDealt: number
  vehicleRideEvents: number
  vehicleLeaveEvents: number
  positionEvents: number
  healsUsed: number
  healAmountTotal: number
  boostsUsed: number
  maxVehicleSpeedKph: number
  weapons: SnapshotMemberWeaponStatsRow[]
}

type SnapshotMemberWeaponStatsRow = {
  weaponName: string
  kills: number
  headshots: number
  damageDealt: number
  shotsFired: number
  hitsLanded: number
  killDistanceTotal: number
  killDistanceCount: number
  killDistanceMax: number
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
  totalFirstKillPhase: number
  firstKillPhaseSampleCount: number
  totalKills: number
  totalRevives: number
  totalKnockouts: number
  totalDamageTaken: number
  totalOnFootDistanceMeters: number
  totalVehicleDistanceMeters: number
  totalBlueZoneHits: number
  totalCircleDelaySeconds: number
  totalCircleDelayPercent: number
  totalDamageDealt: number
  totalVehicleRideEvents: number
  totalVehicleLeaveEvents: number
  totalPositionEvents: number
  totalHealsUsed: number
  totalHealAmount: number
  totalBoostsUsed: number
  maxVehicleSpeedKph: number
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
  shotsFired: number
  hitsLanded: number
  killDistanceTotal: number
  killDistanceCount: number
  killDistanceMax: number
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

function resolveAggregateWriteBatchSize(): number {
  const parsed = Number(process.env.TELEMETRY_AGGREGATES_WRITE_BATCH_SIZE ?? '250')
  if (!Number.isFinite(parsed) || parsed < 10 || parsed > 5000) {
    return 250
  }
  return Math.floor(parsed)
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  if (rows.length === 0) return []
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size))
  }
  return chunks
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
      firstKillPhase: asFiniteNumber(row.firstKillPhase),
      kills: asFiniteNumber(row.kills),
      revives: asFiniteNumber(row.revives),
      knockouts: asFiniteNumber(row.knockouts),
      damageTaken: asFiniteNumber(row.damageTaken),
      onFootDistanceMeters: asFiniteNumber(row.onFootDistanceMeters),
      vehicleDistanceMeters: asFiniteNumber(row.vehicleDistanceMeters),
      blueZoneHits: asFiniteNumber(row.blueZoneHits),
      circleDelaySeconds: asFiniteNumber(row.circleDelaySeconds),
      circleDelayPercent: asFiniteNumber(row.circleDelayPercent),
      damageDealt: asFiniteNumber(row.damageDealt),
      vehicleRideEvents: asFiniteNumber(row.vehicleRideEvents),
      vehicleLeaveEvents: asFiniteNumber(row.vehicleLeaveEvents),
      positionEvents: asFiniteNumber(row.positionEvents),
      healsUsed: asFiniteNumber(row.healsUsed),
      healAmountTotal: asFiniteNumber(row.healAmountTotal),
      boostsUsed: asFiniteNumber(row.boostsUsed),
      maxVehicleSpeedKph: asFiniteNumber(row.maxVehicleSpeedKph),
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
      shotsFired: asFiniteNumber(row.shotsFired),
      hitsLanded: asFiniteNumber(row.hitsLanded),
      killDistanceTotal: asFiniteNumber(row.killDistanceTotal),
      killDistanceCount: asFiniteNumber(row.killDistanceCount),
      killDistanceMax: asFiniteNumber(row.killDistanceMax),
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
    totalFirstKillPhase: 0,
    firstKillPhaseSampleCount: 0,
    totalKills: 0,
    totalRevives: 0,
    totalKnockouts: 0,
    totalDamageTaken: 0,
    totalOnFootDistanceMeters: 0,
    totalVehicleDistanceMeters: 0,
    totalBlueZoneHits: 0,
    totalCircleDelaySeconds: 0,
    totalCircleDelayPercent: 0,
    totalDamageDealt: 0,
    totalVehicleRideEvents: 0,
    totalVehicleLeaveEvents: 0,
    totalPositionEvents: 0,
    totalHealsUsed: 0,
    totalHealAmount: 0,
    totalBoostsUsed: 0,
    maxVehicleSpeedKph: 0,
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
    shotsFired: 0,
    hitsLanded: 0,
    killDistanceTotal: 0,
    killDistanceCount: 0,
    killDistanceMax: 0,
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

  const matchInfoRows = await prisma.squadMatch.findMany({
    where: {
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
    select: {
      id: true,
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
  })

  if (matchInfoRows.length === 0) {
    return { period, periodKey, memberTelemetryRows: 0, memberWeaponRows: 0, clanSynergyRows: 0 }
  }

  const squadMatchIds = matchInfoRows.map((m) => m.id)

  // Load JSON fields via raw SQL to use Node.js JSON.parse instead of Prisma's Rust parser.
  // Prisma's in-process Rust engine can panic fatally when reading malformed JSON numbers from the DB.
  // Batched at 30 to avoid the Rust engine allocating a large contiguous block (38MB+ for 200+ matches
  // causes a non-interceptable V8 Fatal Error after repeated runs due to native heap fragmentation).
  type RawTelemetryRow = { squadMatchId: string; memberStats: string | null; weaponStats: string | null }
  const TELEMETRY_QUERY_BATCH_SIZE = 30
  const rawRows: RawTelemetryRow[] = []
  for (let i = 0; i < squadMatchIds.length; i += TELEMETRY_QUERY_BATCH_SIZE) {
    const batchIds = squadMatchIds.slice(i, i + TELEMETRY_QUERY_BATCH_SIZE)
    const batchRows = await prisma.$queryRaw<RawTelemetryRow[]>(Prisma.sql`
      SELECT squadMatchId,
             CAST(memberStats AS CHAR) AS memberStats,
             CAST(weaponStats AS CHAR) AS weaponStats
      FROM SquadMatchTelemetry
      WHERE status = 'success'
        AND squadMatchId IN (${Prisma.join(batchIds)})
    `)
    rawRows.push(...batchRows)
  }

  const telemetryByMatchId = new Map<string, { memberStats: unknown; weaponStats: unknown }>()
  for (const row of rawRows) {
    try {
      telemetryByMatchId.set(row.squadMatchId, {
        memberStats: row.memberStats ? JSON.parse(row.memberStats) : null,
        weaponStats: row.weaponStats ? JSON.parse(row.weaponStats) : null,
      })
    } catch {
      console.warn('[TelemetryAggregates] Skipping record with invalid JSON', { squadMatchId: row.squadMatchId })
    }
  }

  const snapshots: SquadMatchTelemetryRow[] = matchInfoRows
    .filter((m) => telemetryByMatchId.has(m.id))
    .map((m) => {
      const telemetry = telemetryByMatchId.get(m.id)!
      return {
        squadMatchId: m.id,
        memberStats: telemetry.memberStats,
        weaponStats: telemetry.weaponStats,
        squadMatch: { members: m.members },
      }
    })

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
      if (row.firstKillPhase > 0) {
        aggregate.totalFirstKillPhase += row.firstKillPhase
        aggregate.firstKillPhaseSampleCount += 1
      }
      aggregate.totalKills += row.kills
      aggregate.totalRevives += row.revives
      aggregate.totalKnockouts += row.knockouts
      aggregate.totalDamageTaken += row.damageTaken
      aggregate.totalOnFootDistanceMeters += row.onFootDistanceMeters
      aggregate.totalVehicleDistanceMeters += row.vehicleDistanceMeters
      aggregate.totalBlueZoneHits += row.blueZoneHits
      aggregate.totalCircleDelaySeconds += row.circleDelaySeconds
      aggregate.totalCircleDelayPercent += row.circleDelayPercent
      aggregate.totalDamageDealt += row.damageDealt
      aggregate.totalVehicleRideEvents += row.vehicleRideEvents
      aggregate.totalVehicleLeaveEvents += row.vehicleLeaveEvents
      aggregate.totalPositionEvents += row.positionEvents
      aggregate.totalHealsUsed += row.healsUsed
      aggregate.totalHealAmount += row.healAmountTotal
      aggregate.totalBoostsUsed += row.boostsUsed
      if (row.maxVehicleSpeedKph > aggregate.maxVehicleSpeedKph) {
        aggregate.maxVehicleSpeedKph = row.maxVehicleSpeedKph
      }

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
        memberWeaponAggregate.shotsFired += weaponRow.shotsFired
        memberWeaponAggregate.hitsLanded += weaponRow.hitsLanded
        memberWeaponAggregate.killDistanceTotal += weaponRow.killDistanceTotal
        memberWeaponAggregate.killDistanceCount += weaponRow.killDistanceCount
        if (weaponRow.killDistanceMax > memberWeaponAggregate.killDistanceMax) {
          memberWeaponAggregate.killDistanceMax = weaponRow.killDistanceMax
        }

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
  const writeBatchSize = resolveAggregateWriteBatchSize()

  // Pass 1 — per-match averages and raw score values (unnormalized)
  type MemberIntermediate = {
    memberId: number
    aggressionRaw: number  // (kills*8 + KO*4 + damage/150) / matchesPlayed — higher = better
    supportRaw: number     // totalRevives / matchesPlayed — higher = better
    ghostRaw: number       // totalBlueZoneHits / matchesPlayed — lower = better
    avgCircleDelayPercent: number
    avgSafeZonePresencePercent: number
    avgFirstContactPhase: number
    avgBlueZoneHits: number
    avgCircleDelaySeconds: number
    avgOnFootDistanceMeters: number
    avgVehicleDistanceMeters: number
    avgDamageTaken: number
    avgVehicleRideEvents: number
    avgVehicleLeaveEvents: number
    avgPositionEvents: number
    avgHealsUsed: number
    avgHealAmount: number
    avgBoostsUsed: number
    maxVehicleSpeedKph: number
    matchesPlayed: number
  }

  const memberIntermediates: MemberIntermediate[] = Array.from(memberAggregates.entries()).map(
    ([memberId, aggregate]) => {
      const matchesPlayed = Math.max(aggregate.matchesPlayed, 1)
      const avgCircleDelayPercent = Number((aggregate.totalCircleDelayPercent / matchesPlayed).toFixed(2))
      return {
        memberId,
        aggressionRaw:
          (aggregate.totalKills * 8 +
            aggregate.totalKnockouts * 4 +
            aggregate.totalDamageDealt / 150) /
          matchesPlayed,
        supportRaw: aggregate.totalRevives / matchesPlayed,
        ghostRaw: aggregate.totalBlueZoneHits / matchesPlayed,
        avgCircleDelayPercent,
        avgSafeZonePresencePercent: Number((100 - avgCircleDelayPercent).toFixed(2)),
        avgFirstContactPhase:
          aggregate.firstKillPhaseSampleCount > 0
            ? Number((aggregate.totalFirstKillPhase / aggregate.firstKillPhaseSampleCount).toFixed(2))
            : 0,
        avgBlueZoneHits: Number((aggregate.totalBlueZoneHits / matchesPlayed).toFixed(2)),
        avgCircleDelaySeconds: Number((aggregate.totalCircleDelaySeconds / matchesPlayed).toFixed(2)),
        avgOnFootDistanceMeters: Number((aggregate.totalOnFootDistanceMeters / matchesPlayed).toFixed(2)),
        avgVehicleDistanceMeters: Number(
          (aggregate.totalVehicleDistanceMeters / matchesPlayed).toFixed(2)
        ),
        avgDamageTaken: Number((aggregate.totalDamageTaken / matchesPlayed).toFixed(2)),
        avgVehicleRideEvents: Number((aggregate.totalVehicleRideEvents / matchesPlayed).toFixed(2)),
        avgVehicleLeaveEvents: Number((aggregate.totalVehicleLeaveEvents / matchesPlayed).toFixed(2)),
        avgPositionEvents: Number((aggregate.totalPositionEvents / matchesPlayed).toFixed(2)),
        avgHealsUsed: Number((aggregate.totalHealsUsed / matchesPlayed).toFixed(2)),
        avgHealAmount: Number((aggregate.totalHealAmount / matchesPlayed).toFixed(2)),
        avgBoostsUsed: Number((aggregate.totalBoostsUsed / matchesPlayed).toFixed(2)),
        maxVehicleSpeedKph: Number(aggregate.maxVehicleSpeedKph.toFixed(1)),
        matchesPlayed: aggregate.matchesPlayed,
      }
    }
  )

  // Pass 2 — find per-period maxima to normalize against the best player
  const maxAggressionRaw = memberIntermediates.reduce((m, r) => Math.max(m, r.aggressionRaw), 0)
  const maxSupportRaw = memberIntermediates.reduce((m, r) => Math.max(m, r.supportRaw), 0)
  // Ghost: higher blueZoneHits = worse; the player with the most hits anchors the 0% end
  const maxGhostRaw = memberIntermediates.reduce((m, r) => Math.max(m, r.ghostRaw), 0)

  // Pass 3 — build final rows with clan-relative normalized scores (best = 100%)
  const memberTelemetryRows = memberIntermediates.map((row) => ({
    memberId: row.memberId,
    period: periodKey,
    periodType: period,
    aggressionScore: clampScore(
      maxAggressionRaw > 0 ? (row.aggressionRaw / maxAggressionRaw) * 100 : 0
    ),
    supportScore: clampScore(
      maxSupportRaw > 0 ? (row.supportRaw / maxSupportRaw) * 100 : 0
    ),
    // If no player ever touched the blue zone all scores stay at 100%;
    // otherwise the player with the most hits gets 0% and the cleanest gets 100%.
    zoneDisciplineScore: clampScore(
      maxGhostRaw > 0 ? (1 - row.ghostRaw / maxGhostRaw) * 100 : 100
    ),
    avgBlueZoneHits: row.avgBlueZoneHits,
    avgFirstContactPhase: row.avgFirstContactPhase,
    avgCircleDelaySeconds: row.avgCircleDelaySeconds,
    avgCircleDelayPercent: row.avgCircleDelayPercent,
    avgSafeZonePresencePercent: row.avgSafeZonePresencePercent,
    avgOnFootDistanceMeters: row.avgOnFootDistanceMeters,
    avgVehicleDistanceMeters: row.avgVehicleDistanceMeters,
    avgDamageTaken: row.avgDamageTaken,
    avgVehicleRideEvents: row.avgVehicleRideEvents,
    avgVehicleLeaveEvents: row.avgVehicleLeaveEvents,
    avgPositionEvents: row.avgPositionEvents,
    avgHealsUsed: row.avgHealsUsed,
    avgHealAmount: row.avgHealAmount,
    avgBoostsUsed: row.avgBoostsUsed,
    maxVehicleSpeedKph: row.maxVehicleSpeedKph,
    matchesPlayed: row.matchesPlayed,
  }))

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

      const maxDistance =
        aggregate.killDistanceMax > 0 ? Number(aggregate.killDistanceMax.toFixed(2)) : 0

      return {
        memberId,
        period: periodKey,
        periodType: period,
        weaponName,
        kills: aggregate.kills,
        headshots: aggregate.headshots,
        shotsFired: aggregate.shotsFired,
        hitsLanded: aggregate.hitsLanded,
        avgDistance,
        maxDistance,
        totalDamage: Number(aggregate.damageDealt.toFixed(2)),
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
      for (const chunk of chunkRows(memberTelemetryRows, writeBatchSize)) {
        await telemetryDelegates.memberTelemetryStats.createMany({
          data: chunk,
        })
      }
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
      for (const chunk of chunkRows(memberWeaponRows, writeBatchSize)) {
        await telemetryDelegates.memberWeaponStats.createMany({
          data: chunk,
        })
      }
    }

    await telemetryDelegates.clanSynergyTelemetryStats.deleteMany({
      where: {
        clanId,
        period: periodKey,
      },
    })

    if (clanSynergyRows.length > 0) {
      for (const chunk of chunkRows(clanSynergyRows, writeBatchSize)) {
        await telemetryDelegates.clanSynergyTelemetryStats.createMany({
          data: chunk,
        })
      }
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
