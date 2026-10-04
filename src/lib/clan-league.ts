import { sessionDateOf } from '@/lib/match-sessions'
import type { StandardPeriod } from '@/lib/period'
import type { ClanMatchTypeFilter } from '@/types/squad-matches'

/**
 * Ligue Inter-Clans (`/clans-leaderboard`, docs/features/ligue-clans.md) : classements recalculés depuis les parties
 * d'un type donné, à n'importe quelle date — période en cours, période précédente (flèches, meilleure remontée), soirée
 * par soirée (fil de la ligue). Même règle que le comparateur : seules comptent les parties avec au moins un membre
 * actif du clan, et seules les stats de ses membres actifs. Module pur, testé par `clan-league.test.ts`.
 *
 * Power score (docs/TODO/score.md, 2026-10-04) : score brut (placement, dégâts, kills, knocks moyens) pondéré par le
 * volume — `LEAGUE_PRIOR_MATCHES` parties fictives au niveau moyen de la ligue — et classement réservé aux clans qui
 * ont joué `LEAGUE_MIN_MATCHES` parties sur la période. Constantes réglables ci-dessous, sans toucher à la logique.
 */

// ── Barème et constantes ────────────────────────────────────────────────────────────────────────

/** Points de placement par place finale (1er 10, 2e 6, 3e 5, 4e 4, 5e 3, 6e 2, 7e et 8e 1) ; au-delà, 0. */
export const PLACEMENT_POINTS: readonly number[] = [10, 6, 5, 4, 3, 2, 1, 1]
/** Coefficient des points de placement moyens (objectif : ≈ 40 % du score moyen de la ligue). */
export const PLACEMENT_WEIGHT = 250
export const DAMAGE_WEIGHT = 1
export const KILL_WEIGHT = 10
export const KNOCK_WEIGHT = 5
/** M : parties fictives au niveau moyen de la ligue ajoutées à chaque clan (peu de parties → score proche de la moyenne). */
export const LEAGUE_PRIOR_MATCHES = 20
/** Parties minimum sur la période pour être classé ; en dessous, le clan est « En qualification ». */
export const LEAGUE_MIN_MATCHES: Record<StandardPeriod, number> = { week: 5, month: 15, all: 30 }

export function placementPoints(placement: number) {
  return Number.isInteger(placement) && placement >= 1 && placement <= PLACEMENT_POINTS.length ? PLACEMENT_POINTS[placement - 1] : 0
}

/** Score brut : points de placement moyens × 250 + dégâts moyens + kills moyens × 10 + knocks moyens × 5. */
export function clanRawScore(input: { avgPlacementPoints: number; avgDamage: number; avgKills: number; avgKnocks: number }): number {
  return (
    input.avgPlacementPoints * PLACEMENT_WEIGHT +
    input.avgDamage * DAMAGE_WEIGHT +
    input.avgKills * KILL_WEIGHT +
    input.avgKnocks * KNOCK_WEIGHT
  )
}

/**
 * Power score — la seule formule du site : (n × score brut + M × score moyen de la ligue) / (n + M), n = parties du clan.
 * Avec peu de parties, le score reste proche de la moyenne ; plus un clan joue, plus son propre niveau pèse.
 */
export function clanPowerScore(input: { matches: number; rawScore: number; leagueScore: number }): number {
  const prior = LEAGUE_PRIOR_MATCHES
  return (input.matches * input.rawScore + prior * input.leagueScore) / (input.matches + prior)
}

// ── Types de partie ─────────────────────────────────────────────────────────────────────────────

/** Types de partie de la ligue (sélecteur de la page) : pas de « Tous », chaque type a son classement. */
export type LeagueMatchType = Exclude<ClanMatchTypeFilter, 'all'>

/** `short` : libellé du sélecteur segmenté sur mobile ; `noun` : « sans partie … » dans les phrases. */
export const LEAGUE_MATCH_TYPE_OPTIONS: Array<{ value: LeagueMatchType; label: string; short: string; noun: string; hint: string }> = [
  { value: 'official', label: 'Normal', short: 'Normal', noun: 'normale', hint: 'parties officielles (matchmaking normal)' },
  { value: 'competitive', label: 'Ranked', short: 'Ranked', noun: 'Ranked', hint: 'parties classées (Ranked)' },
  { value: 'casual', label: 'Casual', short: 'Casual', noun: 'casual', hint: 'parties casual, lobbies de bots compris' },
  { value: 'custom', label: 'Tournois / Custom', short: 'Tournois', noun: 'de tournoi ou custom', hint: 'parties personnalisées, tournois compris' },
]

/** Valeurs de `SquadMatch.matchType` couvertes par chaque type (même règle que `matchTypeMatchesFilter`). */
export function leagueMatchTypeValues(matchType: LeagueMatchType): string[] {
  if (matchType === 'casual') return ['casual', 'airoyale']
  return [matchType]
}

export function parseLeagueMatchType(value: string | null): LeagueMatchType {
  return LEAGUE_MATCH_TYPE_OPTIONS.some((option) => option.value === value) ? (value as LeagueMatchType) : 'official'
}

export const leagueMatchTypeOption = (matchType: LeagueMatchType) =>
  LEAGUE_MATCH_TYPE_OPTIONS.find((option) => option.value === matchType) ?? LEAGUE_MATCH_TYPE_OPTIONS[0]

// ── Classement ──────────────────────────────────────────────────────────────────────────────────

/** Une partie d'un clan : stats cumulées de ses membres actifs présents. */
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
  /** Points de placement moyens (barème `PLACEMENT_POINTS`). */
  avgPlacementPoints: number
  avgDamage: number
  avgKills: number
  avgKnocks: number
  /** Score brut du clan, avant la pondération par le volume. */
  rawScore: number
  powerScore: number
  /** Rang au Power score (1 = premier), parmi les clans classés. */
  rank: number
}

/** Clan qui a joué sur la période, sous le minimum de parties : pas de rang. */
export type LeagueQualifier = LeagueClan & { matches: number; required: number }

export type LeagueAverage = {
  /** Lignes clan × partie de la fenêtre, tous clans confondus (qualifiés ou non). */
  matches: number
  avgPlacementPoints: number
  avgDamage: number
  avgKills: number
  avgKnocks: number
  /** Score brut des totaux mis en commun — pas la moyenne des scores des clans. */
  rawScore: number
}

export type LeagueTable = { standings: LeagueStanding[]; qualifying: LeagueQualifier[]; league: LeagueAverage }

type Totals = { matches: number; wins: number; points: number; damage: number; kills: number; knocks: number }

const emptyTotals = (): Totals => ({ matches: 0, wins: 0, points: 0, damage: 0, kills: 0, knocks: 0 })

function averagesOf(totals: Totals) {
  const per = (value: number) => (totals.matches > 0 ? value / totals.matches : 0)
  const averages = { avgPlacementPoints: per(totals.points), avgDamage: per(totals.damage), avgKills: per(totals.kills), avgKnocks: per(totals.knocks) }
  return { ...averages, rawScore: clanRawScore(averages) }
}

/**
 * Classement entre `from` (inclus) et `to` (exclu) — même règle quelle que soit la fenêtre (période, période
 * précédente, soirée par soirée) : score moyen de la ligue sur toutes les lignes de la fenêtre, Power score pondéré,
 * rang pour les clans d'au moins `minMatches` parties, les autres « En qualification ».
 */
export function leagueTableBetween(
  rows: readonly LeagueMatchRow[],
  clans: readonly LeagueClan[],
  from: Date | null,
  to: Date | null,
  minMatches: number
): LeagueTable {
  const byClan = new Map<number, Totals>()
  const all = emptyTotals()
  for (const row of rows) {
    const time = row.createdAt.getTime()
    if ((from && time < from.getTime()) || (to && time >= to.getTime())) continue
    const points = placementPoints(row.placement)
    let clanTotals = byClan.get(row.clanId)
    if (!clanTotals) {
      clanTotals = emptyTotals()
      byClan.set(row.clanId, clanTotals)
    }
    // Le clan et la ligue entière : le score moyen met en commun toutes les lignes, qualifiés ou non.
    for (const entry of [clanTotals, all]) {
      entry.matches += 1
      if (row.placement === 1) entry.wins += 1
      entry.points += points
      entry.damage += row.damage
      entry.kills += row.kills
      entry.knocks += row.knocks
    }
  }
  const league: LeagueAverage = { matches: all.matches, ...averagesOf(all) }

  const standings: LeagueStanding[] = []
  const qualifying: LeagueQualifier[] = []
  for (const clan of clans) {
    const totals = byClan.get(clan.clanId)
    if (!totals || totals.matches === 0) continue
    if (totals.matches < minMatches) {
      qualifying.push({ ...clan, matches: totals.matches, required: minMatches })
      continue
    }
    const averages = averagesOf(totals)
    standings.push({
      ...clan,
      matches: totals.matches,
      wins: totals.wins,
      winRate: totals.wins / totals.matches,
      ...averages,
      powerScore: clanPowerScore({ matches: totals.matches, rawScore: averages.rawScore, leagueScore: league.rawScore }),
      rank: 0,
    })
  }
  qualifying.sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, 'fr'))
  return { standings: rankStandings(standings), qualifying, league }
}

/** Clans classés seulement (fil de la ligue, période précédente) : même règle que `leagueTableBetween`. */
export function standingsBetween(
  rows: readonly LeagueMatchRow[],
  clans: readonly LeagueClan[],
  from: Date | null,
  to: Date | null,
  minMatches: number
): LeagueStanding[] {
  return leagueTableBetween(rows, clans, from, to, minMatches).standings
}

function rankStandings(standings: LeagueStanding[]) {
  standings.sort((a, b) => b.powerScore - a.powerScore || b.matches - a.matches || a.name.localeCompare(b.name, 'fr'))
  standings.forEach((standing, index) => {
    standing.rank = index + 1
  })
  return standings
}

// ── Critères ────────────────────────────────────────────────────────────────────────────────────

export type LeagueCriterion = 'power' | 'placement' | 'winRate' | 'damage' | 'kills' | 'knocks'

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Les colonnes affichent les valeurs brutes ; seul le Power score est pondéré. Le win rate reste un critère. */
export const LEAGUE_CRITERIA: Array<{ key: LeagueCriterion; label: string; long: string; value: (standing: LeagueStanding) => number; format: (value: number) => string }> = [
  { key: 'power', label: 'Power', long: 'Power score', value: (s) => s.powerScore, format: (v) => integer.format(Math.round(v)) },
  { key: 'placement', label: 'Placement', long: 'Points de placement moyens', value: (s) => s.avgPlacementPoints, format: (v) => oneDecimal.format(v) },
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
export function leagueFeed(
  rows: readonly LeagueMatchRow[],
  clans: readonly LeagueClan[],
  from: Date | null,
  sessionDates: readonly string[],
  minMatches: number,
  limit = 5
) {
  const inPeriod = rows.filter((row) => !from || row.createdAt.getTime() >= from.getTime())
  const bySession = inPeriod.map((row) => ({ row, session: sessionDateOf(row.createdAt) }))
  const upTo = (date: string) => bySession.filter((entry) => entry.session <= date).map((entry) => entry.row)
  const events: LeagueFeedEvent[] = []
  for (let index = 1; index < sessionDates.length; index += 1) {
    // Clans classés seulement (seuil de la période) : franchir le seuil n'est pas un événement.
    const before = standingsBetween(upTo(sessionDates[index - 1]), clans, null, null, minMatches)
    const after = standingsBetween(upTo(sessionDates[index]), clans, null, null, minMatches)
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
