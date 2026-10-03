import type { Page } from '@playwright/test'

import { expect, test } from './support/api'
import { MEMBER_ID } from './support/data'
import { toolbar } from './support/layout'
import { MAP_COLUMNS, mapsSortedBy, mockMapStats } from './support/map-stats'

/** Statistiques par carte d'un joueur — page migrée vers la charte le 03/10/2026 (docs/ui/index.html). */

const cards = (page: Page) => page.getByRole('region', { name: 'Performance par carte' }).getByRole('article')
const cardTitles = async (page: Page) => (await cards(page).locator('h3').allTextContents()).map((text) => text.trim())

async function openMapStats(page: Page) {
  await page.goto(`/members/${MEMBER_ID}/map-stats`)
  await expect(page.getByRole('heading', { level: 1, name: 'Statistique des cartes' })).toBeVisible()
  await expect(cards(page)).toHaveCount(5)
}

test.describe('statistiques par carte', () => {
  test.beforeEach(async ({ api, page }) => {
    mockMapStats(api)
    await openMapStats(page)
  })

  test('une carte par map, triées par matchs, sans défilement horizontal', async ({ page }) => {
    expect(await cardTitles(page)).toEqual(mapsSortedBy(MAP_COLUMNS.matches))
    // La tuile du critère de tri est teintée ; douze tuiles par carte.
    const first = cards(page).first()
    await expect(first.locator('.app-stat-tile')).toHaveCount(12)
    await expect(first.locator('.app-stat-tile--active')).toHaveText(/Matchs/)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('trier par kills puis inverser le sens', async ({ page }) => {
    await page.locator('#map-stats-sort-1').click()
    await page.locator('#map-stats-sort-1-menu').getByText('Kills', { exact: true }).click()
    expect(await cardTitles(page)).toEqual(mapsSortedBy(MAP_COLUMNS.kills))
    await expect(cards(page).first().locator('.app-stat-tile--active')).toHaveText(/Kills/)

    await page.getByRole('button', { name: 'Tri décroissant actif' }).click()
    expect(await cardTitles(page)).toEqual([...mapsSortedBy(MAP_COLUMNS.kills)].reverse())
  })

  test('périmètre « Tout le clan » : recharge les cartes', async ({ api, page }) => {
    await toolbar(page).getByRole('button', { name: /Périmètre/ }).click()
    await page.getByRole('menuitemradio', { name: 'Tout le clan' }).click()
    await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/map-stats`, 'scope')).toContain('clan')
    await expect(page.getByRole('region', { name: 'Performance par carte' })).toContainText('Tout le clan')
  })

  test('périmètre : un joueur par pastille, à la couleur de son style de jeu sur la période', async ({ api, page }) => {
    await toolbar(page).getByRole('button', { name: /Périmètre/ }).click()
    const menu = page.getByRole('menu', { name: 'Périmètre' })
    await expect(menu.getByRole('menuitemradio', { name: 'Joueur Alpha' }).locator('[data-style]')).toHaveAttribute('data-style', 'fragger')
    await expect(menu.getByRole('menuitemradio', { name: 'Tout le clan' }).locator('[data-style]')).toHaveCount(0)
    await expect(menu.getByText('Style de jeu sur la période :')).toBeVisible()
    await menu.getByRole('menuitemradio', { name: 'Joueur Bravo' }).click()
    await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/map-stats`, 'targetMemberId').at(-1)).toBe('2')
  })

  test('bandeau : la période et la pastille ont la même hauteur', async ({ page }) => {
    const rail = await toolbar(page).locator('.app-segmented-control').first().boundingBox()
    const chip = await toolbar(page).getByRole('button', { name: /Périmètre/ }).boundingBox()
    expect(Math.abs(rail!.height - chip!.height)).toBeLessThanOrEqual(1)
  })

  test('compositions : les trois formations', async ({ page }) => {
    const compositions = page.getByRole('region', { name: 'Compositions d’équipe' })
    await expect(compositions.getByRole('article')).toHaveCount(3)
    await expect(compositions.getByRole('article', { name: 'Meilleur squad' })).toContainText('Joueur Delta')
  })
})
