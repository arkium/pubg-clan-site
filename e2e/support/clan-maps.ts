import type { ApiMock } from './api'
import { CLAN_ID, PLAYERS } from './data'
import { parseLeagueMatchType } from '@/lib/clan-league'
import {
  buildClanMapRows,
  buildClanMapsVerdict,
  CLAN_MAPS_MIN_SAMPLE,
  type ClanMapAggregate,
  type ClanMapStarPlayer,
  type ClanMapStatsPayload,
  type LeagueMapAverage,
} from '@/lib/clan-maps'

/**
 * Cartes d'un clan (e2e/clan-maps.spec.ts) : cinq cartes calculées par les fonctions de la page (`@/lib/clan-maps`),
 * pour que le verdict, les écarts et le tri soient ceux de la production. Chiffres inventés.
 *
 * - Taego : carte forte (+22 pts) ; Miramar : à travailler (−10 pts, en baisse de 10 pts) ; Erangel : la plus jouée ;
 * - Rondo : 4 parties, échantillon faible (en fin de liste, sans écart) ;
 * - parties de tournoi : aucune sur le mois (état vide), quelques-unes depuis le début.
 */

const LABELS: Record<string, string> = { Baltic_Main: 'Erangel', Desert_Main: 'Miramar', Tiger_Main: 'Taego', Savage_Main: 'Sanhok', Neon_Main: 'Rondo' }

const agg = (mapName: string, matches: number, top10: number, wins: number, placement: number, kills: number): ClanMapAggregate => ({
  mapName,
  matches,
  wins,
  top10,
  placementSum: Math.round(placement * matches),
  killsSum: kills * matches,
  damageSum: kills * matches * 130,
})

const CURRENT: ClanMapAggregate[] = [
  agg('Baltic_Main', 40, 24, 4, 9.2, 4),
  agg('Desert_Main', 20, 6, 1, 13.5, 3),
  agg('Tiger_Main', 15, 10, 2, 7.4, 5),
  agg('Savage_Main', 12, 6, 1, 10.1, 3.5),
  agg('Neon_Main', 4, 3, 1, 6, 6),
]
const CUSTOM_ALL: ClanMapAggregate[] = [agg('Baltic_Main', 11, 5, 1, 9, 4), agg('Desert_Main', 11, 4, 0, 11, 3)]
const PREVIOUS: ClanMapAggregate[] = [agg('Desert_Main', 20, 8, 1, 12, 3), agg('Baltic_Main', 30, 15, 2, 10, 3.5)]
const LEAGUE: LeagueMapAverage[] = [
  { mapName: 'Baltic_Main', top10Rate: 0.5, avgPlacement: 10.4, killsPerMatch: 3.6 },
  { mapName: 'Desert_Main', top10Rate: 0.4, avgPlacement: 11.8, killsPerMatch: 3.2 },
  { mapName: 'Tiger_Main', top10Rate: 0.45, avgPlacement: 10.9, killsPerMatch: 3.4 },
  { mapName: 'Savage_Main', top10Rate: 0.5, avgPlacement: 10.1, killsPerMatch: 3.9 },
  { mapName: 'Neon_Main', top10Rate: 0.42, avgPlacement: 11, killsPerMatch: 3 },
]
const STARS = new Map<string, ClanMapStarPlayer>([['Baltic_Main', { memberId: PLAYERS[0].memberId, displayName: PLAYERS[0].displayName, matches: 32, killsPerMatch: 4.81 }]])

export function clanMapsPayload(period: 'week' | 'month' | 'all', matchType: ClanMapStatsPayload['matchType']): ClanMapStatsPayload {
  const empty = matchType === 'custom' && period !== 'all'
  const current = empty ? [] : matchType === 'custom' ? CUSTOM_ALL : CURRENT
  const maps = buildClanMapRows({
    current,
    previous: period === 'all' ? null : PREVIOUS,
    league: LEAGUE,
    stars: STARS,
    labelOf: (mapName) => LABELS[mapName] ?? mapName,
  })
  return {
    clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' },
    period,
    matchType,
    minSample: CLAN_MAPS_MIN_SAMPLE,
    comparedClans: 36,
    totals: { matches: maps.reduce((sum, row) => sum + row.matches, 0), maps: maps.length },
    maps,
    verdict: buildClanMapsVerdict(maps),
  }
}

export function mockClanMaps(api: ApiMock) {
  api.on('GET', `/api/clans/${CLAN_ID}/map-stats`, (url) => {
    const raw = url.searchParams.get('period')
    const period = raw === 'week' || raw === 'all' ? raw : 'month'
    return { body: clanMapsPayload(period, parseLeagueMatchType(url.searchParams.get('matchType'))) }
  })
}
