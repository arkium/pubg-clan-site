import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'

/**
 * Connexion — retour sans se connecter et paramètre `?redirect=` (src/lib/login-redirect.ts). Le retour ne mène
 * jamais à `redirect` : c'est souvent une page protégée (`/settings/…`, `/account`) qui renverrait aussitôt ici.
 */

const backLinks = (page: import('@playwright/test').Page) => page.getByRole('link', { name: /^Retour/ })

test('depuis une page protégée : retour à l’accueil du site, pas vers la page protégée', async ({ page }) => {
  await page.goto('/login?redirect=/settings/telemetry')
  await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible()
  await expect(backLinks(page)).toHaveCount(2)
  for (const link of await backLinks(page).all()) await expect(link).toHaveAttribute('href', '/clans')
  await expect(backLinks(page).first()).toHaveText('Retour à l’accueil du site')
})

test('depuis une page de clan : accueil du clan, retour à sa vue d’ensemble', async ({ api, page }) => {
  api.on('GET', `/api/clans/${CLAN_ID}/settings/login-welcome`, {
    body: {
      settings: { badge: 'Bienvenue au clan', title: 'Connexion escouade', message: 'Bon retour parmi nous.', imageUrl: null },
      clanLabel: 'Clan Démo [DEMO]',
      clan: { name: 'Clan Démo', tag: 'DEMO' },
    },
  })
  await page.goto(`/login?redirect=/clans/${CLAN_ID}/settings/members`)
  await expect(backLinks(page).first()).toHaveText('Retour au clan Clan Démo [DEMO]')
  for (const link of await backLinks(page).all()) await expect(link).toHaveAttribute('href', `/clans/${CLAN_ID}/overview`)
})

test('adresse de retour hors du site : ignorée, comme sans `redirect`', async ({ page }) => {
  await page.goto('/login?redirect=%2F%5Cevil.example')
  await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible()
  await expect(backLinks(page).first()).toHaveText('Retour à l’accueil du site')
  for (const link of await backLinks(page).all()) await expect(link).toHaveAttribute('href', '/clans')
})
