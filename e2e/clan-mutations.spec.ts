import { expect, test } from './support/api'
import { MUTATIONS_API, mockClanMutations } from './support/clan-mutations'

/**
 * Mouvements de clan (`/clans/mutations`, docs/features/cycle-de-vie-clan.md) — charte UI (migrée le 04/10/2026) :
 * bandeau photo, mouvements groupés par jour de Paris, nature en tuile de couleur de jeu, pagination numérotée, état
 * vide et invitation à se connecter (l'API est réservée aux membres connectés).
 */

const rows = (page: import('@playwright/test').Page) => page.getByTestId('clan-mutation')

test('bandeau, explication, mouvements groupés par jour avec leur nature', async ({ api, page }) => {
  mockClanMutations(api)
  await page.goto('/clans/mutations')
  await expect(page.getByRole('heading', { level: 1, name: 'Mouvements de clan' })).toBeVisible()
  await expect(page.getByRole('main').locator('header')).toContainText('30 mouvements')
  await expect(page.getByText(/sans\s+validation humaine/)).toBeVisible()

  // 01:45 à Paris reste sur son jour : arrivée et départ du dimanche 4 octobre.
  const sunday = page.getByRole('region', { name: 'dimanche 4 octobre 2026' })
  await expect(sunday.getByTestId('clan-mutation')).toHaveCount(2)
  const arrival = sunday.getByTestId('clan-mutation').first()
  await expect(arrival).toHaveAttribute('data-kind', 'arrival')
  await expect(arrival).toContainText('Nova')
  await expect(arrival).toContainText('01:45')
  await expect(arrival).toContainText('sans clan')
  await expect(arrival).toContainText('[DEMO]')
  await expect(arrival).toContainText('synchronisation automatique')
  await expect(sunday.getByTestId('clan-mutation').nth(1)).toHaveAttribute('data-kind', 'departure')

  await expect(rows(page).filter({ hasText: 'Kestrel' })).toHaveAttribute('data-kind', 'transfer')
  const reverted = rows(page).filter({ hasText: 'Membre supprimé' })
  await expect(reverted).toHaveAttribute('data-kind', 'reverted')
  await expect(reverted).toContainText('Transféré par un SuperUser')
  await expect(reverted).not.toContainText('synchronisation automatique')
})

test('pagination numérotée : la page 2 recharge la liste', async ({ api, page }) => {
  mockClanMutations(api)
  await page.goto('/clans/mutations')
  await expect(rows(page)).toHaveCount(25)
  const pager = page.getByRole('navigation', { name: 'Pages des mouvements' })
  await expect(pager).toContainText('Mouvements 1–25 sur 30')
  await pager.getByRole('button', { name: '2', exact: true }).click()
  await expect.poll(() => api.paramValues(MUTATIONS_API, 'page').at(-1)).toBe('2')
  await expect(rows(page)).toHaveCount(5)
  await expect(pager).toContainText('Mouvements 26–30 sur 30')
  await expect(pager.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('aucun mouvement : état vide expliqué, pas de pagination', async ({ api, page }) => {
  mockClanMutations(api, { empty: true })
  await page.goto('/clans/mutations')
  await expect(page.getByText('Aucun mouvement enregistré')).toBeVisible()
  await expect(page.getByText(/confirmés plusieurs jours/)).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Pages des mouvements' })).toHaveCount(0)
})

test('sans session : invitation à se connecter plutôt qu’une erreur', async ({ api, page }) => {
  mockClanMutations(api, { status: 401 })
  await page.goto('/clans/mutations')
  await expect(page.getByText('Réservé aux membres connectés')).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login?redirect=/clans/mutations')
  await expect(page.getByText(/Impossible de charger/)).toHaveCount(0)
})

test('aucun défilement horizontal', async ({ api, page }) => {
  mockClanMutations(api)
  await page.goto('/clans/mutations')
  await expect(rows(page)).toHaveCount(25)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
