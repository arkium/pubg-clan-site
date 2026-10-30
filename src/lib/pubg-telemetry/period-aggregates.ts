import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { matchTypeMatchesFilter } from '@/lib/match-type-filter'
import { teamModeFromMemberCount } from '@/lib/team-mode'
import type { ClanMatchTypeFilter, ClanTeamModeFilter } from '@/types/squad-matches'
import { decodeJsonColumn } from '@/lib/pubg-telemetry/json-codec'
import { getPeriodBounds, getPeriodKey, periodsToRecalculate, type StatsPeriod } from '@/lib/pubg-telemetry/period-keys'
import { BODY_ZONES, type BodyZone, type BodyZoneAccumulator, type BodyZoneBreakdown } from '@/lib/pubg-telemetry/body-zones'

/**
 * Types écrits pour les synergies (`ClanSynergyAggregate.matchType`) : inchangés depuis l'ajout de `competitive` à
 * `ClanMatchTypeFilter` (2026-10-04, Ligue Inter-Clans) — les parties Ranked restent comptées dans `all`.
 */
type SynergyMatchType = Exclude<ClanMatchTypeFilter, 'competitive'>
const CLAN_SYNERGY_MATCH_TYPES: SynergyMatchType[] = ['official', 'casual', 'custom', 'all']
const CLAN_SYNERGY_TEAM_MODES: ClanTeamModeFilter[] = ['duo', 'trio', 'squad', 'all']

export { getPeriodKey, type StatsPeriod } from '@/lib/pubg-telemetry/period-keys'

type TelemetryPeriodAggregateSummary = {
  period: StatsPeriod
  periodKey: string
  memberTelemetryRows: number
  memberWeaponRows: number
  clanSynergyRows: number
  memberBodyZoneRows: number
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
  recalls: number
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
  /** Zones d'impact de la partie (parseur depuis le 2026-09-13) ; `null` quand la clé manque : partie non mesurée. */
  bodyZonesDealt: BodyZoneBreakdown[] | null
  bodyZonesTaken: BodyZoneBreakdown[] | null
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
    matchType: string
    members: Array<{
      /** Distances de l'API PUBG, en mètres : la source des moyennes à pied / en véhicule. */
      walkDistance?: number
      swimDistance?: number
      rideDistance?: number
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
  totalRecalls: number
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
  recallCount: number
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

/** Zones d'impact d'un membre sur la période : les deux côtés, et les parties qui les portent. */
type MemberBodyZoneAggregate = {
  dealt: BodyZoneAccumulator
  taken: BodyZoneAccumulator
  matchesMeasured: number
}

type TelemetryAggregateDelegates = {
  memberBodyZoneStats: {
    deleteMany: (args: { where: { period: string; member: { clanId: number } } }) => Promise<unknown>
    createMany: (args: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => Promise<unknown>
  }
  memberTelemetryStats: {
    deleteMany: (args: { where: { period: string; member: { clanId: number } } }) => Promise<unknown>
    createMany: (args: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => Promise<unknown>
  }
  memberWeaponStats: {
    deleteMany: (args: { where: { period: string; member: { clanId: number } } }) => Promise<unknown>
    createMany: (args: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => Promise<unknown>
  }
  clanSynergyTelemetryStats: {
    deleteMany: (args: { where: { clanId: number; period: string } }) => Promise<unknown>
    createMany: (args: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => Promise<unknown>
  }
}

function getTelemetryAggregateDelegates(client: unknown = prisma): TelemetryAggregateDelegates {
  return client as unknown as TelemetryAggregateDelegates
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
      recalls: asFiniteNumber(row.recalls),
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
      bodyZonesDealt: parseBodyZoneBreakdowns(row.bodyZonesDealt),
      bodyZonesTaken: parseBodyZoneBreakdowns(row.bodyZonesTaken),
    })
  }

  return rows
}

/** Zones d'un côté, tolérant : zone inconnue → `other`, nombre non fini → 0 ; clé absente → `null` (pas `[]`). */
function parseBodyZoneBreakdowns(raw: unknown): BodyZoneBreakdown[] | null {
  if (!Array.isArray(raw)) {
    return null
  }

  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      zone: (BODY_ZONES as readonly unknown[]).includes(entry.zone) ? (entry.zone as BodyZone) : 'other',
      hits: asFiniteNumber(entry.hits),
      damage: asFiniteNumber(entry.damage),
    }))
}

function addBodyZoneBreakdowns(accumulator: BodyZoneAccumulator, breakdowns: BodyZoneBreakdown[] | null) {
  for (const entry of breakdowns ?? []) {
    const current = accumulator[entry.zone] ?? { damage: 0, hits: 0 }
    current.hits += entry.hits
    current.damage += entry.damage
    accumulator[entry.zone] = current
  }
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
    totalRecalls: 0,
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
    recallCount: 0,
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

/** Recalcule une période d'un clan (exportée pour le rattrapage `scripts/backfill-body-zone-stats.ts`). */
export async function recalculateTelemetryPeriodForClan(
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
      matchType: true,
      members: {
        select: {
          walkDistance: true,
          swimDistance: true,
          rideDistance: true,
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
    return { period, periodKey, memberTelemetryRows: 0, memberWeaponRows: 0, clanSynergyRows: 0, memberBodyZoneRows: 0 }
  }

  const squadMatchIds = matchInfoRows.map((m) => m.id)

  // Load JSON fields via raw SQL to use Node.js JSON.parse instead of Prisma's Rust parser.
  // Prisma's in-process Rust engine can panic fatally when reading malformed JSON numbers from the DB.
  // Batched at 30 to avoid the Rust engine allocating a large contiguous block (38MB+ for 200+ matches
  // causes a non-interceptable V8 Fatal Error after repeated runs due to native heap fragmentation).
  type RawTelemetryRow = {
    squadMatchId: string
    memberStats: string | null
    weaponStats: string | null
    memberStatsGz: Buffer | null
    weaponStatsGz: Buffer | null
  }
  const TELEMETRY_QUERY_BATCH_SIZE = 30
  const rawRows: RawTelemetryRow[] = []
  for (let i = 0; i < squadMatchIds.length; i += TELEMETRY_QUERY_BATCH_SIZE) {
    const batchIds = squadMatchIds.slice(i, i + TELEMETRY_QUERY_BATCH_SIZE)
    const batchRows = await prisma.$queryRaw<RawTelemetryRow[]>(Prisma.sql`
      SELECT squadMatchId,
             CAST(memberStats AS CHAR) AS memberStats,
             CAST(weaponStats AS CHAR) AS weaponStats,
             memberStatsGz,
             weaponStatsGz
      FROM SquadMatchTelemetry
      WHERE status = 'success'
        AND squadMatchId IN (${Prisma.join(batchIds)})
    `)
    rawRows.push(...batchRows)
  }

  const telemetryByMatchId = new Map<string, { memberStats: unknown; weaponStats: unknown }>()
  for (const row of rawRows) {
    try {
      // Les deux formats coexistent le temps du rattrapage.
      telemetryByMatchId.set(row.squadMatchId, {
        memberStats: decodeJsonColumn(
          row.memberStatsGz,
          row.memberStats ? JSON.parse(row.memberStats) : null,
          'memberStats'
        ),
        weaponStats: decodeJsonColumn(
          row.weaponStatsGz,
          row.weaponStats ? JSON.parse(row.weaponStats) : null,
          'weaponStats'
        ),
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
        squadMatch: { members: m.members, matchType: m.matchType },
      }
    })

  const memberAggregates = new Map<number, MemberTelemetryAggregate>()
  const memberWeaponAggregates = new Map<string, MemberWeaponAggregate>()
  const memberBodyZoneAggregates = new Map<number, MemberBodyZoneAggregate>()

  // Une Map de paires par combinaison (type de match × mode d'équipe) : 'all'
  // reçoit toujours l'incrément sur chaque axe, plus le bucket exact du
  // snapshot (le regroupement 'casual' inclut aussi 'airoyale', cf.
  // matchTypeMatchesFilter ; le mode se déduit du nombre de SquadMember scopés
  // au clan, cf. teamModeFromMemberCount).
  const pairAggregatesByMatchType: Record<
    SynergyMatchType,
    Record<ClanTeamModeFilter, Map<string, PairSynergyAggregate>>
  > = {
    official: { duo: new Map(), trio: new Map(), squad: new Map(), all: new Map() },
    casual: { duo: new Map(), trio: new Map(), squad: new Map(), all: new Map() },
    custom: { duo: new Map(), trio: new Map(), squad: new Map(), all: new Map() },
    all: { duo: new Map(), trio: new Map(), squad: new Map(), all: new Map() },
  }

  for (const snapshot of snapshots) {
    const memberKeyToId = new Map<string, number>()
    const clanMemberIdsForMatch: number[] = []
    const apiDistancesByMemberId = new Map<number, { onFoot: number; vehicle: number }>()

    for (const squadMember of snapshot.squadMatch.members) {
      if (squadMember.member.clanId !== clanId) {
        continue
      }

      clanMemberIdsForMatch.push(squadMember.member.id)
      // Mètres exacts de l'API, nage comprise dans « à pied » ; les distances de la télémétrie sont en centimètres
      // et comptaient l'avion (docs/TODO/inventaire-2026-10-20.md).
      apiDistancesByMemberId.set(squadMember.member.id, {
        onFoot: asFiniteNumber(squadMember.walkDistance) + asFiniteNumber(squadMember.swimDistance),
        vehicle: asFiniteNumber(squadMember.rideDistance),
      })

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
      aggregate.totalRecalls += row.recalls
      aggregate.totalKnockouts += row.knockouts
      aggregate.totalDamageTaken += row.damageTaken
      const apiDistances = apiDistancesByMemberId.get(memberId)
      aggregate.totalOnFootDistanceMeters += apiDistances?.onFoot ?? 0
      aggregate.totalVehicleDistanceMeters += apiDistances?.vehicle ?? 0
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

      // Zones d'impact : une partie compte quand la ligne du membre porte les tableaux (même vides).
      if (row.bodyZonesDealt !== null || row.bodyZonesTaken !== null) {
        const zones = memberBodyZoneAggregates.get(memberId) ?? { dealt: {}, taken: {}, matchesMeasured: 0 }
        if (!memberIdsSeenInMatch.has(memberId)) zones.matchesMeasured += 1
        addBodyZoneBreakdowns(zones.dealt, row.bodyZonesDealt)
        addBodyZoneBreakdowns(zones.taken, row.bodyZonesTaken)
        memberBodyZoneAggregates.set(memberId, zones)
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
    const snapshotMode = teamModeFromMemberCount(dedupedClanMembers.length)

    for (let leftIndex = 0; leftIndex < dedupedClanMembers.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < dedupedClanMembers.length; rightIndex += 1) {
        const leftMemberId = dedupedClanMembers[leftIndex]
        const rightMemberId = dedupedClanMembers[rightIndex]

        const leftStats = matchMemberRows.get(leftMemberId)
        const rightStats = matchMemberRows.get(rightMemberId)

        if (!leftStats || !rightStats) {
          continue
        }

        const pairKey = buildPairKey(leftMemberId, rightMemberId)
        const applicableMatchTypes: SynergyMatchType[] = ['all']
        for (const filter of ['official', 'casual', 'custom'] as const) {
          if (matchTypeMatchesFilter(snapshot.squadMatch.matchType, filter)) {
            applicableMatchTypes.push(filter)
          }
        }
        const applicableModes: ClanTeamModeFilter[] = ['all', snapshotMode]

        for (const matchType of applicableMatchTypes) {
          for (const mode of applicableModes) {
            const pairAggregate = getOrCreatePairAggregate(
              pairAggregatesByMatchType[matchType][mode],
              pairKey
            )

            if (leftStats.revives > 0 && rightStats.revives > 0) {
              pairAggregate.reviveCount += 1
            }

            if (leftStats.recalls > 0 || rightStats.recalls > 0) {
              pairAggregate.recallCount += (leftStats.recalls + rightStats.recalls)
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
    }
  }

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

  const clanSynergyRows = CLAN_SYNERGY_MATCH_TYPES.flatMap((matchType) =>
    CLAN_SYNERGY_TEAM_MODES.flatMap((mode) =>
      Array.from(pairAggregatesByMatchType[matchType][mode].entries()).map(([pairKey, aggregate]) => {
        const { memberAId, memberBId } = parsePairKey(pairKey)

        return {
          clanId,
          memberAId,
          memberBId,
          period: periodKey,
          periodType: period,
          matchType,
          mode,
          reviveCount: aggregate.reviveCount,
          recallCount: aggregate.recallCount,
          coKillCount: aggregate.coKillCount,
          sharedDamageEvents: aggregate.sharedDamageEvents,
        }
      })
    )
  )

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

  // Zones à 0 touche et 0 dégât non écrites (comme `serializeBodyZones`).
  const memberBodyZoneRows = Array.from(memberBodyZoneAggregates.entries()).flatMap(([memberId, aggregate]) =>
    (['dealt', 'taken'] as const).flatMap((side) =>
      BODY_ZONES.flatMap((zone) => {
        const entry = aggregate[side][zone]
        if (!entry || (entry.hits === 0 && entry.damage === 0)) return []
        return [
          {
            memberId,
            period: periodKey,
            periodType: period,
            side,
            zone,
            hits: entry.hits,
            damage: Number(entry.damage.toFixed(2)),
            matchesMeasured: aggregate.matchesMeasured,
          },
        ]
      })
    )
  )

  await prisma.$transaction(async (tx) => {
    const txDelegates = getTelemetryAggregateDelegates(tx)

    await txDelegates.memberBodyZoneStats.deleteMany({
      where: {
        period: periodKey,
        member: {
          clanId,
        },
      },
    })

    for (const chunk of chunkRows(memberBodyZoneRows, writeBatchSize)) {
      await txDelegates.memberBodyZoneStats.createMany({
        data: chunk,
      })
    }

    await txDelegates.memberTelemetryStats.deleteMany({
      where: {
        period: periodKey,
        member: {
          clanId,
        },
      },
    })

    if (memberTelemetryRows.length > 0) {
      for (const chunk of chunkRows(memberTelemetryRows, writeBatchSize)) {
        await txDelegates.memberTelemetryStats.createMany({
          data: chunk,
        })
      }
    }

    await txDelegates.memberWeaponStats.deleteMany({
      where: {
        period: periodKey,
        member: {
          clanId,
        },
      },
    })

    if (memberWeaponRows.length > 0) {
      for (const chunk of chunkRows(memberWeaponRows, writeBatchSize)) {
        await txDelegates.memberWeaponStats.createMany({
          data: chunk,
          skipDuplicates: true,
        })
      }
    }

    await txDelegates.clanSynergyTelemetryStats.deleteMany({
      where: {
        clanId,
        period: periodKey,
      },
    })

    if (clanSynergyRows.length > 0) {
      for (const chunk of chunkRows(clanSynergyRows, writeBatchSize)) {
        await txDelegates.clanSynergyTelemetryStats.createMany({
          data: chunk,
        })
      }
    }
  }, { timeout: 30000 })

  return {
    period,
    periodKey,
    memberTelemetryRows: memberTelemetryRows.length,
    memberWeaponRows: memberWeaponRows.length,
    clanSynergyRows: clanSynergyRows.length,
    memberBodyZoneRows: memberBodyZoneRows.length,
  }
}

/**
 * Recalcule les périodes d'un clan : semaine, mois et « tous » courants, plus la semaine précédente le lundi et le mardi
 * et le mois précédent les 1er et 2 (`periodsToRecalculate`) — les semaines passées n'étaient sinon jamais complétées
 * des parties importées après coup (docs/TODO/zones-d-impact.md, §1.3).
 */
export async function recalculateTelemetryPeriodAggregatesForClan(
  clanId: number,
  referenceDate: Date = new Date()
): Promise<RecalculateTelemetryPeriodAggregatesResult> {
  const summaries: TelemetryPeriodAggregateSummary[] = []

  for (const entry of periodsToRecalculate(referenceDate)) {
    summaries.push(await recalculateTelemetryPeriodForClan(clanId, entry.period, entry.referenceDate))
  }

  return {
    clanId,
    summaries,
  }
}
