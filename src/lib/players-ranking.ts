/**
 * Joueurs — classement inter-clans et comparateur (maquette Claude Design « Joueurs », docs/features/joueurs.md).
 *
 * Module pur, importable côté client comme côté serveur : mode de jeu, critères, centiles et rôles, rangs et tendances,
 * rang du joueur connecté, recherche, mise en évidence et lecture du comparateur. Les sommes viennent de
 * `players-ranking-service.ts` (parties officielles **de clan**, comme la Ligue). Testé par `players-ranking.test.ts`.
 *
 * Rôles : les noms du site (Fragger, Medic, Ghost — `PlaystyleBadge`) plus « Tireur à distance » (décision du
 * 2026-10-12). Ici le score sur 100 est un **centile entre tous les clans** (part des joueurs classés qu'on dépasse),
 * alors que le style de jeu d'un joueur (`/members/[id]/playstyle`) se mesure au meilleur de son clan.
 */

import { dominantRole, type RosterRoleId } from '@/lib/member-roster'

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const formatInteger = (value: number) => integer.format(Math.round(value))
export const formatDecimal = (value: number) => oneDecimal.format(value)
/** Part 0–1 en pourcentage entier : « 32 % ». */
export const formatRate = (value: number) => `${integer.format(Math.round(value * 100))} %`
export const formatMeters = (value: number) => `${integer.format(Math.round(value))} m`
export const formatScore = (value: number) => `${integer.format(Math.round(value))} / 100`

/** Durée en minutes et secondes : « 16:56 » (au-delà d'une heure : « 1:02:05 »). */
export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

// ── Mode de jeu ─────────────────────────────────────────────────────────────────────────────────

export const PLAYERS_MODES = ['duo', 'squad', 'all'] as const
export type PlayersMode = (typeof PLAYERS_MODES)[number]

export const PLAYERS_MODE_LABELS: Record<PlayersMode, string> = { duo: 'Duo', squad: 'Squad', all: 'Tous' }
/** Complément de la phrase de critère : « Dégâts moyens, ce mois, en squad. » */
export const PLAYERS_MODE_WHEN: Record<PlayersMode, string> = { duo: 'en duo', squad: 'en squad', all: 'tous modes' }

export function parsePlayersMode(value: string | null | undefined): PlayersMode {
  return value === 'duo' || value === 'squad' ? value : 'all'
}

/**
 * Préfixe du `gameMode` PUBG de la partie (`duo`, `duo-fpp`, `squad`, `squad-fpp`), `null` pour « Tous ». Le mode vient
 * de PUBG, pas du nombre de membres suivis : une partie partagée par deux clans du même lobby fausserait ce compte.
 */
export function gameModePrefix(mode: PlayersMode): 'duo' | 'squad' | null {
  return mode === 'all' ? null : mode
}

// ── Seuils ──────────────────────────────────────────────────────────────────────────────────────

/** Classé à partir de 10 parties de clan sur la période (maquette ; mesuré : ~250 joueurs sur une semaine complète). */
export const PLAYERS_MIN_MATCHES = 10
/** En dessous de 20 joueurs classés, la page montre l'état « pas encore assez de parties » (début de semaine). */
export const PLAYERS_MIN_RANKED = 20
/** Échantillon minimal d'une mesure de rôle : kills (headshots), kills avec distance, fermetures de zone. */
export const ROLE_MIN_SAMPLE = 5
/** Lignes par page du classement (demande du 2026-10-12 : 10 au plus, pagination numérotée). */
export const PLAYERS_PAGE_SIZE = 10
/** Joueurs comparés au plus. */
export const MAX_COMPARED = 3

// ── Sommes et moyennes ──────────────────────────────────────────────────────────────────────────

/** Sommes d'une fenêtre, telles que lues en base (un joueur, ou tous les joueurs d'un clan pour sa moyenne). */
export type PlayerTotals = {
  matches: number
  wins: number
  damage: number
  kills: number
  knocks: number
  revives: number
  assists: number
  headshotKills: number
  survivalSeconds: number
  /** Kills dont la télémétrie donne la distance, et leur somme en mètres. */
  measuredKills: number
  killDistanceMeters: number
  /** Fermetures de zone observées, et celles passées dans le nouveau cercle. */
  zoneClosures: number
  zoneInside: number
}

export const EMPTY_TOTALS: PlayerTotals = {
  matches: 0,
  wins: 0,
  damage: 0,
  kills: 0,
  knocks: 0,
  revives: 0,
  assists: 0,
  headshotKills: 0,
  survivalSeconds: 0,
  measuredKills: 0,
  killDistanceMeters: 0,
  zoneClosures: 0,
  zoneInside: 0,
}

/** Moyennes par partie d'un joueur (ou d'un clan) sur la période et le mode choisis. */
export type PlayerStatLine = {
  matches: number
  wins: number
  avgDamage: number
  avgKills: number
  avgKnocks: number
  avgRevives: number
  avgAssists: number
  avgSurvivalSeconds: number
  /** Kills en headshot ÷ kills (0–1) ; `null` sous `ROLE_MIN_SAMPLE` kills. */
  headshotRate: number | null
  /** Distance moyenne des kills (m) ; `null` sous `ROLE_MIN_SAMPLE` kills mesurés. */
  avgKillDistance: number | null
  /** Part des fermetures de zone passées dans le nouveau cercle (0–1) ; `null` sous `ROLE_MIN_SAMPLE` fermetures. */
  zoneInsideRate: number | null
}

const round2 = (value: number) => Math.round(value * 100) / 100
const per = (sum: number, count: number) => (count > 0 ? round2(sum / count) : 0)

export function statLine(totals: PlayerTotals): PlayerStatLine {
  const { matches } = totals
  return {
    matches,
    wins: totals.wins,
    avgDamage: per(totals.damage, matches),
    avgKills: per(totals.kills, matches),
    avgKnocks: per(totals.knocks, matches),
    avgRevives: per(totals.revives, matches),
    avgAssists: per(totals.assists, matches),
    avgSurvivalSeconds: per(totals.survivalSeconds, matches),
    headshotRate: totals.kills >= ROLE_MIN_SAMPLE ? Math.round((totals.headshotKills / totals.kills) * 1000) / 1000 : null,
    avgKillDistance: totals.measuredKills >= ROLE_MIN_SAMPLE ? Math.round((totals.killDistanceMeters / totals.measuredKills) * 10) / 10 : null,
    zoneInsideRate: totals.zoneClosures >= ROLE_MIN_SAMPLE ? Math.round((totals.zoneInside / totals.zoneClosures) * 1000) / 1000 : null,
  }
}

export function addTotals(a: PlayerTotals, b: PlayerTotals): PlayerTotals {
  return Object.fromEntries(Object.keys(EMPTY_TOTALS).map((key) => [key, a[key as keyof PlayerTotals] + b[key as keyof PlayerTotals]])) as PlayerTotals
}

// ── Centiles et rôles ───────────────────────────────────────────────────────────────────────────

/**
 * Centile d'une valeur dans une population triée par ordre croissant : 0 sous tous les autres, 100 au-dessus de tous,
 * ex æquo à mi-chemin. `included` : la valeur fait partie de la population (un joueur classé) et ne se compte pas
 * elle-même. `null` sans population de comparaison.
 */
export function percentileOf(value: number, sorted: readonly number[], included: boolean): number | null {
  let below = 0
  let equal = 0
  for (const entry of sorted) {
    if (entry < value) below += 1
    else if (entry === value) equal += 1
    else break
  }
  if (included) {
    const others = sorted.length - 1
    if (others <= 0) return sorted.length === 1 ? 100 : null
    return ((below + Math.max(0, equal - 1) / 2) / others) * 100
  }
  if (sorted.length === 0) return null
  return ((below + equal / 2) / sorted.length) * 100
}

export type PlayerRoleId = 'fragger' | 'medic' | 'ghost' | 'sniper'
export type PlayerRoles = Record<PlayerRoleId, number | null>

export const PLAYER_ROLES: Array<{ id: PlayerRoleId; label: string; hint: string; metrics: Array<(line: PlayerStatLine) => number | null> }> = [
  { id: 'fragger', label: 'Fragger', hint: 'dégâts, kills et knocks', metrics: [(l) => l.avgDamage, (l) => l.avgKills, (l) => l.avgKnocks] },
  { id: 'medic', label: 'Medic', hint: 'réanimations, assistances et survie', metrics: [(l) => l.avgRevives, (l) => l.avgAssists, (l) => l.avgSurvivalSeconds] },
  { id: 'ghost', label: 'Ghost', hint: 'dans le cercle à chaque fermeture de zone', metrics: [(l) => l.zoneInsideRate] },
  { id: 'sniper', label: 'Tireur à distance', hint: 'distance des kills et headshots', metrics: [(l) => l.avgKillDistance, (l) => l.headshotRate] },
]

export const playerRole = (id: PlayerRoleId) => PLAYER_ROLES.find((role) => role.id === id)!

/**
 * Badge Fragger / Medic / Ghost d'un joueur (`RosterRoleBadge`) : le plus haut de ses trois scores de rôle **de la période
 * et du mode affichés** (décision du 2026-10-18 : un badge figé depuis le début ne se comprenait pas à côté des chiffres
 * de la période). Il ne dépend pas du critère de tri. « Tireur à distance » n'a pas de badge sur le site : hors calcul.
 * Égalité : Fragger, Medic, Ghost ; aucun badge sans score positif (`dominantRole`, la règle de la fiche soldat).
 */
export function playerStyle(roles: PlayerRoles): RosterRoleId | null {
  return dominantRole({ aggression: roles.fragger ?? 0, support: roles.medic ?? 0, zoneDiscipline: roles.ghost ?? 0 })?.id ?? null
}

/** Valeurs triées de chaque mesure de chaque rôle, sur les joueurs classés (`null` écartés). */
export type RolePopulation = Record<PlayerRoleId, number[][]>

export function rolePopulation(lines: readonly PlayerStatLine[]): RolePopulation {
  return Object.fromEntries(
    PLAYER_ROLES.map((role) => [
      role.id,
      role.metrics.map((metric) =>
        lines
          .map(metric)
          .filter((value): value is number => value !== null)
          .sort((a, b) => a - b)
      ),
    ])
  ) as RolePopulation
}

/**
 * Score de chaque rôle sur 100 : moyenne des centiles de ses mesures dans la population des joueurs classés. Une mesure
 * absente (échantillon trop petit) sort de la moyenne ; sans aucune mesure, le rôle vaut `null`.
 */
export function roleScores(line: PlayerStatLine, population: RolePopulation, included: boolean): PlayerRoles {
  return Object.fromEntries(
    PLAYER_ROLES.map((role) => {
      const centiles = role.metrics
        .map((metric, index) => {
          const value = metric(line)
          return value === null ? null : percentileOf(value, population[role.id][index], included)
        })
        .filter((value): value is number => value !== null)
      return [role.id, centiles.length > 0 ? Math.round(centiles.reduce((sum, value) => sum + value, 0) / centiles.length) : null]
    })
  ) as PlayerRoles
}

// ── Critères de classement ──────────────────────────────────────────────────────────────────────

export type PlayerCriterion = 'damage' | 'kills' | 'knocks' | 'revives' | 'survival' | PlayerRoleId

/** Ce qu'un critère lit : les moyennes et les rôles d'un joueur. */
export type RankablePlayer = PlayerStatLine & { roles: PlayerRoles }

type CriterionDef = {
  key: PlayerCriterion
  label: string
  /** Intitulé long : titre du podium, phrase sous les puces. */
  long: string
  kind: 'stat' | 'role'
  value: (player: RankablePlayer) => number | null
  format: (value: number) => string
  /** Unité de la plaque de score du podium (« 665 dégâts », « 94 / 100 ») : la valeur seule, puis l'unité. */
  unit: string
}

const roleCriterion = (id: PlayerRoleId): CriterionDef => ({
  key: id,
  label: playerRole(id).label,
  long: `Rôle ${playerRole(id).label}`,
  kind: 'role',
  value: (player) => player.roles[id],
  format: formatScore,
  unit: '/ 100',
})

/** Ordre des puces « Classer par » ; l'ordre sert aussi d'index à `previousRanks`. */
export const PLAYER_CRITERIA: CriterionDef[] = [
  { key: 'damage', label: 'Dégâts', long: 'Dégâts moyens', kind: 'stat', value: (p) => p.avgDamage, format: formatInteger, unit: 'dégâts' },
  { key: 'kills', label: 'Kills', long: 'Kills moyens', kind: 'stat', value: (p) => p.avgKills, format: formatDecimal, unit: 'kills' },
  { key: 'knocks', label: 'Knocks', long: 'Knocks moyens', kind: 'stat', value: (p) => p.avgKnocks, format: formatDecimal, unit: 'knocks' },
  { key: 'revives', label: 'Réanimations', long: 'Réanimations par partie', kind: 'stat', value: (p) => p.avgRevives, format: formatDecimal, unit: 'réas' },
  { key: 'survival', label: 'Survie', long: 'Temps de survie moyen', kind: 'stat', value: (p) => p.avgSurvivalSeconds, format: formatDuration, unit: 'min' },
  roleCriterion('fragger'),
  roleCriterion('medic'),
  roleCriterion('ghost'),
  roleCriterion('sniper'),
]

export const playerCriterion = (key: PlayerCriterion) => PLAYER_CRITERIA.find((criterion) => criterion.key === key)!

/** Valeur d'une plaque de score, sans l'unité : « 94 » pour un rôle (l'unité porte « / 100 »), sinon le format du critère. */
export function plateValue(key: PlayerCriterion, value: number) {
  const criterion = playerCriterion(key)
  return criterion.kind === 'role' ? formatInteger(value) : criterion.format(value)
}

export function parsePlayerCriterion(value: string | null | undefined): PlayerCriterion {
  return PLAYER_CRITERIA.find((criterion) => criterion.key === value)?.key ?? 'damage'
}

/** Phrase sous les puces : « Dégâts moyens, ce mois, tous modes. » ou l'explication du rôle. */
export function criterionSummary(key: PlayerCriterion, periodWhen: string, mode: PlayersMode) {
  const criterion = playerCriterion(key)
  const scope = `${periodWhen}, ${PLAYERS_MODE_WHEN[mode]}`
  if (criterion.kind === 'stat') return `${criterion.long}, ${scope}.`
  const role = playerRole(key as PlayerRoleId)
  return `${role.label} : score sur 100 (part des joueurs classés que tu dépasses) — ${role.hint}, ${scope}.`
}

// ── Classement ──────────────────────────────────────────────────────────────────────────────────

export type PlayerIdentity = { memberId: number; name: string; clanId: number; clanName: string; clanTag: string }

export type PlayerRankingEntry = PlayerIdentity &
  RankablePlayer & {
    /** Badge du joueur (Fragger, Medic, Ghost) sur la période et le mode : `playerStyle(roles)`. */
    style: RosterRoleId | null
    /**
     * Rang de la période précédente pour chaque critère, dans l'ordre de `PLAYER_CRITERIA` ; `null` : pas classé la
     * période précédente (« nouv. »), ou période « Tous » (aucune flèche).
     */
    previousRanks: Array<number | null> | null
  }

export type RankedPlayer<E extends RankablePlayer = PlayerRankingEntry> = E & { position: number }

/**
 * Classement selon un critère : valeur décroissante (mesure absente en dernier), puis parties, puis nom. Le rang
 * affiché est celui du critère, sans ex æquo (comme la Ligue).
 */
export function rankPlayers<E extends RankablePlayer & { name: string }>(entries: readonly E[], key: PlayerCriterion): Array<E & { position: number }> {
  const criterion = playerCriterion(key)
  return [...entries]
    .sort((a, b) => {
      const va = criterion.value(a)
      const vb = criterion.value(b)
      if (va === null || vb === null) {
        if (va !== vb) return va === null ? 1 : -1
      } else if (vb !== va) {
        return vb - va
      }
      return b.matches - a.matches || a.name.localeCompare(b.name, 'fr')
    })
    .map((entry, index) => ({ ...entry, position: index + 1 }))
}

/** Rangs de chaque joueur classé pour chaque critère (ordre de `PLAYER_CRITERIA`) : la base des flèches. */
export function ranksByMember<E extends RankablePlayer & { name: string; memberId: number }>(entries: readonly E[]): Map<number, Array<number | null>> {
  const ranks = new Map<number, Array<number | null>>(entries.map((entry) => [entry.memberId, PLAYER_CRITERIA.map(() => null)]))
  PLAYER_CRITERIA.forEach((criterion, index) => {
    for (const ranked of rankPlayers(entries, criterion.key)) {
      if (criterion.value(ranked) !== null) ranks.get(ranked.memberId)![index] = ranked.position
    }
  })
  return ranks
}

/** Rang de la période précédente pour le critère ; `null` : pas classé (« nouv. »). */
export function previousRankOf(entry: Pick<PlayerRankingEntry, 'previousRanks'>, key: PlayerCriterion): number | null {
  const index = PLAYER_CRITERIA.findIndex((criterion) => criterion.key === key)
  return entry.previousRanks?.[index] ?? null
}

// ── Rang du joueur connecté ─────────────────────────────────────────────────────────────────────

export type MyStanding =
  | {
      kind: 'ranked'
      position: number
      total: number
      value: number | null
      /** Part des joueurs classés derrière lui, en % entier. */
      aheadShare: number
      /** Le joueur juste devant et l'écart, au format du critère. */
      ahead: { name: string; clanTag: string; position: number; gap: string } | null
    }
  | { kind: 'qualifying'; matches: number; required: number; missing: number }

export function myStanding(
  ranked: ReadonlyArray<RankedPlayer>,
  qualifying: ReadonlyArray<Pick<PlayerRankingEntry, 'memberId' | 'matches'>>,
  memberId: number | null,
  key: PlayerCriterion,
  required = PLAYERS_MIN_MATCHES
): MyStanding | null {
  if (memberId === null) return null
  const index = ranked.findIndex((entry) => entry.memberId === memberId)
  if (index >= 0) {
    const criterion = playerCriterion(key)
    const mine = ranked[index]
    const value = criterion.value(mine)
    const aheadEntry = index > 0 ? ranked[index - 1] : null
    const aheadValue = aheadEntry ? criterion.value(aheadEntry) : null
    return {
      kind: 'ranked',
      position: mine.position,
      total: ranked.length,
      value,
      aheadShare: Math.round(((ranked.length - mine.position) / ranked.length) * 100),
      ahead:
        aheadEntry && aheadValue !== null && value !== null
          ? { name: aheadEntry.name, clanTag: aheadEntry.clanTag, position: aheadEntry.position, gap: criterion.format(aheadValue - value) }
          : null,
    }
  }
  const pending = qualifying.find((entry) => entry.memberId === memberId)
  return pending ? { kind: 'qualifying', matches: pending.matches, required, missing: Math.max(0, required - pending.matches) } : null
}

/** Meilleur joueur classé de chaque rôle (score non nul le plus haut). */
export function bestByRole<E extends RankablePlayer & { name: string }>(entries: readonly E[]): Array<{ role: PlayerRoleId; entry: E; score: number }> {
  return PLAYER_ROLES.flatMap((role) => {
    const [top] = rankPlayers(entries, role.id)
    const score = top?.roles[role.id]
    return top && score !== null && score !== undefined ? [{ role: role.id, entry: top, score }] : []
  })
}

// ── Recherche et filtre ─────────────────────────────────────────────────────────────────────────

/** Minuscules sans accents : « Pépane » se trouve en tapant « pepa ». */
export function searchKey(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Joueurs dont le pseudo (ou le tag du clan) contient la recherche, du clan choisi le cas échéant. */
export function filterPlayers<E extends Pick<PlayerIdentity, 'name' | 'clanId' | 'clanTag'>>(entries: readonly E[], search: string, clanId: number | null): E[] {
  const query = searchKey(search)
  return entries.filter(
    (entry) => (clanId === null || entry.clanId === clanId) && (query === '' || searchKey(entry.name).includes(query) || searchKey(entry.clanTag) === query)
  )
}

// ── Comparateur ─────────────────────────────────────────────────────────────────────────────────

/** Mesures du comparateur : les moyennes de la période et du mode, et deux agrégats de télémétrie (tous modes). */
export type ComparisonMetric =
  | 'avgDamage'
  | 'avgKills'
  | 'avgKnocks'
  | 'headshotRate'
  | 'avgKillDistance'
  | 'avgRevives'
  | 'avgAssists'
  | 'avgSurvivalSeconds'
  | 'avgCircleDelaySeconds'
  | 'avgBlueZoneHits'

export type ComparedValues = Record<ComparisonMetric, number | null>

export type ComparisonRow = { metric: ComparisonMetric; label: string; hint?: string; better: 'high' | 'low'; format: (value: number) => string }

export const COMPARISON_SECTIONS: Array<{ id: 'combat' | 'team' | 'positioning'; title: string; note?: string; rows: ComparisonRow[] }> = [
  {
    id: 'combat',
    title: 'Combat',
    rows: [
      { metric: 'avgDamage', label: 'Dégâts moyens', better: 'high', format: formatInteger },
      { metric: 'avgKills', label: 'Kills moyens', better: 'high', format: formatDecimal },
      { metric: 'avgKnocks', label: 'Knocks moyens', better: 'high', format: formatDecimal },
      { metric: 'headshotRate', label: 'Kills en headshot', better: 'high', format: formatRate },
      { metric: 'avgKillDistance', label: 'Distance moy. des kills', better: 'high', format: formatMeters },
    ],
  },
  {
    id: 'team',
    title: 'Équipe',
    rows: [
      { metric: 'avgRevives', label: 'Réanimations', hint: 'par partie', better: 'high', format: formatDecimal },
      { metric: 'avgAssists', label: 'Assistances', hint: 'par partie', better: 'high', format: formatDecimal },
      { metric: 'avgSurvivalSeconds', label: 'Temps de survie moyen', hint: 'min', better: 'high', format: formatDuration },
    ],
  },
  {
    id: 'positioning',
    title: 'Positionnement',
    // Décision du 2026-10-12 : agrégats de télémétrie de la période, stockés tous modes confondus.
    note: 'tous modes',
    rows: [
      { metric: 'avgCircleDelaySeconds', label: 'Retard moyen sur le cercle', hint: 'par partie · plus bas = mieux', better: 'low', format: (v) => `${integer.format(Math.round(v))} s` },
      // Libellé du style de jeu (clan et joueur) : chaque dégât de la zone bleue compte, pas chaque passage.
      { metric: 'avgBlueZoneHits', label: 'Coups de zone bleue', hint: 'par partie · plus bas = mieux', better: 'low', format: formatDecimal },
    ],
  },
]

/**
 * Cases « meilleur » d'une ligne : la meilleure valeur parmi les éléments retenus (un joueur sous le seuil reste
 * indicatif, hors concours). Rien quand moins de deux valeurs se comparent ou quand toutes sont égales.
 */
export function bestSlots(values: ReadonlyArray<number | null>, better: 'high' | 'low', eligible: readonly boolean[]): Set<number> {
  const candidates = values.flatMap((value, index) => (value !== null && eligible[index] ? [{ value, index }] : []))
  if (candidates.length < 2) return new Set()
  const best = better === 'high' ? Math.max(...candidates.map((c) => c.value)) : Math.min(...candidates.map((c) => c.value))
  const winners = candidates.filter((candidate) => candidate.value === best)
  return winners.length === candidates.length ? new Set() : new Set(winners.map((winner) => winner.index))
}

/** Traits de la « Lecture » : mesure, sens, phrase pour le plus haut et (le cas échéant) pour le plus bas. */
const READING_TRAITS: Array<{ metric: ComparisonMetric; high?: string; low?: string }> = [
  { metric: 'avgCircleDelaySeconds', low: 'arrive plus tôt dans le cercle' },
  { metric: 'avgKills', high: 'élimine plus' },
  { metric: 'avgKnocks', high: 'met plus d’adversaires au sol' },
  { metric: 'avgDamage', high: 'fait plus de dégâts' },
  { metric: 'avgRevives', high: 'réanime plus', low: 'réanime moins' },
  { metric: 'avgAssists', high: 'fait plus d’assistances' },
  { metric: 'headshotRate', high: 'touche plus souvent à la tête' },
  { metric: 'avgKillDistance', high: 'tue de plus loin', low: 'tue de plus près' },
  { metric: 'avgSurvivalSeconds', high: 'survit plus longtemps' },
]
/** Écart relatif minimal pour qu'un trait compte (5 %) : deux valeurs voisines ne disent rien. */
const READING_MIN_GAP = 0.05
const READING_MAX_TRAITS = 3

function joinTraits(traits: string[]) {
  return traits.length <= 1 ? traits.join('') : `${traits.slice(0, -1).join(', ')} et ${traits[traits.length - 1]}`
}

/**
 * « Lecture » du comparateur : pour chaque élément comparé, jusqu'à trois traits où il se détache des autres (plus
 * haut ou plus bas que tous, d'au moins 5 %), les plus marqués d'abord.
 */
export function comparisonReading(slots: ReadonlyArray<{ name: string; values: ComparedValues; qualified: boolean; matches: number }>): string[] {
  if (slots.length < 2) return []
  const traits = slots.map(() => [] as Array<{ text: string; gap: number }>)
  for (const trait of READING_TRAITS) {
    const values = slots.map((slot) => slot.values[trait.metric])
    if (values.some((value) => value === null)) continue
    const numbers = values as number[]
    for (const side of ['high', 'low'] as const) {
      const text = trait[side]
      if (!text) continue
      const order = numbers.map((value, index) => ({ value, index })).sort((a, b) => (side === 'high' ? b.value - a.value : a.value - b.value))
      const [first, second] = order
      const scale = Math.max(Math.abs(first.value), Math.abs(second.value))
      const gap = scale > 0 ? Math.abs(first.value - second.value) / scale : 0
      if (gap >= READING_MIN_GAP) traits[first.index].push({ text, gap })
    }
  }
  return slots.map((slot, index) => {
    const picked = traits[index].sort((a, b) => b.gap - a.gap).slice(0, READING_MAX_TRAITS).map((trait) => trait.text)
    const body = picked.length > 0 ? `${joinTraits(picked)}.` : 'reste proche des autres sur toutes les mesures.'
    return `${body}${slot.qualified ? '' : ` Sur ${slot.matches} partie${slot.matches > 1 ? 's' : ''} seulement.`}`
  })
}

/** Duel entre deux éléments comparés (clés de slot) : éliminations de chacun sur l'autre, dernière rencontre. */
export type PlayerDuel = {
  a: string
  b: string
  aKills: number
  bKills: number
  last: { date: string; mapName: string; killer: string } | null
}

/** Clé d'un élément comparé : `12` pour un joueur, `clan-5` pour la moyenne d'un clan. */
export type CompareKey = { kind: 'player'; memberId: number } | { kind: 'clan'; clanId: number }

export function parseCompareKeys(value: string | null | undefined): CompareKey[] {
  const keys: CompareKey[] = []
  const seen = new Set<string>()
  for (const raw of (value ?? '').split(',')) {
    const token = raw.trim()
    const clan = /^clan-(\d{1,9})$/.exec(token)
    const member = /^(\d{1,9})$/.exec(token)
    const key: CompareKey | null = clan ? { kind: 'clan', clanId: Number(clan[1]) } : member ? { kind: 'player', memberId: Number(member[1]) } : null
    if (!key || (key.kind === 'clan' ? key.clanId : key.memberId) <= 0) continue
    const id = compareKeyId(key)
    if (seen.has(id)) continue
    seen.add(id)
    keys.push(key)
    if (keys.length === MAX_COMPARED) break
  }
  return keys
}

export const compareKeyId = (key: CompareKey) => (key.kind === 'clan' ? `clan-${key.clanId}` : String(key.memberId))
