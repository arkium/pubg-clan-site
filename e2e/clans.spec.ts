import type { Page } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { mockClanDirectory, mockClanOverview } from './support/pages'

/**
 * Annuaire des clans (`/clans`) — docs/features/clans.md §Annuaire (maquette Claude Design « Clans »).
 * Visiteur qui revient (clan 1 mémorisé) : « Dernier clan consulté » épinglé, clan du moment, clans actifs triés par
 * activité, recherche, clans en sommeil repliés.
 */

const activeNames = (page: Page) => page.getByRole('region', { name: 'Clans actifs' }).locator('li b')

test.beforeEach(async ({ api, page }) => {
  mockClanDirectory(api)
  await page.goto('/clans')
  await expect(page.getByRole('heading', { level: 1, name: 'Les clans' })).toBeVisible()
})

test('bandeau et totaux sur une ligne', async ({ page }) => {
  await expect(page.getByText('4 clans suivis')).toBeVisible()
  await expect(page.getByText('11 joueurs ont joué ce soir')).toBeVisible()
  await expect(page.getByText('depuis le début du suivi')).toBeVisible()
})

test('à la une : dernier clan consulté et clan du moment', async ({ page }) => {
  const featured = page.getByRole('region', { name: 'À la une' })
  await expect(featured.getByText('Dernier clan consulté')).toBeVisible()
  await expect(featured).toContainText('Clan Démo')
  await expect(featured.getByRole('button', { name: 'Clan du moment : Clan Meute' })).toContainText('EN FEU CETTE SEMAINE')
})

test('clans actifs triés par activité, puis par nom ; recherche par tag', async ({ page }) => {
  // Joueurs de la soirée d'abord : Meute (8), Démo (3), puis Témoin et le clan technique ; l'endormi n'y est pas.
  await expect(activeNames(page)).toHaveText(['Clan Meute', 'Clan Démo', 'Clan Témoin', 'Ungrouped'])
  await page.getByRole('button', { name: 'Nom', exact: true }).filter({ visible: true }).click()
  await expect(activeNames(page)).toHaveText(['Clan Démo', 'Clan Meute', 'Clan Témoin', 'Ungrouped'])

  await page.getByRole('searchbox', { name: 'Rechercher un clan' }).fill('[temo]')
  await expect(activeNames(page)).toHaveText(['Clan Témoin'])
  await expect(page.getByRole('region', { name: 'À la une' })).toHaveCount(0)
})

test('clans en sommeil repliés, puis affichés', async ({ page }) => {
  const sleeping = page.getByRole('region', { name: 'Clans en sommeil' })
  await expect(sleeping).toContainText('1 clan · pas de partie depuis 14 jours')
  await expect(sleeping.getByText('Clan Endormi')).toHaveCount(0)
  await sleeping.getByRole('button', { name: /En sommeil/ }).click()
  await expect(sleeping.getByText('Clan Endormi')).toBeVisible()
})

test('ouvrir le clan épinglé mène à sa vue d’ensemble', async ({ api, page }) => {
  mockClanOverview(api)
  await page.getByRole('region', { name: 'À la une' }).getByRole('button', { name: /Clan Démo/ }).click()
  await expect(page).toHaveURL(new RegExp(`/clans/${CLAN_ID}/overview`))
})
