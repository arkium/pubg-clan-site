import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { mockClanMaps } from './support/clan-maps'
import { CLAN_ID, MEMBER_ID } from './support/data'
import { dock, periodFilter, toolbar } from './support/layout'

/**
 * Cartes du clan — refonte de l'ancienne « Heatmap kills » (maquette Claude Design « Cartes clan - Fait », 2026-10-23,
 * docs/TODO/cartes-clan.md). Page publique : le shell des tests est en mode visiteur, sans session.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const mapsRegion = (page: Page) => page.getByRole('region', { name: /Performance par carte/ })
const tiles = (page: Page) => mapsRegion(page).getByRole('article')
const tileTitles = async (page: Page) => (await tiles(page).locator('h3').allTextContents()).map((text) => text.trim())

async function openClanMaps(page: Page) {
  await page.goto(`/clans/${CLAN_ID}/stats/maps`)
  await expect(page.getByRole('heading', { level: 1, name: 'Les cartes du clan' })).toBeVisible()
  await expect(tiles(page)).toHaveCount(5)
}

test.describe('cartes du clan', () => {
  test.beforeEach(async ({ api, page }) => {
    mockClanMaps(api)
    await openClanMaps(page)
  })

  test('visiteur : mois et parties normales par défaut, une tuile par carte, la plus jouée d’abord', async ({ api, page }) => {
    expect(api.paramValues(`/api/clans/${CLAN_ID}/map-stats`, 'period')).toEqual(['month'])
    expect(api.paramValues(`/api/clans/${CLAN_ID}/map-stats`, 'matchType')).toEqual(['official'])

    expect(await tileTitles(page)).toEqual(['Erangel', 'Miramar', 'Taego', 'Sanhok', 'Rondo'])
    await expect(mapsRegion(page)).toContainText('[DEMO] Clan Démo · 91 parties · 5 cartes · ce mois, parties normales')
    await expect(mapsRegion(page)).toContainText('les 36 clans suivis')

    // Médailles sur les trois premières cartes comparables ; Rondo (4 parties) ferme la liste, sans écart.
    await expect(tiles(page).nth(0).getByRole('img', { name: /Rang 1/ })).toBeVisible()
    await expect(tiles(page).nth(2).getByRole('img', { name: /Rang 3/ })).toBeVisible()
    const rondo = tiles(page).nth(4)
    await expect(rondo).toContainText('Échantillon faible')
    await expect(rondo).toContainText('Moins de 10 parties')
    await expect(rondo).not.toContainText('clans')

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('écarts aux clans, tendance et joueur phare sur une tuile', async ({ page }) => {
    const erangel = page.getByRole('article', { name: 'Erangel', exact: true })
    await expect(erangel.locator('.app-stat-tile--active')).toHaveText(/40\s*Parties/)
    const top10 = erangel.locator('.app-stat-tile', { hasText: 'Top 10' })
    await expect(top10).toContainText('60 %')
    await expect(top10).toContainText('+10 pts clans')
    await expect(top10).toContainText('▲ 10 pts')
    // Place moyenne : plus bas est mieux, l'écart négatif est en vert.
    await expect(erangel.locator('.app-stat-tile', { hasText: 'Place moyenne' }).locator('.t-pos')).toHaveText('−1,2 clans')

    const star = erangel.getByRole('link', { name: /Joueur phare sur Erangel : Joueur Alpha/ })
    await expect(star).toHaveAttribute('href', `/members/${MEMBER_ID}/map-stats`)
    await expect(star).toContainText('4,81 kills / partie · 32 parties')
  })

  test('le verdict : carte forte, carte à travailler, carte la plus jouée', async ({ page }, testInfo) => {
    if (isMobile(testInfo)) {
      // Une carte à la fois, chevrons pour les suivantes (maquette, 1c).
      const pager = page.getByRole('navigation', { name: 'Verdict des cartes' })
      await expect(page.getByRole('article', { name: 'Carte forte : Taego' })).toBeVisible()
      await pager.getByRole('button', { name: 'Éléments suivants' }).click()
      await expect(page.getByRole('article', { name: 'Carte à travailler : Miramar' })).toBeVisible()
      return
    }
    const verdict = page.getByRole('region', { name: 'Le verdict' })
    await expect(verdict.getByRole('article', { name: 'Carte forte : Taego' })).toContainText('▲ 22 pts au-dessus de la moyenne des clans')
    const weakest = verdict.getByRole('article', { name: 'Carte à travailler : Miramar' })
    await expect(weakest).toContainText('30 %')
    await expect(weakest).toContainText('▼ 10 pts sous la moyenne des clans')
    await expect(weakest).toContainText('▼ En baisse de 10 pts sur la période précédente')
    await expect(verdict.getByRole('article', { name: 'Carte la plus jouée : Erangel' })).toContainText('44 % du total des parties')
  })

  test('trier par Top 10, puis inverser : la carte de faible échantillon reste en dernier', async ({ page }) => {
    await page.locator(`#clan-maps-sort-${CLAN_ID}`).click()
    await page.locator(`#clan-maps-sort-${CLAN_ID}-menu`).getByRole('menuitem', { name: 'Top 10', exact: true }).click()
    expect(await tileTitles(page)).toEqual(['Taego', 'Erangel', 'Sanhok', 'Miramar', 'Rondo'])
    await expect(tiles(page).first().locator('.app-stat-tile--active')).toHaveText(/Top 10/)

    await mapsRegion(page).getByRole('button', { name: 'Tri décroissant actif' }).click()
    expect(await tileTitles(page)).toEqual(['Miramar', 'Sanhok', 'Erangel', 'Taego', 'Rondo'])
  })

  test('type « Tournois » sans partie ce mois : état vide, puis tout l’historique', async ({ api, page }) => {
    await toolbar(page).getByRole('button', { name: 'Tournois', exact: true }).click()
    await expect(page.getByText('Aucune partie de tournoi ou custom pour [DEMO] ce mois')).toBeVisible()
    expect(api.paramValues(`/api/clans/${CLAN_ID}/map-stats`, 'matchType').at(-1)).toBe('custom')

    await page.getByRole('button', { name: /Voir tout l’historique/ }).click()
    await expect(tiles(page)).toHaveCount(2)
    await expect(periodFilter(page).getByRole('button', { name: 'Tous', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(mapsRegion(page)).toContainText('depuis le début, parties de tournoi ou custom')
    // « Tous » : pas de période précédente, donc aucune tendance.
    await expect(mapsRegion(page)).not.toContainText('période précédente')
  })
})

test('docké sur mobile : période et rappel du tri, puis le type de partie, sans rien couper', async ({ api, page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'bandeau compact : mobile seulement')
  mockClanMaps(api)
  await openClanMaps(page)
  await dock(page)
  await expect(toolbar(page)).toContainText('Parties ↓')
  const viewport = page.viewportSize()!.width
  for (const name of ['Mois', 'Tournois']) {
    const box = await toolbar(page).getByRole('button', { name, exact: true }).boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport)
  }
})

test('l’ancienne adresse « heatmap-kills » mène aux Cartes', async ({ api, page }) => {
  mockClanMaps(api)
  await page.goto(`/clans/${CLAN_ID}/stats/heatmap-kills`)
  await expect(page).toHaveURL(new RegExp(`/clans/${CLAN_ID}/stats/maps$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Les cartes du clan' })).toBeVisible()
})
