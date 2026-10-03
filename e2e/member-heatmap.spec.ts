import type { Page } from '@playwright/test'

import { mockActivityHeatmap } from './support/activity-heatmap'
import { expect, test } from './support/api'
import { MEMBER_ID } from './support/data'
import { periodFilter, toolbar } from './support/layout'

/** Calendrier d'activité d'un joueur — page migrée vers la charte le 03/10/2026 (docs/ui/index.html). */

async function openHeatmap(page: Page) {
  await page.goto(`/members/${MEMBER_ID}/heatmap`)
  await expect(page.getByRole('heading', { level: 1, name: 'Calendrier d’activité' })).toBeVisible()
  await expect(page.getByTestId('busiest-slot')).toBeVisible()
}

test.describe('calendrier d’activité', () => {
  test.beforeEach(async ({ api, page }) => {
    mockActivityHeatmap(api)
    await openHeatmap(page)
  })

  test('chiffres clés, créneau favori et résumé sous le titre (plus d’encart dans le bandeau)', async ({ page }) => {
    await expect(page.getByTestId('busiest-slot')).toContainText('Sam 21h')
    await expect(page.getByTestId('busiest-slot')).toContainText('8 parties sur ce créneau')
    await expect(page.getByTestId('heatmap-summary')).toHaveText('Joueur Alpha · 39 parties depuis le début')
    await expect(toolbar(page).getByText(/match\(s\) utilises/)).toHaveCount(0)
  })

  test('échelle de la charte : cases en app-seq, le créneau le plus joué au palier 4', async ({ page }) => {
    const grid = page.locator('.hidden.md\\:block, .md\\:hidden').filter({ visible: true })
    await expect(grid.locator('[title="Sam 21h : 8 parties"]')).toHaveClass(/app-seq-4/)
    await expect(grid.locator('[title="Mar 03h : 0 partie"]')).toHaveClass(/app-seq-0/)
    await expect(page.getByTestId('heatmap-legend').locator('.app-seq-4')).toHaveCount(1)
  })

  test('périmètre « Tout le clan » et période sans partie', async ({ api, page }) => {
    await toolbar(page).getByRole('button', { name: /Périmètre/ }).click()
    await page.getByRole('menuitemradio', { name: 'Tout le clan' }).click()
    await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/activity-heatmap`, 'scope').at(-1)).toBe('clan')
    await expect(page.getByTestId('heatmap-summary')).toContainText('Tout le clan')

    await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
    await expect(page.getByText('Aucune partie pour ce filtre ce mois.')).toBeVisible()
  })

  test('périmètre : la pastille de chaque joueur montre son style de jeu sur la période ; un autre joueur se choisit ici', async ({ api, page }) => {
    await toolbar(page).getByRole('button', { name: /Périmètre/ }).click()
    const menu = page.getByRole('menu', { name: 'Périmètre' })
    await expect(menu.getByRole('menuitemradio', { name: 'Joueur Alpha' }).locator('[data-style]')).toHaveAttribute('data-style', 'fragger')
    await expect(menu.getByRole('menuitemradio', { name: 'Joueur Delta' }).locator('[data-style]')).toHaveAttribute('data-style', 'ghost')
    await expect(menu.getByRole('menuitemradio', { name: 'Son meilleur duo' }).locator('[data-style]')).toHaveCount(0)
    await expect(menu.getByText('Style de jeu sur la période :')).toBeVisible()
    await menu.getByRole('menuitemradio', { name: 'Joueur Bravo' }).click()
    await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/activity-heatmap`, 'targetMemberId').at(-1)).toBe('2')
  })

  test('carte : le sélecteur ‹ › passe de « Toutes » à chaque carte, et revient', async ({ api, page }) => {
    const pager = toolbar(page).getByRole('group', { name: 'Carte' })
    await expect(pager.getByTestId('active-map')).toHaveText('Toutes')
    await pager.getByRole('button', { name: 'Carte suivante' }).click()
    await expect(pager.getByTestId('active-map')).toHaveText('Erangel')
    await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/activity-heatmap`, 'mapName').at(-1)).toBe('Baltic_Main')
    await expect(page.getByTestId('heatmap-summary')).toContainText('· Erangel')
    await pager.getByRole('button', { name: 'Carte précédente' }).click()
    await expect(pager.getByTestId('active-map')).toHaveText('Toutes')
  })

  test('aucun défilement horizontal', async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
