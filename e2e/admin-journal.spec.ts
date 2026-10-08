import { expect, test } from './support/api'
import { mockAdminJournal } from './support/admin-journal'
import { withSessionCookie } from './support/session'

/**
 * Journal d'administration — page SuperUser /settings/journal (docs/TODO/administration.md Q10) : une ligne par
 * action, filtres clan / compte / résultat, pagination, message clair tant que la migration n'est pas appliquée.
 * Toutes les API sont simulées.
 */

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

const entries = (page: import('@playwright/test').Page) => page.locator('main ul.app-panel > li')

test('chaque action : méthode, route sans le préfixe du clan, résultat, compte, clan et résumé', async ({ api, page }) => {
  mockAdminJournal(api)
  await page.goto('/settings/journal')
  await expect(page.getByRole('heading', { level: 1, name: 'Journal d’administration' })).toBeVisible()
  await expect(entries(page)).toHaveCount(50)

  const first = entries(page).first()
  await expect(first).toContainText('POST')
  await expect(first).toContainText('telemetry/sync-selected')
  await expect(first).not.toContainText('clans/[clanId]')
  await expect(first).toContainText('Joueur Owner')
  await expect(first).toContainText('Clan Démo')
  await expect(first).toContainText('queuedCount : 4')
  await expect(first.getByText('Réussie')).toBeVisible()

  const failed = entries(page).nth(3)
  await expect(failed.getByText('Erreur 500')).toBeVisible()
  await expect(failed).toContainText('PUBG indisponible')
})

test('filtres : « Erreurs » et clan envoyés à la route, retour à la première page', async ({ api, page }) => {
  const calls = mockAdminJournal(api)
  await page.goto('/settings/journal')
  await expect(entries(page)).toHaveCount(50)

  await page.getByRole('navigation', { name: 'Pages du journal' }).getByRole('button', { name: '2' }).click()
  await expect.poll(() => calls.urls.at(-1)?.searchParams.get('page')).toBe('2')

  await page.getByRole('button', { name: 'Erreurs' }).click()
  await expect.poll(() => calls.urls.at(-1)?.searchParams.get('outcome')).toBe('error')
  expect(calls.urls.at(-1)?.searchParams.get('page')).toBe('1')
  await expect(entries(page)).toHaveCount(12)

  await page.getByRole('button', { name: 'Clan : Tous les clans' }).click()
  await page.getByRole('menuitemradio', { name: 'Clan Démo' }).click()
  await expect.poll(() => calls.urls.at(-1)?.searchParams.get('clanId')).toBe('1')
})

test('migration pas encore appliquée : le message de la route est affiché', async ({ api, page }) => {
  mockAdminJournal(api, { missingTable: true })
  await page.goto('/settings/journal')
  await expect(page.getByText('Journal indisponible : la migration add_admin_action_log n’est pas encore appliquée.')).toBeVisible()
})

test('aucun défilement horizontal', async ({ api, page }) => {
  mockAdminJournal(api)
  await page.goto('/settings/journal')
  await expect(entries(page)).toHaveCount(50)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
