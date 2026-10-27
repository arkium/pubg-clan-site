import { DEFAULT_DISCORD_SETTINGS } from '@/lib/discord/discord-config'
import { describeTop1Delay } from '@/lib/discord/discord-sync-delay'

import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { mockMemberSession, withSessionCookie } from './support/session'

/**
 * Notifications Discord d'un clan (`/clans/[clanId]/settings/discord`) — docs/features/discord-notifications.md :
 * l'alerte Top 1 n'est pas en direct, la page dit le délai d'après la fréquence réelle de la synchronisation des parties
 * (docs/TODO/synchro-parties-30-min.md). Toutes les API sont simulées ; le délai est calculé par la vraie fonction.
 */

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

for (const [expression, expected] of [
  ['*/30 * * * *', 'toutes les 30 minutes. Compte en général jusqu’à 45 minutes après la fin de la partie.'],
  ['0 * * * *', 'toutes les heures. Compte en général jusqu’à 1 h 15 après la fin de la partie.'],
] as const) {
  test(`alertes Top 1 : délai annoncé pour une synchronisation « ${expression} »`, async ({ api, page }) => {
    mockMemberSession(api, { superUser: true })
    api.on('GET', `/api/clans/${CLAN_ID}/settings/discord`, {
      body: { settings: DEFAULT_DISCORD_SETTINGS, clanLabel: '[DEMO] Clan Démo', top1Delay: describeTop1Delay(expression) },
    })

    await page.goto(`/clans/${CLAN_ID}/settings/discord`)

    const top1 = page.getByRole('region', { name: 'Alertes Top 1' })
    await expect(top1).toContainText('Un message part après chaque victoire d’une escouade du clan.')
    const delay = top1.getByTestId('top1-delay')
    await expect(delay).toContainText('Pas en direct')
    await expect(delay).toContainText(expected)
  })
}

test('alertes Top 1 : sans délai connu, aucune phrase inventée', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  api.on('GET', `/api/clans/${CLAN_ID}/settings/discord`, { body: { settings: DEFAULT_DISCORD_SETTINGS, clanLabel: '[DEMO] Clan Démo' } })

  await page.goto(`/clans/${CLAN_ID}/settings/discord`)

  await expect(page.getByRole('region', { name: 'Alertes Top 1' })).toContainText('Activer les alertes Top 1')
  await expect(page.getByTestId('top1-delay')).toHaveCount(0)
})
