import type { ApiMock } from './api'
import { CLAN_ID, MEMBER_ID, PLAYERS } from './data'
import { mockMemberProfile } from './members'
import { mockClanPlaystyle, playstyleRows } from './stats'

/**
 * Style de jeu d'un joueur (e2e/player-playstyle.spec.ts) : Joueur Alpha, la première ligne du style de jeu du clan
 * (`e2e/support/stats.ts`) — premier en agressivité, deuxième en support, dernier en discipline de zone. Aucune partie
 * analysée sur « Mois », pour l'état vide. Chiffres inventés.
 */
export function mockPlayerPlaystyle(api: ApiMock) {
  mockMemberProfile(api)
  mockClanPlaystyle(api)
  api.on('GET', `/api/members/${MEMBER_ID}/telemetry/playstyle`, (url) => {
    const period = url.searchParams.get('period') ?? 'week'
    // La route du joueur ne renvoie que les mesures : sans memberId ni displayName (ils sont dans `member`).
    const stats: Record<string, unknown> = { ...playstyleRows()[0] }
    delete stats.memberId
    delete stats.displayName
    const member = { id: MEMBER_ID, displayName: PLAYERS[0].displayName, clanId: CLAN_ID }
    const data = { member, stats: period === 'month' ? null : stats }
    return { body: { ok: true, meta: { scope: 'member', memberId: MEMBER_ID, period, periodKey: 'x', count: data.stats ? 1 : 0 }, data, ...data } }
  })
  // Meilleures formations (venues des statistiques par carte le 2026-10-03) : un trio sans partie n'est pas affiché.
  api.on('GET', `/api/members/${MEMBER_ID}/map-stats`, {
    body: {
      mapStats: [],
      bestCompositions: [
        { mode: 'duo', label: 'Meilleur duo', teamMembers: [PLAYERS[0].displayName, PLAYERS[1].displayName], matches: 26, wins: 5, winRate: 5 / 26, avgPlacement: 8.4 },
        { mode: 'trio', label: 'Meilleur trio', teamMembers: [], matches: 0, wins: 0, winRate: 0, avgPlacement: 0 },
        { mode: 'squad', label: 'Meilleur squad', teamMembers: PLAYERS.slice(0, 4).map((player) => player.displayName), matches: 41, wins: 6, winRate: 6 / 41, avgPlacement: 9.1 },
      ],
    },
  })
}
