/**
 * Page « Cartes » d'un clan (`/clans/[clanId]/stats/maps`, docs/TODO/cartes-clan.md) : calculs purs, partagés par la
 * route et les tests. Une partie = une partie d'escouade du clan (une ligne par `SquadMatch`, placement de l'équipe,
 * kills et dégâts des seuls membres actifs — la règle de la Ligue des clans) ; la moyenne des clans suit la même règle
 * sur tous les clans suivis.
 */

import type { LeagueMatchType } from '@/lib/clan-league'
import type { StandardPeriod } from '@/lib/period'

/** Sous ce nombre de parties sur une carte : ni écart, ni tendance, ni joueur phare ; tuile estompée, en fin de liste. */
export const CLAN_MAPS_MIN_SAMPLE = 10

/** Agrégat d'un clan sur une carte et une période. */
export type ClanMapAggregate = {
  mapName: string
  matches: number
  wins: number
  top10: number
  placementSum: number
  killsSum: number
  damageSum: number
}

/** Moyenne des clans suivis sur une carte (une partie d'escouade d'un clan = une ligne). */
export type LeagueMapAverage = {
  mapName: string
  top10Rate: number
  avgPlacement: number
  killsPerMatch: number
}

export type ClanMapStarPlayer = {
  memberId: number
  displayName: string
  matches: number
  killsPerMatch: number
}

export type ClanMapRow = {
  mapName: string
  mapLabel: string
  matches: number
  wins: number
  winRate: number
  top10Rate: number
  avgPlacement: number
  killsPerMatch: number
  damagePerMatch: number
  lowSample: boolean
  /** Écarts à la moyenne des clans : Top 10 en points, place et kills dans leur unité ; `null` sans comparaison. */
  vsClans: { top10Pts: number | null; avgPlacement: number | null; killsPerMatch: number | null }
  /** Évolution du Top 10 depuis la période précédente, en points ; `null` quand elle n'est pas connue. */
  top10TrendPts: number | null
  starPlayer: ClanMapStarPlayer | null
}

export type ClanMapsVerdict = {
  strongest: { mapName: string; mapLabel: string; top10Rate: number; vsClansPts: number } | null
  weakest: { mapName: string; mapLabel: string; top10Rate: number; vsClansPts: number; trendPts: number | null } | null
  mostPlayed: { mapName: string; mapLabel: string; matches: number; share: number } | null
}

/** Réponse de `GET /api/clans/[clanId]/map-stats`. */
export type ClanMapStatsPayload = {
  clan: { id: number; name: string; tag: string }
  period: StandardPeriod
  matchType: LeagueMatchType
  minSample: number
  /** Clans suivis pris dans la moyenne (phrase de méthode). */
  comparedClans: number
  totals: { matches: number; maps: number }
  maps: ClanMapRow[]
  verdict: ClanMapsVerdict
}

const ratio = (part: number, total: number) => (total > 0 ? part / total : 0)
const points = (rate: number) => rate * 100

export function buildClanMapRows(input: {
  current: ClanMapAggregate[]
  previous: ClanMapAggregate[] | null
  league: LeagueMapAverage[]
  stars: Map<string, ClanMapStarPlayer>
  labelOf: (mapName: string) => string
}): ClanMapRow[] {
  const previousByMap = new Map((input.previous ?? []).map((entry) => [entry.mapName, entry]))
  const leagueByMap = new Map(input.league.map((entry) => [entry.mapName, entry]))

  return input.current
    .filter((entry) => entry.matches > 0)
    .map((entry) => {
      const top10Rate = ratio(entry.top10, entry.matches)
      const avgPlacement = ratio(entry.placementSum, entry.matches)
      const killsPerMatch = ratio(entry.killsSum, entry.matches)
      const lowSample = entry.matches < CLAN_MAPS_MIN_SAMPLE
      const league = lowSample ? undefined : leagueByMap.get(entry.mapName)
      const previous = lowSample ? undefined : previousByMap.get(entry.mapName)
      const previousKnown = previous !== undefined && previous.matches >= CLAN_MAPS_MIN_SAMPLE

      return {
        mapName: entry.mapName,
        mapLabel: input.labelOf(entry.mapName),
        matches: entry.matches,
        wins: entry.wins,
        winRate: ratio(entry.wins, entry.matches),
        top10Rate,
        avgPlacement,
        killsPerMatch,
        damagePerMatch: ratio(entry.damageSum, entry.matches),
        lowSample,
        vsClans: {
          top10Pts: league ? points(top10Rate - league.top10Rate) : null,
          avgPlacement: league ? avgPlacement - league.avgPlacement : null,
          killsPerMatch: league ? killsPerMatch - league.killsPerMatch : null,
        },
        top10TrendPts: previousKnown ? points(top10Rate - ratio(previous.top10, previous.matches)) : null,
        starPlayer: lowSample ? null : input.stars.get(entry.mapName) ?? null,
      }
    })
}

/**
 * Carte forte : le plus grand écart de Top 10 **au-dessus** de la moyenne des clans ; carte à travailler : le plus grand
 * écart **en dessous** ; carte la plus jouée : la plus grande part des parties. Les deux premières ne retiennent que les
 * cartes comparables (au moins `CLAN_MAPS_MIN_SAMPLE` parties et une moyenne des clans connue) et restent `null` quand
 * aucune carte n'est du bon côté de la moyenne (mesuré le 2026-10-23 : sur tout l'historique, 47R est au-dessus partout ;
 * appeler « à travailler » une carte à +1 pt aurait été faux).
 */
export function buildClanMapsVerdict(rows: ClanMapRow[]): ClanMapsVerdict {
  const comparable = rows.filter((row) => !row.lowSample && row.vsClans.top10Pts !== null)
  const byGap = [...comparable].sort((a, b) => (b.vsClans.top10Pts ?? 0) - (a.vsClans.top10Pts ?? 0) || b.matches - a.matches)
  const strongest = byGap.find((row) => (row.vsClans.top10Pts ?? 0) > 0) ?? null
  const weakest = [...byGap].reverse().find((row) => (row.vsClans.top10Pts ?? 0) < 0) ?? null
  const total = rows.reduce((sum, row) => sum + row.matches, 0)
  const mostPlayed = [...rows].sort((a, b) => b.matches - a.matches || a.mapLabel.localeCompare(b.mapLabel, 'fr'))[0] ?? null

  return {
    strongest: strongest
      ? { mapName: strongest.mapName, mapLabel: strongest.mapLabel, top10Rate: strongest.top10Rate, vsClansPts: strongest.vsClans.top10Pts ?? 0 }
      : null,
    weakest: weakest
      ? {
          mapName: weakest.mapName,
          mapLabel: weakest.mapLabel,
          top10Rate: weakest.top10Rate,
          vsClansPts: weakest.vsClans.top10Pts ?? 0,
          trendPts: weakest.top10TrendPts,
        }
      : null,
    mostPlayed: mostPlayed
      ? { mapName: mostPlayed.mapName, mapLabel: mostPlayed.mapLabel, matches: mostPlayed.matches, share: ratio(mostPlayed.matches, total) }
      : null,
  }
}

/** Joueur phare d'une carte : le plus de kills par partie parmi les membres actifs d'au moins `CLAN_MAPS_MIN_SAMPLE` parties. */
export function pickStarPlayers(
  rows: Array<{ mapName: string; memberId: number; displayName: string; matches: number; killsSum: number }>
): Map<string, ClanMapStarPlayer> {
  const stars = new Map<string, ClanMapStarPlayer>()
  for (const row of rows) {
    if (row.matches < CLAN_MAPS_MIN_SAMPLE) continue
    const candidate = { memberId: row.memberId, displayName: row.displayName, matches: row.matches, killsPerMatch: ratio(row.killsSum, row.matches) }
    const current = stars.get(row.mapName)
    if (
      !current ||
      candidate.killsPerMatch > current.killsPerMatch ||
      (candidate.killsPerMatch === current.killsPerMatch && candidate.matches > current.matches)
    ) {
      stars.set(row.mapName, candidate)
    }
  }
  return stars
}

// ── Tri des tuiles ──────────────────────────────────────────────────────────────────────────────

export const CLAN_MAP_SORT_KEYS = ['matches', 'wins', 'winRate', 'top10Rate', 'avgPlacement', 'killsPerMatch', 'damagePerMatch'] as const
export type ClanMapSortKey = (typeof CLAN_MAP_SORT_KEYS)[number]

export const CLAN_MAP_SORT_LABELS: Record<ClanMapSortKey, string> = {
  matches: 'Parties',
  wins: 'Top 1',
  winRate: 'Win rate',
  top10Rate: 'Top 10',
  avgPlacement: 'Place moyenne',
  killsPerMatch: 'Kills / partie',
  damagePerMatch: 'Dégâts / partie',
}

export function isClanMapSortKey(value: unknown): value is ClanMapSortKey {
  return typeof value === 'string' && (CLAN_MAP_SORT_KEYS as readonly string[]).includes(value)
}

/** Tri demandé, les cartes de faible échantillon toujours en fin de liste. */
export function sortClanMapRows(rows: ClanMapRow[], key: ClanMapSortKey, dir: 'asc' | 'desc'): ClanMapRow[] {
  return [...rows].sort((a, b) => {
    if (a.lowSample !== b.lowSample) return a.lowSample ? 1 : -1
    const diff = a[key] - b[key]
    if (diff !== 0) return dir === 'asc' ? diff : -diff
    return b.matches - a.matches || a.mapLabel.localeCompare(b.mapLabel, 'fr')
  })
}
