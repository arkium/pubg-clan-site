import { dominantRole, type RosterRoleId } from '@/lib/member-roster'
import { sessionDateOf } from '@/lib/match-sessions'
import type { StandardPeriod } from '@/lib/period'

/**
 * Tableau de bord d'un joueur (`/members/[id]/dashboard`, docs/features/membres.md) : tout ce qui se calcule sans
 * base — barres d'activité, écart au clan, profil de jeu et tendance, clés de période. Module pur, testé par
 * `player-dashboard.test.ts`.
 */

// ── Clés de période des agrégats (PlayerStats, MemberTelemetryStats) ─────────────────────────────────────

function isoWeek(date: Date) {
  const tmp = new Date(date.getTime())
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  return { year: tmp.getFullYear(), week: 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86_400_000 - 3 + ((week1.getDay() + 6) % 7)) / 7) }
}

function periodKey(period: StandardPeriod, date: Date) {
  if (period === 'all') return 'all-time'
  if (period === 'month') return `month-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  const { year, week } = isoWeek(date)
  return `week-${year}-${String(week).padStart(2, '0')}`
}

/**
 * Clé de la période en cours et de la précédente, au format des agrégats (`period-aggregates.ts`, heure locale du
 * serveur). « Tous » n'a pas de période précédente : pas de tendance.
 */
export function statsPeriodKeys(period: StandardPeriod, now: Date) {
  if (period === 'all') return { current: 'all-time', previous: null }
  const before = period === 'week' ? new Date(now.getTime() - 7 * 86_400_000) : new Date(now.getFullYear(), now.getMonth() - 1, 1, 12)
  return { current: periodKey(period, now), previous: periodKey(period, before) }
}

// ── Barres d'activité des chiffres clés ────────────────────────────────────────────────────────────

export type ActivityMatch = { createdAt: string; kills: number; damage: number; placement: number }
export type ActivityBucket = { key: string; label: string; kills: number; damage: number; matches: number; wins: number }

const DAY_MS = 86_400_000
const toDay = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
const fromDay = (time: number) => new Date(time).toISOString().slice(0, 10)
/** Lundi (journée de jeu) de la semaine d'une date `AAAA-MM-JJ`. */
const mondayOf = (date: string) => toDay(date) - ((new Date(toDay(date)).getUTCDay() + 6) % 7) * DAY_MS
const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

/**
 * Découpage des parties en barres : les 7 soirées de la semaine, les semaines du mois, les 8 dernières semaines pour
 * « Tous ». Une partie est rangée dans sa **soirée** (`sessionDateOf`, CLAUDE.md piège n° 12), pas dans sa date UTC.
 */
export function activityBuckets(matches: readonly ActivityMatch[], period: StandardPeriod, now: Date): { unit: 'day' | 'week'; buckets: ActivityBucket[] } {
  const today = sessionDateOf(now)
  const currentMonday = mondayOf(today)
  let buckets: ActivityBucket[]
  let bucketOf: (sessionDate: string) => string

  if (period === 'week') {
    buckets = WEEKDAYS.map((label, index) => ({ key: fromDay(currentMonday + index * DAY_MS), label, kills: 0, damage: 0, matches: 0, wins: 0 }))
    bucketOf = (date) => date
  } else {
    const mondays: number[] = []
    if (period === 'month') {
      const monthStart = toDay(`${today.slice(0, 7)}-01`)
      for (let monday = mondayOf(fromDay(monthStart)); monday <= currentMonday; monday += 7 * DAY_MS) mondays.push(monday)
    } else {
      for (let index = 7; index >= 0; index -= 1) mondays.push(currentMonday - index * 7 * DAY_MS)
    }
    buckets = mondays.map((monday) => ({ key: fromDay(monday), label: `sem. du ${fromDay(monday).slice(8, 10)}/${fromDay(monday).slice(5, 7)}`, kills: 0, damage: 0, matches: 0, wins: 0 }))
    bucketOf = (date) => fromDay(mondayOf(date))
  }

  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  for (const match of matches) {
    const bucket = byKey.get(bucketOf(sessionDateOf(match.createdAt)))
    if (!bucket) continue
    bucket.kills += match.kills
    bucket.damage += match.damage
    bucket.matches += 1
    if (match.placement === 1) bucket.wins += 1
  }
  return { unit: period === 'week' ? 'day' : 'week', buckets }
}

/** Hauteur relative (0–100) de chaque barre ; toutes à 0 quand la série est vide. */
export function barHeights(values: readonly number[]) {
  const max = Math.max(0, ...values)
  return values.map((value) => (max > 0 ? Math.round((Math.max(0, value) / max) * 100) : 0))
}

// ── Écart au clan ────────────────────────────────────────────────────────────────────────────────────

/** Écart relatif au clan, arrondi à l'unité : `null` sans moyenne du clan (rien n'est affiché, jamais « • »). */
export function clanGap(value: number, clanValue: number | null | undefined) {
  if (clanValue === null || clanValue === undefined || !Number.isFinite(clanValue) || clanValue <= 0) return null
  return Math.round(((value - clanValue) / clanValue) * 100)
}

export function clanGapLabel(gap: number | null) {
  if (gap === null) return null
  if (gap === 0) return 'dans la moyenne du clan'
  return `${gap > 0 ? '+' : '−'}${Math.abs(gap)} % vs clan`
}

// ── Profil de jeu ──────────────────────────────────────────────────────────────────────────────────

export type PlaystyleScores = { aggression: number; support: number; zoneDiscipline: number }

export const PROFILE_ROWS: Array<{ id: RosterRoleId; role: string; metric: string; pick: (scores: PlaystyleScores) => number }> = [
  { id: 'fragger', role: 'Fragger', metric: 'Agressivité', pick: (scores) => scores.aggression },
  { id: 'medic', role: 'Medic', metric: 'Support', pick: (scores) => scores.support },
  { id: 'ghost', role: 'Ghost', metric: 'Discipline zone', pick: (scores) => scores.zoneDiscipline },
]

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

/**
 * Une barre par rôle : score du joueur, repère de la moyenne du clan, tendance en points par rapport à la période
 * précédente (`null` : pas de période précédente mesurée, rien n'est affiché).
 */
export function profileRows(current: PlaystyleScores, previous: PlaystyleScores | null, clan: PlaystyleScores | null) {
  return PROFILE_ROWS.map((row) => {
    const value = clampScore(row.pick(current))
    return {
      id: row.id,
      role: row.role,
      metric: row.metric,
      value,
      clan: clan ? clampScore(row.pick(clan)) : null,
      trend: previous ? value - clampScore(row.pick(previous)) : null,
    }
  })
}

/** Rôle affiché dans la carte joueur : « Fragger · 82 % ». */
export function profileRole(current: PlaystyleScores | null) {
  if (!current) return null
  return dominantRole({ aggression: current.aggression, support: current.support, zoneDiscipline: current.zoneDiscipline })
}

export function trendLabel(trend: number | null) {
  if (trend === null) return null
  if (trend === 0) return '='
  return `${trend > 0 ? '▲' : '▼'} ${Math.abs(trend)}`
}
