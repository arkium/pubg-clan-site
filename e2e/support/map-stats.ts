import type { ApiMock } from './api'
import { MEMBER_ID, PLAYERS } from './data'
import { mockMemberProfile } from './members'

/**
 * Statistiques par carte d'un joueur (e2e/map-stats.spec.ts) : cinq cartes aux profils distincts pour que chaque tri
 * change l'ordre, et les trois meilleures formations. Chiffres inventés.
 */

type Row = [mapName: string, mapLabel: string, matches: number, wins: number, kills: number, knocks: number, damage: number, headshots: number, assists: number, revives: number, avgPlacement: number, durationSeconds: number]

const MAPS: Row[] = [
  ['Baltic_Main', 'Erangel', 48, 6, 92, 101, 14_820, 21, 30, 12, 9.4, 1_495],
  ['Desert_Main', 'Miramar', 31, 2, 74, 80, 11_230, 17, 18, 9, 12.1, 1_620],
  ['Savage_Main', 'Sanhok', 22, 5, 61, 66, 8_904, 25, 15, 14, 7.2, 1_180],
  ['Tiger_Main', 'Taego', 12, 1, 18, 22, 3_310, 4, 9, 3, 14.8, 1_402],
  ['Neon_Main', 'Rondo', 5, 0, 4, 6, 980, 1, 2, 1, 21.0, 905],
]

/** Ordre attendu des cartes pour un tri décroissant sur une colonne (index du tuple). */
export const mapsSortedBy = (column: number) => [...MAPS].sort((a, b) => Number(b[column]) - Number(a[column])).map((row) => row[1])
export const MAP_COLUMNS = { matches: 2, kills: 4 } as const

export function mockMapStats(api: ApiMock) {
  mockMemberProfile(api)
  api.on('GET', `/api/members/${MEMBER_ID}/map-stats`, (url) => {
    const scope = url.searchParams.get('scope') ?? 'self'
    // Le clan : deux fois plus de parties, pour que le changement de filtre se voie.
    const factor = scope === 'clan' ? 2 : 1
    const mapStats = MAPS.map(([mapName, mapLabel, matches, wins, kills, knocks, damage, headshots, assists, revives, avgPlacement, durationSeconds]) => ({
      mapName,
      mapLabel,
      matches: matches * factor,
      wins: wins * factor,
      winRate: wins / matches,
      top10Rate: Math.min(1, (wins * 3) / matches),
      avgPlacement,
      totalKills: kills * factor,
      totalKnockouts: knocks * factor,
      totalAssists: assists * factor,
      totalDamage: damage * factor,
      totalHeadshots: headshots * factor,
      totalRevives: revives * factor,
      avgDurationSeconds: durationSeconds,
    }))
    return {
      body: {
        scope,
        scopeLabel: scope === 'clan' ? 'Stats cartes du clan Clan Démo' : `Stats cartes de ${PLAYERS[0].displayName}`,
        options: { members: PLAYERS.slice(0, 4), bestModes: ['duo', 'trio', 'squad'] },
        selected: { memberId: MEMBER_ID, targetMemberId: null, bestMode: url.searchParams.get('bestMode') ?? 'duo', period: url.searchParams.get('period') ?? 'all' },
        totals: { rows: mapStats.reduce((sum, entry) => sum + entry.matches, 0), maps: mapStats.length },
        mapStats,
        bestCompositions: [
          { mode: 'duo', label: 'Meilleur duo', teamMembers: [PLAYERS[0].displayName, PLAYERS[1].displayName], matches: 26, wins: 5, winRate: 5 / 26, avgPlacement: 8.4 },
          { mode: 'trio', label: 'Meilleur trio', teamMembers: [PLAYERS[0].displayName, PLAYERS[1].displayName, PLAYERS[2].displayName], matches: 14, wins: 2, winRate: 2 / 14, avgPlacement: 10.2 },
          { mode: 'squad', label: 'Meilleur squad', teamMembers: PLAYERS.slice(0, 4).map((player) => player.displayName), matches: 41, wins: 6, winRate: 6 / 41, avgPlacement: 9.1 },
        ],
      },
    }
  })
}
