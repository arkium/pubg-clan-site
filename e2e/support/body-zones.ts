import {
  BODY_ZONE_MIN_HITS_CLAN,
  BODY_ZONE_MIN_HITS_MEMBER,
  bodyZoneTrend,
  bodyZoneWeeks,
  rankMembersByHeadRate,
  summarizeBodyZones,
  type BodyZoneStatsRow,
} from '@/lib/body-zone-stats'

import type { ApiMock } from './api'
import { CLAN_ID, MEMBER_ID, PLAYERS } from './data'

/**
 * Zones d'impact (docs/TODO/zones-d-impact.md) — réponses figées de `GET /api/members/:id/telemetry/body-zones` et
 * `GET /api/clans/:id/telemetry/body-zones`, construites avec les fonctions du module pur (mêmes résumés que la route).
 * Ordres de grandeur de production (un clan, semaine 43 de 2026) ; joueurs et chiffres inventés.
 */

const WEEKS = Array.from({ length: 8 }, (_, index) => `week-2026-${37 + index}`)
const CURRENT_WEEK = 'week-2026-44'
const PREVIOUS_WEEK = 'week-2026-43'

type Zones = { head: number; torso: number; pelvis: number; arms: number; legs: number; other?: number }

function rows(memberId: number, period: string, dealt: Zones, taken: Zones, matchesMeasured: number): BodyZoneStatsRow[] {
  const side = (name: 'dealt' | 'taken', zones: Zones, otherDamage: number): BodyZoneStatsRow[] => [
    ...(['head', 'torso', 'pelvis', 'arms', 'legs'] as const).map((zone) => ({ memberId, period, side: name, zone, hits: zones[zone], damage: zones[zone] * 28, matchesMeasured })),
    ...(otherDamage > 0 ? [{ memberId, period, side: name, zone: 'other' as const, hits: 3, damage: otherDamage, matchesMeasured }] : []),
  ]
  return [...side('dealt', dealt, dealt.other ?? 0), ...side('taken', taken, taken.other ?? 0)]
}

/** Une semaine passée du joueur : `rate` % de ses touches à la tête (100 touches), ou 12 touches sous l'échantillon. */
function pastWeek(memberId: number, period: string, rate: number | null) {
  if (rate === null) return rows(memberId, period, { head: 2, torso: 6, pelvis: 1, arms: 1, legs: 2 }, { head: 2, torso: 8, pelvis: 2, arms: 1, legs: 2 }, 2)
  return rows(memberId, period, { head: rate, torso: 50, pelvis: 12, arms: 11, legs: 27 - rate }, { head: 12, torso: 52, pelvis: 10, arms: 12, legs: 14 }, 12)
}

const KESTREL_WEEK = rows(MEMBER_ID, CURRENT_WEEK, { head: 25, torso: 93, pelvis: 23, arms: 21, legs: 28, other: 340 }, { head: 19, torso: 85, pelvis: 16, arms: 18, legs: 22, other: 410 }, 23)
const KESTREL_RATES = [9, 12, 10, null, 11, 12, 11] // S37 → S43, S40 sous l'échantillon

function memberRows(): BodyZoneStatsRow[] {
  return [...KESTREL_WEEK, ...WEEKS.slice(0, 7).flatMap((period, index) => pastWeek(MEMBER_ID, period, KESTREL_RATES[index]))]
}

export type MemberBodyZonesKind = 'week' | 'all' | 'low-sample' | 'empty'

export function memberBodyZonesPayload(kind: MemberBodyZonesKind) {
  const period = kind === 'all' ? 'all' : 'week'
  const periodKey = kind === 'all' ? 'all-time' : CURRENT_WEEK
  const all = memberRows()
  const current =
    kind === 'empty'
      ? []
      : kind === 'low-sample'
        ? pastWeek(MEMBER_ID, periodKey, null)
        : kind === 'all'
          ? all.map((row) => ({ ...row, period: 'all-time', matchesMeasured: 148 }))
          : KESTREL_WEEK
  const summary = summarizeBodyZones(current, BODY_ZONE_MIN_HITS_MEMBER)
  const previous = kind === 'all' ? null : summarizeBodyZones(all.filter((row) => row.period === PREVIOUS_WEEK), BODY_ZONE_MIN_HITS_MEMBER)
  const data = {
    member: { id: MEMBER_ID, displayName: PLAYERS[0].displayName },
    period,
    periodKey,
    previousKey: kind === 'all' ? null : PREVIOUS_WEEK,
    weekKeys: WEEKS,
    ...summary,
    previous,
    trend: { dealtHead: bodyZoneTrend(summary.dealt.headRate, previous?.dealt.headRate ?? null), takenHead: bodyZoneTrend(summary.taken.headRate, previous?.taken.headRate ?? null) },
    weeks: bodyZoneWeeks(kind === 'low-sample' ? [...all.filter((row) => row.period !== CURRENT_WEEK), ...current] : all, WEEKS, BODY_ZONE_MIN_HITS_MEMBER),
    clan: { dealtHeadRate: 11, takenHeadRate: 14 },
  }
  return { ok: true, meta: { scope: 'member', memberId: MEMBER_ID, period, periodKey, count: data.matchesMeasured }, data }
}

export function mockMemberBodyZones(api: ApiMock, kind?: MemberBodyZonesKind) {
  api.on('GET', `/api/members/${MEMBER_ID}/telemetry/body-zones`, (url) => ({
    body: memberBodyZonesPayload(kind ?? (url.searchParams.get('period') === 'all' ? 'all' : 'week')),
  }))
}

/** Le clan : huit joueurs, deux sous l'échantillon ; la semaine précédente pour les rangs. */
const CLAN_PLAYERS: Array<{ head: number; hits: number; matches: number; previousHead: number | null }> = [
  { head: 25, hits: 190, matches: 23, previousHead: 11 },
  { head: 206, hits: 980, matches: 41, previousHead: 22 },
  { head: 340, hits: 2830, matches: 158, previousHead: 14 },
  { head: 67, hits: 610, matches: 35, previousHead: 11 },
  { head: 22, hits: 240, matches: 19, previousHead: null },
  { head: 29, hits: 420, matches: 27, previousHead: 10 },
  { head: 1, hits: 15, matches: 2, previousHead: null },
  { head: 0, hits: 22, matches: 1, previousHead: null },
]

function clanRows(period: string, previous: boolean): BodyZoneStatsRow[] {
  return CLAN_PLAYERS.flatMap((player, index) => {
    const memberId = PLAYERS[index].memberId
    if (previous) {
      if (player.previousHead === null) return []
      return rows(memberId, period, { head: player.previousHead, torso: 50, pelvis: 12, arms: 11, legs: 27 - player.previousHead }, { head: 12, torso: 52, pelvis: 10, arms: 12, legs: 14 }, 10)
    }
    const rest = player.hits - player.head
    const torso = Math.round(rest * 0.57)
    const pelvis = Math.round(rest * 0.13)
    const arms = Math.round(rest * 0.13)
    return rows(
      memberId,
      period,
      { head: player.head, torso, pelvis, arms, legs: rest - torso - pelvis - arms, other: player.hits * 2 },
      { head: Math.round(player.hits * 0.12), torso: Math.round(player.hits * 0.45), pelvis: Math.round(player.hits * 0.1), arms: Math.round(player.hits * 0.13), legs: Math.round(player.hits * 0.12), other: player.hits * 3 },
      player.matches
    )
  })
}

export function clanBodyZonesPayload(period: 'week' | 'month' | 'all') {
  const periodKey = period === 'all' ? 'all-time' : period === 'month' ? 'month-2026-10' : CURRENT_WEEK
  const previousKey = period === 'all' ? null : period === 'month' ? 'month-2026-09' : PREVIOUS_WEEK
  const current = clanRows(periodKey, false)
  const previousRows = previousKey ? clanRows(previousKey, true) : []
  const summary = summarizeBodyZones(current, BODY_ZONE_MIN_HITS_CLAN)
  const previous = previousKey ? summarizeBodyZones(previousRows, BODY_ZONE_MIN_HITS_CLAN) : null
  const block = (memberId: number, source: BodyZoneStatsRow[]) => summarizeBodyZones(source.filter((row) => row.memberId === memberId), BODY_ZONE_MIN_HITS_MEMBER)
  const measured = (source: BodyZoneStatsRow[]) =>
    PLAYERS.slice(0, CLAN_PLAYERS.length)
      .map((player) => ({ memberId: player.memberId, displayName: player.displayName, ...block(player.memberId, source) }))
      .filter((member) => member.matchesMeasured > 0)
  const previousRanks = new Map(rankMembersByHeadRate(measured(previousRows)).map((member) => [member.memberId, member.rank]))
  const weeks = bodyZoneWeeks(
    WEEKS.flatMap((week, index) => clanRows(week, false).map((row) => (row.side === 'dealt' && row.zone === 'head' ? { ...row, hits: Math.round(row.hits * (0.9 + (index % 3) * 0.08)) } : row))),
    WEEKS,
    BODY_ZONE_MIN_HITS_CLAN
  )
  const data = {
    period,
    periodKey,
    previousKey,
    weekKeys: WEEKS,
    ...summary,
    previous,
    trend: { dealtHead: bodyZoneTrend(summary.dealt.headRate, previous?.dealt.headRate ?? null), takenHead: bodyZoneTrend(summary.taken.headRate, previous?.taken.headRate ?? null) },
    weeks,
    members: rankMembersByHeadRate(measured(current)).map((member) => ({
      ...member,
      previousRank: previousRanks.get(member.memberId) ?? null,
      isNew: previousKey !== null && member.rank !== null && !previousRanks.has(member.memberId),
    })),
  }
  return { ok: true, meta: { scope: 'clan', clanId: CLAN_ID, period, periodKey, count: data.members.length }, data }
}

export function mockClanBodyZones(api: ApiMock) {
  api.on('GET', `/api/clans/${CLAN_ID}/telemetry/body-zones`, (url) => {
    const period = url.searchParams.get('period')
    return { body: clanBodyZonesPayload(period === 'month' || period === 'all' ? period : 'week') }
  })
}
