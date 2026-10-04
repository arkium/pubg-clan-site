import type { Page } from '@playwright/test'

import type { ApiMock } from './api'
import { mockMemberSession } from './session'

/**
 * Mon compte (e2e/account.spec.ts) : session d'un membre, profil (deux membres liés dont un inactif, masqué), mise à
 * jour du profil et du mot de passe renvoyées sans rien écrire. Les avatars DiceBear (hors /api) sont servis en local :
 * le test ne dépend pas d'Internet. Les corps envoyés sont gardés pour vérifier ce que la page envoie.
 */

export type AccountCalls = { profiles: Array<{ email: string; displayName: string; avatarUrl: string }>; passwords: Array<{ currentPassword: string; newPassword: string }> }

const AVATAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#888"/></svg>'

export async function mockAccount(api: ApiMock, page: Page): Promise<AccountCalls> {
  const calls: AccountCalls = { profiles: [], passwords: [] }
  let profile = { id: 7, email: 'joueur@example.com', displayName: 'Alpha', avatarUrl: null as string | null }
  mockMemberSession(api, { email: 'joueur@example.com' })
  api
    .on('GET', '/api/auth/profile', () => ({
      body: {
        profile: {
          ...profile,
          members: [
            { memberId: 1, displayName: 'Joueur Alpha', pubgPlayerName: 'Alpha_PUBG', platformShard: 'steam', isActive: true },
            { memberId: 9, displayName: 'Ancien compte', pubgPlayerName: 'Old_PUBG', platformShard: 'steam', isActive: false },
          ],
        },
      },
    }))
    .on('PATCH', '/api/auth/profile', (_url, request) => {
      const body = request.postDataJSON() as AccountCalls['profiles'][number]
      calls.profiles.push(body)
      profile = { ...profile, email: body.email, displayName: body.displayName, avatarUrl: body.avatarUrl || null }
      return { body: { success: true, profile } }
    })
    .on('PATCH', '/api/auth/password', (_url, request) => {
      const body = request.postDataJSON() as AccountCalls['passwords'][number]
      calls.passwords.push(body)
      if (body.currentPassword === 'mauvais-mdp') return { status: 400, body: { error: 'Mot de passe actuel incorrect' } }
      return { body: { success: true, message: 'Mot de passe mis à jour' } }
    })
  await page.route('https://api.dicebear.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: AVATAR_SVG }))
  return calls
}
