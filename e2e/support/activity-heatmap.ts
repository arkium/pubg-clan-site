import type { ApiMock } from './api'
import { MEMBER_ID, PLAYERS } from './data'
import { mockPlaystyleColors } from './drop-zones'
import { mockMemberProfile } from './members'

/**
 * Calendrier d'activité d'un joueur (e2e/member-heatmap.spec.ts) : des soirées de semaine et un pic le samedi à 21h.
 * « Mois » ne renvoie aucune partie, pour l'état vide. Chiffres inventés.
 */

const CELLS: Array<[dayIndex: number, hour: number, count: number]> = [
  [0, 20, 2], [0, 21, 3], [2, 21, 2], [2, 22, 1], [4, 20, 1], [4, 21, 4], [4, 22, 3],
  [5, 20, 3], [5, 21, 8], [5, 22, 6], [5, 23, 2], [6, 0, 1], [6, 15, 2], [6, 16, 1],
]

export function mockActivityHeatmap(api: ApiMock) {
  mockMemberProfile(api)
  mockPlaystyleColors(api)
  api.on('GET', `/api/members/${MEMBER_ID}/activity-heatmap`, (url) => {
    const period = url.searchParams.get('period') ?? 'all'
    const scope = url.searchParams.get('scope') ?? 'self'
    const factor = scope === 'clan' ? 3 : 1
    const heatmap = period === 'month' ? [] : CELLS.map(([dayIndex, hour, count]) => ({ day: String(dayIndex), dayIndex, hour, count: count * factor }))
    const matchCount = heatmap.reduce((sum, cell) => sum + cell.count, 0)
    return {
      body: {
        scope,
        scopeLabel: scope === 'clan' ? 'Clan Démo' : PLAYERS[0].displayName,
        options: {
          members: PLAYERS.slice(0, 4).map((player) => ({ id: player.memberId, displayName: player.displayName })),
          bestModes: ['duo', 'trio', 'squad'],
          mapNames: ['Baltic_Main', 'Desert_Main'],
          mapLabels: { Baltic_Main: 'Erangel', Desert_Main: 'Miramar' },
        },
        selected: { memberId: MEMBER_ID, targetMemberId: null, bestMode: 'duo', period, mapName: url.searchParams.get('mapName') ?? '' },
        matchCount,
        heatmap,
        maxCellCount: heatmap.reduce((max, cell) => Math.max(max, cell.count), 0),
        playtimeSeconds: matchCount * 1_560,
        activeDays: period === 'month' ? 0 : 9,
      },
    }
  })
}
