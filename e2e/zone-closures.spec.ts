import type { TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID, PLAYERS } from './support/data'
import { appHeader, clickInPlace, dock, toolbar } from './support/layout'
import { mockClanZoneClosures } from './support/zone-closures'

/**
 * Fin de zone — charte UI (« Pages à carte », 04/10/2026) et lecture « joueur » : bandeau carte ‹ › / période / joueur
 * sur une ligne comme les zones de drop, la cible et son verdict, trois titres, phase par phase, top 5 des secteurs,
 * « Qui joue le cercle » (toucher un joueur filtre la carte). Aucun défilement horizontal.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

test.beforeEach(async ({ api, page }) => {
  mockClanZoneClosures(api)
  await page.goto(`/clans/${CLAN_ID}/stats/zone-closures`)
  await expect(page.getByRole('heading', { level: 1, name: 'Fin de zone' })).toBeVisible()
  await expect(page.getByTestId('zone-target')).toBeVisible()
})

test('la cible : parts centre / bord / dehors, distance moyenne et verdict', async ({ page }) => {
  await expect(page.getByTestId('zone-target')).toHaveAttribute('aria-label', 'Centre 20 %, bord intérieur 57 %, dehors 23 %')
  await expect(page.getByText('104 % du rayon')).toBeVisible()
  // 23 % dehors, 20 % au centre, 57 % au bord : surfeurs de bord.
  await expect(page.getByTestId('zone-verdict')).toContainText('Surfeurs de bord')
})

test('trois titres parmi les joueurs d’au moins dix fermetures', async ({ page }) => {
  const titles = page.getByRole('region', { name: 'Titres de la zone' })
  await expect(titles.getByRole('article', { name: 'Roi du cercle' })).toContainText(PLAYERS[1].displayName)
  await expect(titles.getByRole('article', { name: 'Roi du cercle' })).toContainText('74 % du rayon')
  await expect(titles.getByRole('article', { name: 'Increvable' })).toContainText(PLAYERS[0].displayName)
  await expect(titles.getByRole('article', { name: 'Coureur de zone bleue' })).toContainText(PLAYERS[2].displayName)
})

test('qui joue le cercle : classés du plus central, profils, petit échantillon en dernier ; toucher filtre', async ({ api, page }, testInfo) => {
  const list = page.getByRole('list', { name: 'Joueurs, du plus central au plus excentré' })
  const rows = list.getByRole('button')
  await expect(rows).toHaveCount(isMobile(testInfo) ? 5 : 8)
  await expect(rows.nth(0)).toContainText(PLAYERS[1].displayName)
  await expect(rows.nth(0)).toContainText('Joue le centre')
  await expect(rows.nth(2)).toContainText('Court après la zone')
  await expect(rows.nth(3)).toContainText('trop peu de fermetures')

  await rows.nth(2).click()
  await expect(rows.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/telemetry/zone-closures`, 'memberId')).toContain(String(PLAYERS[2].memberId))
  await expect(toolbar(page).getByRole('button', { name: /Joueur/ })).toContainText(PLAYERS[2].displayName)
  await expect(page.getByTestId('zone-verdict')).toContainText('La zone vous colle aux talons')
})

test('qui joue le cercle : paginé par chevrons comme « Qui saute où », rangs continus', async ({ page }, testInfo) => {
  const list = page.getByRole('list', { name: 'Joueurs, du plus central au plus excentré' })
  const pager = page.getByRole('navigation', { name: 'Pages des joueurs' })
  await expect(pager).toContainText('1/2')
  await expect(pager.getByRole('button', { name: 'Joueurs précédents' })).toBeDisabled()
  await pager.getByRole('button', { name: 'Joueurs suivants' }).click()
  await expect(pager).toContainText('2/2')
  await expect(list.getByRole('button')).toHaveCount(isMobile(testInfo) ? 5 : 2)
  await expect(list).toContainText(PLAYERS[9].displayName)
  await expect(list).not.toContainText(PLAYERS[1].displayName)

  // Un joueur choisi par la pastille du bandeau amène sa page.
  await clickInPlace(page, toolbar(page).getByRole('button', { name: /Joueur/ }))
  await page.getByRole('menuitemradio', { name: new RegExp(PLAYERS[1].displayName) }).click()
  await expect(pager).toContainText('1/2')
  await expect(list.getByRole('button', { name: new RegExp(PLAYERS[1].displayName) })).toHaveAttribute('aria-pressed', 'true')
})

test('phase par phase et top 5 des secteurs', async ({ page }) => {
  await expect(page.getByRole('listitem', { name: /^Phase 5 : 55 observations/ })).toContainText('33 % dehors')
  await expect(page.getByRole('list', { name: 'Top 5 des secteurs d’arrivée' })).toContainText('Pochinki')
})

test('carte ‹ › : change de carte, phase du cercle dans l’API', async ({ api, page }) => {
  await expect(toolbar(page).getByTestId('active-map')).toHaveText('Erangel')
  await toolbar(page).getByRole('button', { name: 'Carte suivante' }).click()
  await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/telemetry/zone-closures`, 'map')).toContain('Desert_Main')
  await page.getByRole('group', { name: 'Phase du cercle' }).getByRole('button', { name: /Fin/ }).click()
  await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/telemetry/zone-closures`, 'phase')).toContain('late')
})

test('aucun défilement horizontal ; docké, carte, période et joueur restent sur une ligne', async ({ page }, testInfo) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.waitForLoadState('networkidle')
  await expect(appHeader(page)).toBeVisible()
  await dock(page)
  await expect(toolbar(page).getByRole('group', { name: 'Carte' })).toBeVisible()
  await expect(toolbar(page).getByRole('button', { name: /Joueur/ })).toBeVisible()
  const height = (await toolbar(page).boundingBox())?.height ?? 0
  expect(height).toBeLessThan(isMobile(testInfo) ? 80 : 90)
  await clickInPlace(page, toolbar(page).getByRole('button', { name: 'Carte suivante' }))
  await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
})
