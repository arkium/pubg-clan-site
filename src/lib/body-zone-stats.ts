/**
 * Zones d'impact de période (docs/TODO/zones-d-impact.md) — module pur, sans Prisma : résumés d'un côté (tirs infligés
 * ou subis), somme d'un clan, évolution en points, classement des membres par taux de tête. Les lignes viennent de
 * `MemberBodyZoneStats` (écrites par `period-aggregates.ts`) ; les routes, les pages et le Coach lisent ces résumés.
 */

import { BODY_ZONES, type BodyZone } from '@/lib/pubg-telemetry/body-zones'

/** Touches localisées au moins, sur un côté et une période, pour afficher un taux : sous 30, un taux de tête bouge
 *  n'importe comment (trois parties). Le clan, somme de ses membres, demande 100. */
export const BODY_ZONE_MIN_HITS_MEMBER = 30
export const BODY_ZONE_MIN_HITS_CLAN = 100
/** Semaines de la série de progression. */
export const BODY_ZONE_WEEKS = 8
/** Date du parseur à zones (commit `a7ad49a`) : une partie analysée avant n'a pas de zones. */
export const BODY_ZONES_SINCE = '2026-09-13'

export const BODY_ZONE_SIDES = ['dealt', 'taken'] as const
export type BodyZoneSide = (typeof BODY_ZONE_SIDES)[number]

export const LOCALIZED_ZONES = BODY_ZONES.filter((zone) => zone !== 'other') as Array<Exclude<BodyZone, 'other'>>
export type LocalizedZone = Exclude<BodyZone, 'other'>

export const BODY_ZONE_LABELS: Record<LocalizedZone, string> = {
  head: 'Tête',
  torso: 'Torse',
  pelvis: 'Bassin',
  arms: 'Bras',
  legs: 'Jambes',
}

export function isBodyZone(value: unknown): value is BodyZone {
  return typeof value === 'string' && (BODY_ZONES as readonly string[]).includes(value)
}

export function isBodyZoneSide(value: unknown): value is BodyZoneSide {
  return value === 'dealt' || value === 'taken'
}

/** Une ligne de `MemberBodyZoneStats`, telle que la lisent les routes. */
export type BodyZoneStatsRow = {
  memberId: number
  period: string
  side: BodyZoneSide
  zone: BodyZone
  hits: number
  damage: number
  matchesMeasured: number
}

export type BodyZoneShare = { zone: LocalizedZone; hits: number; damage: number; share: number }

/** Un côté (infligés ou subis) sur une période. Les parts sont en pour cent, à une décimale. */
export type BodyZoneSideSummary = {
  /** Touches localisées (tête, torse, bassin, bras, jambes). */
  hits: number
  damage: number
  zones: BodyZoneShare[]
  /** Dégâts sans localisation (zone, chute, explosion, véhicule). */
  unlocalizedDamage: number
  /** Part des dégâts non localisés dans les dégâts du côté ; `null` sans dégât. */
  unlocalizedShare: number | null
  /** Taux de tête ; `null` sous l'échantillon. */
  headRate: number | null
  /** Tête + torse, et bras + jambes, sur les touches localisées ; `null` sous l'échantillon. */
  upperShare: number | null
  lowerShare: number | null
  hitsPerMatch: number | null
  matchesMeasured: number
  belowSample: boolean
  minHits: number
}

const round1 = (value: number) => Math.round(value * 10) / 10
const percent = (part: number, total: number) => (total > 0 ? round1((100 * part) / total) : 0)

/** Résume les lignes d'un côté (toutes du même côté et de la même période). */
export function summarizeBodyZoneSide(
  rows: ReadonlyArray<Pick<BodyZoneStatsRow, 'zone' | 'hits' | 'damage'>>,
  matchesMeasured: number,
  minHits: number
): BodyZoneSideSummary {
  const byZone = new Map<BodyZone, { hits: number; damage: number }>()
  for (const row of rows) {
    const current = byZone.get(row.zone) ?? { hits: 0, damage: 0 }
    current.hits += row.hits
    current.damage += row.damage
    byZone.set(row.zone, current)
  }
  const zoneHits = (zone: BodyZone) => byZone.get(zone)?.hits ?? 0
  const hits = LOCALIZED_ZONES.reduce((sum, zone) => sum + zoneHits(zone), 0)
  const damage = LOCALIZED_ZONES.reduce((sum, zone) => sum + (byZone.get(zone)?.damage ?? 0), 0)
  const unlocalizedDamage = byZone.get('other')?.damage ?? 0
  const belowSample = hits < minHits
  const rate = (value: number) => (belowSample ? null : percent(value, hits))

  return {
    hits,
    damage: round1(damage),
    zones: LOCALIZED_ZONES.map((zone) => ({
      zone,
      hits: zoneHits(zone),
      damage: round1(byZone.get(zone)?.damage ?? 0),
      share: percent(zoneHits(zone), hits),
    })),
    unlocalizedDamage: round1(unlocalizedDamage),
    unlocalizedShare: damage + unlocalizedDamage > 0 ? percent(unlocalizedDamage, damage + unlocalizedDamage) : null,
    headRate: rate(zoneHits('head')),
    upperShare: rate(zoneHits('head') + zoneHits('torso')),
    lowerShare: rate(zoneHits('arms') + zoneHits('legs')),
    hitsPerMatch: matchesMeasured > 0 ? round1(hits / matchesMeasured) : null,
    matchesMeasured,
    belowSample,
    minHits,
  }
}

/** Parties mesurées d'un ensemble de lignes : le même nombre est répété sur chaque ligne d'un membre et d'une période. */
export function matchesMeasuredOf(rows: ReadonlyArray<Pick<BodyZoneStatsRow, 'memberId' | 'period' | 'matchesMeasured'>>): number {
  const byMemberPeriod = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.memberId}:${row.period}`
    byMemberPeriod.set(key, Math.max(byMemberPeriod.get(key) ?? 0, row.matchesMeasured))
  }
  return [...byMemberPeriod.values()].reduce((sum, value) => sum + value, 0)
}

/** Les deux côtés d'un ensemble de lignes (un membre, ou la somme d'un clan) sur une période. */
export function summarizeBodyZones(
  rows: ReadonlyArray<BodyZoneStatsRow>,
  minHits: number
): { matchesMeasured: number; dealt: BodyZoneSideSummary; taken: BodyZoneSideSummary } {
  const matchesMeasured = matchesMeasuredOf(rows)
  return {
    matchesMeasured,
    dealt: summarizeBodyZoneSide(rows.filter((row) => row.side === 'dealt'), matchesMeasured, minHits),
    taken: summarizeBodyZoneSide(rows.filter((row) => row.side === 'taken'), matchesMeasured, minHits),
  }
}

/** Écart en points entre deux taux ; `null` si l'un manque (échantillon faible, pas de période précédente). */
export function bodyZoneTrend(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : round1(current - previous)
}

export type BodyZoneWeek = { periodKey: string; headRate: number | null; hits: number; belowSample: boolean }

/** Série hebdomadaire du taux de tête (tirs infligés), dans l'ordre de `weekKeys` ; une semaine sans ligne est vide. */
export function bodyZoneWeeks(rows: ReadonlyArray<BodyZoneStatsRow>, weekKeys: readonly string[], minHits: number): BodyZoneWeek[] {
  return weekKeys.map((periodKey) => {
    const weekRows = rows.filter((row) => row.period === periodKey && row.side === 'dealt')
    const summary = summarizeBodyZoneSide(weekRows, 0, minHits)
    return { periodKey, headRate: summary.headRate, hits: summary.hits, belowSample: summary.belowSample }
  })
}

export type RankedBodyZoneMember<T> = T & { rank: number | null }

/**
 * Classement des membres par taux de tête : ceux qui atteignent l'échantillon d'abord (taux décroissant, puis parties,
 * puis nom), les autres ensuite, sans rang — comme les joueurs non classés de `/players`.
 */
export function rankMembersByHeadRate<T extends { displayName: string; matchesMeasured: number; dealt: BodyZoneSideSummary }>(
  members: readonly T[]
): Array<RankedBodyZoneMember<T>> {
  const sorted = [...members].sort((a, b) => {
    const aRanked = a.dealt.headRate !== null
    const bRanked = b.dealt.headRate !== null
    if (aRanked !== bRanked) return aRanked ? -1 : 1
    if (aRanked && bRanked && a.dealt.headRate !== b.dealt.headRate) return (b.dealt.headRate ?? 0) - (a.dealt.headRate ?? 0)
    if (a.matchesMeasured !== b.matchesMeasured) return b.matchesMeasured - a.matchesMeasured
    return a.displayName.localeCompare(b.displayName, 'fr')
  })
  let rank = 0
  return sorted.map((member) => ({ ...member, rank: member.dealt.headRate !== null ? ++rank : null }))
}
