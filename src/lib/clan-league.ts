import { sessionDateOf } from '@/lib/match-sessions'

/**
 * Ligue Inter-Clans (`/clans-leaderboard`, docs/features/ligue-clans.md) : classements recalculés depuis les parties
 * officielles, à n'importe quelle date — période en cours, période précédente (flèches, meilleure remontée), soirée
 * par soirée (fil de la ligue). Même règle que le comparateur : seules comptent les parties avec au moins un membre
 * actif du clan, et seules les stats de ses membres actifs. Module pur, testé par `clan-league.test.ts`.
 */

/** ((Win rate × 100) × 100) + dégâts moyens + kills moyens × 10 + mises à terre moyennes × 5. */
export function clanPowerScore(input: { winRate: number; avgDamage: number; avgKills: number; avgKnocks: number }): number {
  return input.winRate * 100 * 100 + input.avgDamage + input.avgKills * 10 + input.avgKnocks * 5
}

/** Une partie officielle d'un clan : stats cumulées de ses membres actifs présents. */
export type LeagueMatchRow = {
  clanId: number
  matchId: string
  createdAt: Date
  placement: number
  damage: number
  kills: number
  knocks: number
}

export type LeagueClan = { clanId: number; name: string; tag: string; imageUrl: string | null }

export type LeagueStanding = LeagueClan & {
  matches: number
  wins: number
  winRate: number
  avgDamage: number
  avgKills: number
  avgKnocks: number
  powerScore: number
  /** Rang au Power score (1 = premier). */
  rank: number
}

/** Classement au Power score des clans qui ont joué entre `from` (inclus) et `to` (exclu). */
export function standingsBetween(rows: readonly LeagueMatchRow[], clans: readonly LeagueClan[], from: Date | null, to: Date | null): LeagueStanding[] {
  const totals = new Map<number, { matches: number; wins: number; damage: number; kills: number; knocks: number }>()
  for (const row of rows) {
    const time = row.createdAt.getTime()
    if ((from && time < from.getTime()) || (to && time >= to.getTime())) continue
    const entry = totals.get(row.clanId) ?? { matches: 0, wins: 0, damage: 0, kills: 0, knocks: 0 }
    entry.matches += 1
    if (row.placement === 1) entry.wins += 1
    entry.damage += row.damage
    entry.kills += row.kills
    entry.knocks += row.knocks
    totals.set(row.clanId, entry)
  }
  return rankStandings(
    clans.flatMap((clan) => {
      const entry = totals.get(clan.clanId)
      if (!entry || entry.matches === 0) return []
      const winRate = entry.wins / entry.matches
      const avgDamage = entry.damage / entry.matches
      const avgKills = entry.kills / entry.matches
      const avgKnocks = entry.knocks / entry.matches
      return [{ ...clan, matches: entry.matches, wins: entry.wins, winRate, avgDamage, avgKills, avgKnocks, powerScore: clanPowerScore({ winRate, avgDamage, avgKills, avgKnocks }), rank: 0 }]
    })
  )
}

function rankStandings(standings: LeagueStanding[]) {
  standings.sort((a, b) => b.powerScore - a.powerScore || b.matches - a.matches || a.name.localeCompare(b.name, 'fr'))
  standings.forEach((standing, index) => {
    standing.rank = index + 1
  })
  return standings
}

// ── Critères ────────────────────────────────────────────────────────────────────────────────────

export type LeagueCriterion = 'power' | 'winRate' | 'damage' | 'kills' | 'knocks'

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const LEAGUE_CRITERIA: Array<{ key: LeagueCriterion; label: string; long: string; value: (standing: LeagueStanding) => number; format: (value: number) => string }> = [
  { key: 'power', label: 'Power', long: 'Power score', value: (s) => s.powerScore, format: (v) => integer.format(Math.round(v)) },
  { key: 'winRate', label: 'Win rate', long: 'Win rate', value: (s) => s.winRate, format: (v) => `${oneDecimal.format(v * 100)} %` },
  { key: 'damage', label: 'Dégâts', long: 'Dégâts moyens', value: (s) => s.avgDamage, format: (v) => integer.format(Math.round(v)) },
  { key: 'kills', label: 'Kills', long: 'Kills moyens', value: (s) => s.avgKills, format: (v) => oneDecimal.format(v) },
  { key: 'knocks', label: 'Knocks', long: 'Knocks moyens', value: (s) => s.avgKnocks, format: (v) => oneDecimal.format(v) },
]

export const leagueCriterion = (key: LeagueCriterion) => LEAGUE_CRITERIA.find((criterion) => criterion.key === key)!

/** Classement selon un critère ; égalité : Power score, puis nom. Le rang affiché est celui du critère. */
export function rankByCriterion<S extends LeagueStanding>(standings: readonly S[], key: LeagueCriterion): Array<S & { position: number }> {
  const criterion = leagueCriterion(key)
  return [...standings]
    .sort((a, b) => criterion.value(b) - criterion.value(a) || b.powerScore - a.powerScore || a.name.localeCompare(b.name, 'fr'))
    .map((standing, index) => ({ ...standing, position: index + 1 }))
}

/** Écart au clan juste devant, dans le format du critère : « cible : Bof Team à 44 ». */
export function targetAhead<S extends LeagueStanding & { position: number }>(ranked: readonly S[], clanId: number, key: LeagueCriterion) {
  const index = ranked.findIndex((standing) => standing.clanId === clanId)
  if (index <= 0) return null
  const criterion = leagueCriterion(key)
  const ahead = ranked[index - 1]
  return { name: ahead.name, gap: criterion.format(criterion.value(ahead) - criterion.value(ranked[index])) }
}

// ── Zones du classement ─────────────────────────────────────────────────────────────────────────

/** Podium 1–3, « Dans la zone » 4–8, « Blue zone » 9 et plus. */
export const LEAGUE_ZONE_END = 8

export function leagueZones<S extends { position: number }>(ranked: readonly S[]) {
  return {
    podium: ranked.slice(0, 3),
    zone: ranked.slice(3, LEAGUE_ZONE_END),
    blue: ranked.slice(LEAGUE_ZONE_END),
  }
}

// ── Fil de la ligue ─────────────────────────────────────────────────────────────────────────────

export type LeagueFeedEvent = {
  /** Soirée (`AAAA-MM-JJ`) du changement. */
  date: string
  kind: 'first' | 'climb' | 'overtake' | 'zone-in' | 'zone-out'
  clan: string
  text: string
  /** Pour le tri : plus le score est haut, plus l'événement est marquant. */
  weight: number
}

const ORDINAL = (rank: number) => (rank === 1 ? '1re' : `${rank}e`)

/**
 * Événements entre deux classements successifs (la veille et le jour même) : prise de la 1re place, remontée d'au
 * moins deux places, dépassement d'un clan du top 8, entrée ou sortie de la zone. Un clan qui n'était pas classé la
 * veille n'est pas un événement (premier match de la période).
 */
export function feedBetween(before: readonly LeagueStanding[], after: readonly LeagueStanding[], date: string): LeagueFeedEvent[] {
  if (before.length === 0) return []
  const rankBefore = new Map(before.map((standing) => [standing.clanId, standing.rank]))
  const byRankBefore = new Map(before.map((standing) => [standing.rank, standing]))
  const events: LeagueFeedEvent[] = []
  for (const standing of after) {
    const previous = rankBefore.get(standing.clanId)
    if (previous === undefined || previous === standing.rank) continue
    const gained = previous - standing.rank
    if (standing.rank === 1) {
      const dethroned = byRankBefore.get(1)
      events.push({ date, kind: 'first', clan: standing.name, text: dethroned ? `a sorti ${dethroned.name} de la 1re place` : 'prend la 1re place', weight: 100 })
      continue
    }
    if (previous > LEAGUE_ZONE_END && standing.rank <= LEAGUE_ZONE_END) {
      events.push({ date, kind: 'zone-in', clan: standing.name, text: `entre dans la zone (${ORDINAL(standing.rank)})`, weight: 60 + gained })
      continue
    }
    if (previous <= LEAGUE_ZONE_END && standing.rank > LEAGUE_ZONE_END) {
      events.push({ date, kind: 'zone-out', clan: standing.name, text: 'tombe en blue zone', weight: 55 })
      continue
    }
    if (gained >= 2) {
      events.push({ date, kind: 'climb', clan: standing.name, text: `remonte de ${gained} places (${ORDINAL(standing.rank)})`, weight: 40 + gained })
      continue
    }
    if (gained === 1 && standing.rank <= LEAGUE_ZONE_END) {
      const passed = byRankBefore.get(standing.rank)
      if (passed) events.push({ date, kind: 'overtake', clan: standing.name, text: `passe devant ${passed.name}`, weight: 30 - standing.rank })
    }
  }
  return events
}

/**
 * Fil de la ligue sur les soirées données (de la plus ancienne à la plus récente) : classement cumulé de la période à
 * la fin de chaque soirée, comparé à celui de la veille. Les plus récents d'abord, puis les plus marquants.
 */
export function leagueFeed(rows: readonly LeagueMatchRow[], clans: readonly LeagueClan[], from: Date | null, sessionDates: readonly string[], limit = 5) {
  const inPeriod = rows.filter((row) => !from || row.createdAt.getTime() >= from.getTime())
  const bySession = inPeriod.map((row) => ({ row, session: sessionDateOf(row.createdAt) }))
  const upTo = (date: string) => bySession.filter((entry) => entry.session <= date).map((entry) => entry.row)
  const events: LeagueFeedEvent[] = []
  for (let index = 1; index < sessionDates.length; index += 1) {
    const before = standingsBetween(upTo(sessionDates[index - 1]), clans, null, null)
    const after = standingsBetween(upTo(sessionDates[index]), clans, null, null)
    events.push(...feedBetween(before, after, sessionDates[index]))
  }
  return events.sort((a, b) => b.date.localeCompare(a.date) || b.weight - a.weight).slice(0, limit)
}

// ── Titres ──────────────────────────────────────────────────────────────────────────────────────

/** Minimum de parties pour un titre à la moyenne (en deçà, une seule partie ferait un record). */
export const LEAGUE_TITLE_MIN_MATCHES = 3

export function leagueTitles(standings: readonly LeagueStanding[], previousRanks: ReadonlyMap<number, number> | null) {
  const eligible = standings.filter((standing) => standing.matches >= LEAGUE_TITLE_MIN_MATCHES)
  const best = (pick: (standing: LeagueStanding) => number) =>
    eligible.reduce<LeagueStanding | null>((top, standing) => (!top || pick(standing) > pick(top) ? standing : top), null)
  const damage = best((standing) => standing.avgDamage)
  const knocks = best((standing) => standing.avgKnocks)
  let climb: { standing: LeagueStanding; places: number } | null = null
  if (previousRanks) {
    for (const standing of standings) {
      const previous = previousRanks.get(standing.clanId)
      if (previous === undefined) continue
      const places = previous - standing.rank
      if (places > 0 && (!climb || places > climb.places)) climb = { standing, places }
    }
  }
  return {
    damage: damage ? { clanId: damage.clanId, name: damage.name, value: damage.avgDamage } : null,
    knocks: knocks ? { clanId: knocks.clanId, name: knocks.name, value: knocks.avgKnocks } : null,
    climb: climb ? { clanId: climb.standing.clanId, name: climb.standing.name, places: climb.places } : null,
  }
}
