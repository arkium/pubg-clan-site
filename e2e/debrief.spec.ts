import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID, DEBRIEF_MATCH_ID } from './support/data'
import { mockMatchDebrief } from './support/pages'

/**
 * Débriefing tactique refondu — docs/features/debriefing.md (maquette Claude Design « Débrief télémétrie »).
 * Onglets accessibles et portés par `?tab=`, chronologie filtrable avec lien vers le replay, bande des équipes
 * paginée, cartes de joueur, duels avec score ; le thème clair s'applique vraiment.
 */

const PATH = `/clans/${CLAN_ID}/telemetry/matches/${DEBRIEF_MATCH_ID}/debrief`
const isNarrow = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const tab = (page: Page, name: RegExp) => page.getByRole('tablist', { name: 'Débriefing' }).getByRole('tab', { name })

test.beforeEach(async ({ api, page }) => {
  mockMatchDebrief(api)
  await page.goto(PATH)
  await expect(page.getByRole('heading', { level: 1, name: 'Erangel' })).toBeVisible()
})

test('en-tête : classement sur le lobby, type de partie, durée, escouade et indicateurs', async ({ page }) => {
  const summary = page.getByRole('region', { name: 'Résumé de la partie' })
  await expect(summary).toContainText('#1 / 26')
  await expect(summary).toContainText('Officiel')
  await expect(summary).toContainText('27 min 12')
  await expect(summary.getByRole('list', { name: 'Escouade' })).toContainText('Coéquipier Kilo')
  await expect(summary).toContainText('dont coéquipiers : 1')
})

test('l’onglet actif est dans l’URL, survit au rechargement et se pilote au clavier', async ({ page }) => {
  await expect(tab(page, /Chrono/)).toHaveAttribute('aria-selected', 'true')
  await tab(page, /Duels/).click()
  await expect(page).toHaveURL(/[?&]tab=duels/)
  await expect(tab(page, /Duels/)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Duels gagnés' })).toBeVisible()
  await expect(page.getByText('+1', { exact: true })).toBeVisible()

  await page.reload()
  await expect(tab(page, /Duels/)).toHaveAttribute('aria-selected', 'true')

  await tab(page, /Duels/).press('ArrowLeft')
  await expect(tab(page, /Escouade/)).toHaveAttribute('aria-selected', 'true')
  await expect(tab(page, /Escouade/)).toBeFocused()
  await expect(page).toHaveURL(/[?&]tab=squad/)
})

test('chronologie : filtres de portée et de type, détail d’un kill, lien vers le replay', async ({ page }, testInfo) => {
  const timeline = page.getByRole('region', { name: 'Chronologie du match' })
  // Escouade par défaut : le kill entre deux adversaires (e4) n'apparaît pas.
  await expect(timeline).not.toContainText('Rival Quatre')
  await timeline.getByRole('button', { name: 'Tout le match' }).filter({ visible: true }).click()
  await expect(timeline).toContainText('Rival Quatre')

  await timeline.getByRole('button', { name: /^Kills/ }).filter({ visible: true }).click()
  await expect(timeline).not.toContainText('revient en jeu')

  const kill = timeline.getByRole('button', { name: /Joueur Alpha.*Rival Un/ })
  await kill.click()
  await expect(kill).toHaveAttribute('aria-expanded', 'true')
  await expect(timeline).toContainText('Zone touchée')
  await expect(timeline).toContainText('Tête')
  if (!isNarrow(testInfo)) await expect(timeline).toContainText('M416')

  await timeline.getByRole('button', { name: 'Voir dans le replay →' }).click()
  await expect(page).toHaveURL(/[?&]tab=replay/)
  await expect(tab(page, /Replay/)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Replay indisponible pour ce match.')).toBeVisible()
})

test('bande des équipes : pagination, retour à l’escouade analysée, changement d’escouade', async ({ api, page }) => {
  const strip = page.getByText('Escouade analysée', { exact: true }).first().locator('xpath=../..')
  await expect(strip.getByRole('button', { pressed: true })).toContainText('[ALFA] Clan ALFA')
  await expect(strip.getByRole('button', { pressed: true })).toContainText(/Chicken dinner|Top 1/)

  await page.getByRole('button', { name: 'Équipes suivantes' }).filter({ visible: true }).click()
  await expect(strip.getByRole('button', { pressed: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Revenir à l’escouade analysée' }).click()
  await expect(strip.getByRole('button', { pressed: true })).toHaveCount(1)

  await strip.getByRole('button', { name: /\[T2\]/ }).click()
  await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/matches/${DEBRIEF_MATCH_ID}/telemetry`, 'teamId')).toContain('2')
  await expect(strip.getByRole('button', { pressed: true })).toContainText('[T2]')
})

test('escouade : cartes de joueur avec distances de l’API et lancers', async ({ page }) => {
  await tab(page, /Escouade/).click()
  const alpha = page.getByRole('article').filter({ hasText: 'Joueur Alpha' })
  await expect(alpha).toContainText('2,4 km à pied')
  await expect(alpha).toContainText('1 grenade · 2 fumigènes')
  await expect(alpha).toContainText('30 %')
  const mate = page.getByRole('article').filter({ hasText: 'Coéquipier Kilo' })
  await expect(mate).toContainText('non suivi')
  // Pas de distance pour un coéquipier non suivi (seule la télémétrie la donne, en centimètres).
  await expect(mate).not.toContainText('à pied')
  await expect(page.getByText('Arsenal de l’escouade')).toBeVisible()
})

test('le thème clair s’applique au débriefing (plus de bloc sombre)', async ({ page }) => {
  await page.evaluate(() => window.localStorage.setItem('pubg_app_theme', 'light'))
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Erangel' })).toBeVisible()
  const background = await page
    .getByRole('region', { name: 'Chronologie du match' })
    .locator('.app-panel')
    .last()
    .evaluate((node) => getComputedStyle(node).backgroundColor)
  expect(background).toBe('rgb(255, 255, 255)')
})
