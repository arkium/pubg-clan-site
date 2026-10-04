import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID, DEBRIEF_MATCH_ID } from './support/data'
import { clickInPlace, dock, scrollToY, settle, toolbar } from './support/layout'
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
  // Place en Teko sur la photo, sur le nombre d'équipes du lobby.
  await expect(summary.getByLabel('Place 1 sur 26 équipes')).toHaveText('#1/26')
  await expect(summary).toContainText('Officiel')
  // Bots du lobby (comptes ai.… des statistiques par joueur) ; mode, type et bots à la même hauteur.
  await expect(summary).toContainText('2 bots')
  const heights = await summary
    .locator('.app-team-mode-badge, .app-npc-badge--lg, span.rounded-full:text-is("Officiel")')
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)))
  expect(heights).toHaveLength(3)
  expect(new Set(heights).size).toBe(1)
  await expect(summary).toContainText('27 min 12')
  await expect(summary.getByRole('list', { name: 'Escouade' })).toContainText('Coéquipier Kilo')
  await expect(summary).toContainText('dont coéquipiers : 1')
  // Nom à la couleur du style de jeu de la semaine (style de jeu du clan), avec sa légende — plus un vert muet.
  const alpha = summary.getByRole('list', { name: 'Escouade' }).getByRole('listitem').filter({ hasText: 'Joueur Alpha' })
  await expect(alpha).toHaveAttribute('title', /Fragger cette semaine/)
  await expect(summary).toContainText('Style de jeu de la semaine')
})

test('onglets dans le bandeau collant : docké, il porte le retour du fil d’Ariane (rien de docké sur mobile)', async ({ page }, testInfo) => {
  const bar = toolbar(page)
  await expect(bar.getByRole('tablist', { name: 'Débriefing' })).toBeVisible()
  const target = await page.getByRole('link', { name: 'Retour à Matchs' }).getAttribute('href')
  await expect(bar.getByTestId('toolbar-back')).toHaveCount(0) // au repos : le fil d'Ariane est juste au-dessus
  // Page courte avec les données figées : une fenêtre basse laisse de quoi défiler au-delà du seuil.
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 480 })
  await settle(page)
  if (isNarrow(testInfo)) {
    // Pas de période : rien de docké sous 640 px (docs/TODO/sticky.md §2).
    await scrollToY(page, 1200)
    await expect(bar).toHaveAttribute('data-docked', 'false')
    return
  }
  await dock(page, 40)
  const back = bar.getByRole('link', { name: 'Retour à Matchs' })
  await expect(back).toBeVisible()
  await expect(back).toHaveAttribute('href', target!)
  const [backHeight, railHeight] = await Promise.all([
    back.evaluate((el) => Math.round(el.getBoundingClientRect().height)),
    bar.getByRole('tablist').evaluate((el) => Math.round(el.getBoundingClientRect().height)),
  ])
  expect(backHeight).toBe(railHeight)
  // Les onglets restent utilisables docké.
  await clickInPlace(page, tab(page, /Escouade/))
  await expect(page).toHaveURL(/[?&]tab=squad/)
  await expect(tab(page, /Escouade/)).toHaveAttribute('aria-selected', 'true')
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
  // Escouade par défaut : le kill hors escouade (e4, un ours sur un bot) n'apparaît pas.
  await expect(timeline).not.toContainText('Ours')
  await timeline.getByRole('button', { name: 'Tout le match' }).filter({ visible: true }).click()
  // Bots et ours en badges, jamais leurs identifiants techniques (ai.…, monster.bear…).
  await expect(timeline.locator('.app-npc-badge--animal')).toHaveText('Ours')
  await expect(timeline.locator('.app-npc-badge--bot')).toHaveText('Bot')
  await expect(timeline).not.toContainText('ai.1042')
  await expect(timeline).not.toContainText('monster.bear')

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
  // WebKit signale comme erreurs les requêtes interrompues par un rechargement : on attend la fin du réseau.
  await page.waitForLoadState('networkidle')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Erangel' })).toBeVisible()
  // Le thème se pose avec le shell (après lecture de la session) : on attend la couleur au lieu de la lire une fois.
  const panel = page.getByRole('region', { name: 'Chronologie du match' }).locator('.app-panel').last()
  await expect.poll(() => panel.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)')
})
