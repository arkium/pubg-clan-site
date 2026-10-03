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
}
