import { expect, test } from './support/api'
import { mockDatabaseSettings } from './support/database'
import { mockMemberSession, withSessionCookie } from './support/session'

/**
 * Base de données (/settings/database, SuperUser) — interrupteur de la conservation automatique des positions
 * (src/lib/geo-retention.ts, docs/ops/database-performance.md §4.4) : fermé par défaut, ouvert seulement après une
 * confirmation qui annonce le volume de la première nuit, fermé sans question. Toutes les API sont simulées.
 */

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

test('conservation automatique : fermée par défaut, ouverte après confirmation, refermée sans question', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  const posts = mockDatabaseSettings(api)
  await page.goto('/settings/database')

  const toggle = page.getByTestId('geo-retention-switch')
  const description = page.locator('#geo-retention-desc')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(toggle).toBeEnabled()
  await expect(description).toContainText('Fermée : aucun tracé n’est vidé automatiquement')
  await expect(description).toContainText(/environ 7\s609 matchs la première nuit/)

  // Ouvrir demande confirmation, volume compris ; annuler n'envoie rien.
  await toggle.click()
  const confirm = page.getByTestId('geo-retention-confirm')
  await expect(confirm).toContainText(/environ 7\s609 matchs/)
  await expect(confirm).toContainText('rien ne pourra les recréer')
  await confirm.getByRole('button', { name: 'Annuler' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(posts).toEqual([])

  await toggle.click()
  await page.getByTestId('geo-retention-confirm').getByRole('button', { name: 'Ouvrir' }).click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(description).toContainText('Ouverte : chaque nuit à 01:15, la maintenance vide les tracés de plus de 30 jours (90 pour les Top 1')
  expect(posts).toEqual([{ action: 'retention', enabled: true }])

  // Fermer n'efface rien : pas de confirmation.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('geo-retention-confirm')).toHaveCount(0)
  expect(posts).toEqual([
    { action: 'retention', enabled: true },
    { action: 'retention', enabled: false },
  ])

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('ouverte, la conservation se lit comme telle dès le chargement', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  mockDatabaseSettings(api, { retentionEnabled: true })
  await page.goto('/settings/database')

  await expect(page.getByTestId('geo-retention-switch')).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('#geo-retention-desc')).toContainText('Ouverte : chaque nuit à 01:15')
})
