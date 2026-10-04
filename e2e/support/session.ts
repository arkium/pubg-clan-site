import type { Page } from '@playwright/test'

import type { ApiMock } from './api'
import { CLAN_ID } from './data'

/**
 * Pages protégées par le proxy serveur (`/settings/*`, `/account`, src/proxy.ts) : sans cookie de session, renvoi vers
 * /login, même en mode visiteur. Un cookie factice suffit : le proxy ne vérifie que sa présence, le rendu serveur le
 * cherche en base (lecture seule, aucune session trouvée) et la session vient de `/api/auth/session`, simulée.
 */
export async function withSessionCookie(page: Page, baseURL: string) {
  await page.context().addCookies([{ name: 'pubg_clan_session', value: 'e2e-session-factice', url: baseURL }])
}

/** Session d'un membre connecté (auth activée), SuperUser ou non. */
export function mockMemberSession(api: ApiMock, options: { superUser?: boolean; email?: string } = {}) {
  const superUser = options.superUser ?? false
  api
    .on('GET', '/api/auth/mode', { body: { authDisabled: false } })
    .on('GET', '/api/members/1', { body: { id: 1, displayName: 'Joueur Alpha', avatarUrl: null, clanId: CLAN_ID } })
    .on('GET', '/api/auth/session', {
      body: {
        authenticated: true,
        user: { id: 7, email: options.email ?? 'admin@example.com', isSuperUser: superUser },
        activeMemberId: 1,
        permissions: [],
        members: [{ memberId: 1, displayName: 'Joueur Alpha', clanId: CLAN_ID, clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' } }],
        isSuperUser: superUser,
      },
    })
}
