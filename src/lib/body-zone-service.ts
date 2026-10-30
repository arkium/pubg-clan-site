import 'server-only'

import {
  BODY_ZONE_MIN_HITS_CLAN,
  BODY_ZONE_MIN_HITS_MEMBER,
  BODY_ZONE_WEEKS,
  bodyZoneTrend,
  bodyZoneWeeks,
  isBodyZone,
  isBodyZoneSide,
  rankMembersByHeadRate,
  summarizeBodyZones,
  type BodyZoneSideSummary,
  type BodyZoneStatsRow,
  type BodyZoneWeek,
} from '@/lib/body-zone-stats'
import { clanPlacementMemberWhere } from '@/lib/clan-placement'
import { prisma } from '@/lib/prisma'
import { getPeriodKey, lastWeekKeys, previousPeriodReference, type StatsPeriod } from '@/lib/pubg-telemetry/period-keys'

/**
 * Zones d'impact de période (docs/TODO/zones-d-impact.md, lot 2) — lectures de `MemberBodyZoneStats` pour les routes
 * `…/telemetry/body-zones` et l'outil `getBodyZones` du Coach. Une requête `period IN (…)` par lecture : la période,
 * la précédente et les 8 dernières semaines. Jamais `memberStats` : le recalcul des agrégats l'a déjà résumé.
 */

export type BodyZonePeriodKeys = { periodKey: string; previousKey: string | null; weekKeys: string[] }

export function bodyZonePeriodKeys(period: StatsPeriod, now: Date): BodyZonePeriodKeys {
  const previous = previousPeriodReference(period, now)
  return {
    periodKey: getPeriodKey(period, now),
    previousKey: previous ? getPeriodKey(period, previous) : null,
    weekKeys: lastWeekKeys(now, BODY_ZONE_WEEKS),
  }
}

type BodyZonesBlock = { matchesMeasured: number; dealt: BodyZoneSideSummary; taken: BodyZoneSideSummary }

export type BodyZoneTrends = { dealtHead: number | null; takenHead: number | null }

export type MemberBodyZonesReport = BodyZonePeriodKeys &
  BodyZonesBlock & {
    previous: BodyZonesBlock | null
    trend: BodyZoneTrends
    weeks: BodyZoneWeek[]
    /** Le clan du joueur (membres actifs) sur la même période, pour la ligne « vs clan » ; `null` sans clan. */
    clan: { dealtHeadRate: number | null; takenHeadRate: number | null } | null
  }

export type ClanBodyZonesMember = BodyZonesBlock & {
  memberId: number
  displayName: string
  rank: number | null
  previousRank: number | null
  /** Rang absent de la période précédente alors que le joueur y était mesuré : « nouv. » pour un entrant. */
  isNew: boolean
}

export type ClanBodyZonesReport = BodyZonePeriodKeys &
  BodyZonesBlock & {
    previous: BodyZonesBlock | null
    trend: BodyZoneTrends
    weeks: BodyZoneWeek[]
    members: ClanBodyZonesMember[]
  }

const ROW_SELECT = { memberId: true, period: true, side: true, zone: true, hits: true, damage: true, matchesMeasured: true } as const

function toStatsRows(rows: ReadonlyArray<{ memberId: number; period: string; side: string; zone: string; hits: number; damage: number; matchesMeasured: number }>): BodyZoneStatsRow[] {
  return rows.flatMap((row) => (isBodyZoneSide(row.side) && isBodyZone(row.zone) ? [{ ...row, side: row.side, zone: row.zone }] : []))
}

function trendOf(current: BodyZonesBlock, previous: BodyZonesBlock | null): BodyZoneTrends {
  return {
    dealtHead: bodyZoneTrend(current.dealt.headRate, previous?.dealt.headRate ?? null),
    takenHead: bodyZoneTrend(current.taken.headRate, previous?.taken.headRate ?? null),
  }
}

export async function getMemberBodyZones(
  member: { id: number; clanId: number | null },
  period: StatsPeriod,
  now: Date = new Date()
): Promise<MemberBodyZonesReport> {
  const keys = bodyZonePeriodKeys(period, now)
  const periods = [...new Set([keys.periodKey, ...(keys.previousKey ? [keys.previousKey] : []), ...keys.weekKeys])]
  const [rows, clanRows] = await Promise.all([
    prisma.memberBodyZoneStats.findMany({ where: { memberId: member.id, period: { in: periods } }, select: ROW_SELECT }),
    member.clanId
      ? prisma.memberBodyZoneStats.findMany({
          where: { period: keys.periodKey, member: clanPlacementMemberWhere(member.clanId) },
          select: ROW_SELECT,
        })
      : Promise.resolve(null),
  ])
  const statsRows = toStatsRows(rows)
  const forPeriod = (key: string) => summarizeBodyZones(statsRows.filter((row) => row.period === key), BODY_ZONE_MIN_HITS_MEMBER)
  const current = forPeriod(keys.periodKey)
  const previous = keys.previousKey ? forPeriod(keys.previousKey) : null
  const clanSummary = clanRows ? summarizeBodyZones(toStatsRows(clanRows), BODY_ZONE_MIN_HITS_CLAN) : null
  const clan = clanSummary ? { dealtHeadRate: clanSummary.dealt.headRate, takenHeadRate: clanSummary.taken.headRate } : null

  return {
    ...keys,
    ...current,
    previous,
    trend: trendOf(current, previous),
    weeks: bodyZoneWeeks(statsRows, keys.weekKeys, BODY_ZONE_MIN_HITS_MEMBER),
    clan,
  }
}

export async function getClanBodyZones(clanId: number, period: StatsPeriod, now: Date = new Date()): Promise<ClanBodyZonesReport> {
  const keys = bodyZonePeriodKeys(period, now)
  const periods = [...new Set([keys.periodKey, ...(keys.previousKey ? [keys.previousKey] : []), ...keys.weekKeys])]
  const [members, rows] = await Promise.all([
    prisma.clanMember.findMany({ where: clanPlacementMemberWhere(clanId), select: { id: true, displayName: true } }),
    prisma.memberBodyZoneStats.findMany({ where: { period: { in: periods }, member: clanPlacementMemberWhere(clanId) }, select: ROW_SELECT }),
  ])
  const statsRows = toStatsRows(rows)
  const clanFor = (key: string) => summarizeBodyZones(statsRows.filter((row) => row.period === key), BODY_ZONE_MIN_HITS_CLAN)
  const current = clanFor(keys.periodKey)
  const previous = keys.previousKey ? clanFor(keys.previousKey) : null

  const memberBlock = (memberId: number, key: string) =>
    summarizeBodyZones(statsRows.filter((row) => row.memberId === memberId && row.period === key), BODY_ZONE_MIN_HITS_MEMBER)
  const measured = members
    .map((member) => ({ memberId: member.id, displayName: member.displayName, ...memberBlock(member.id, keys.periodKey) }))
    .filter((member) => member.matchesMeasured > 0)
  const ranked = rankMembersByHeadRate(measured)

  const previousRanks = new Map<number, number | null>()
  if (keys.previousKey) {
    const previousMeasured = members
      .map((member) => ({ memberId: member.id, displayName: member.displayName, ...memberBlock(member.id, keys.previousKey!) }))
      .filter((member) => member.matchesMeasured > 0)
    for (const entry of rankMembersByHeadRate(previousMeasured)) previousRanks.set(entry.memberId, entry.rank)
  }

  return {
    ...keys,
    ...current,
    previous,
    trend: trendOf(current, previous),
    weeks: bodyZoneWeeks(statsRows, keys.weekKeys, BODY_ZONE_MIN_HITS_CLAN),
    members: ranked.map((member) => ({
      ...member,
      previousRank: previousRanks.get(member.memberId) ?? null,
      isNew: keys.previousKey !== null && member.rank !== null && !previousRanks.has(member.memberId),
    })),
  }
}
