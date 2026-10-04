import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { MORTAR_FINISH_PATH, MORTAR_PREVIOUS_BEST, mockMortar, mortarTargets } from './support/mortar'
import { mockMemberSession } from './support/session'
import {
  MORTAR_DEFAULT_SETTING,
  MORTAR_RANGE,
  MORTAR_TARGETS_PER_SERIES,
  clampSetting,
  formatMeters,
  requiredSetting,
  scoreMortarSeries,
  shotError,
  type MortarDifficulty,
} from '../src/lib/mortar/mortar-game'

/**
 * Mortier — entraînement et guide (docs/features/mortier.md ; maquette « Mortier : entraînement et guide »). Graine
 * fixe : les cibles sont connues d'avance (`mortarTargets`), le test règle la distance au clavier, aux boutons ±25 ou
 * directement sur le curseur, puis vérifie verdict, bilan, corps de la fin de série et classement du clan.
 */

const slider = (page: Page) => page.getByRole('slider', { name: 'Distance' })
const difficulty = (page: Page) => page.getByRole('group', { name: 'Difficulté' })
const board = (page: Page) => page.getByRole('region', { name: 'Artilleurs du clan' })
const boardRows = (page: Page) => board(page).getByTestId('mortar-board-row')
const dots = (page: Page) => page.getByTestId('mortar-game').locator('li[data-state]')

async function openTraining(page: Page, path = '/mortier') {
  await page.goto(path)
  // Le shell remonte la page quand la session arrive : un clic fait avant serait perdu.
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('mortar-map')).toBeVisible()
}

/** Règle le curseur et tire ; renvoie le réglage effectivement tiré. */
async function shoot(page: Page, setting: number) {
  const value = clampSetting(setting)
  await slider(page).fill(String(value))
  await expect(page.getByTestId('mortar-setting')).toHaveText(formatMeters(value))
  await page.getByRole('button', { name: 'Tirer' }).click()
  await expect(page.getByTestId('mortar-result')).toBeVisible()
  return value
}

/** Écarts visés pour une série complète (réglage idéal + écart, borné à la portée). */
const SERIES_OFFSETS = [0, 4, -6, 12, -20, 3, 0, 8, -9, 30]

async function playSeries(page: Page, level: MortarDifficulty) {
  const targets = mortarTargets(level)
  const settings: number[] = []
  for (let index = 0; index < MORTAR_TARGETS_PER_SERIES; index += 1) {
    if (index > 0) await page.getByRole('button', { name: 'Cible suivante' }).click()
    await expect(page.getByTestId('mortar-series-count')).toHaveText(`${index + 1} / ${MORTAR_TARGETS_PER_SERIES}`)
    settings.push(await shoot(page, Math.round(requiredSetting(targets[index])) + SERIES_OFFSETS[index]))
  }
  return { targets, settings }
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scrollers: [...document.querySelectorAll('.app-main-flush *')]
      .filter((element) => ['auto', 'scroll'].includes(getComputedStyle(element).overflowX) && element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.className.toString().slice(0, 80)),
  }))
}

const isDesktopNav = (testInfo: TestInfo) => testInfo.project.name === 'chromium-desktop'

test.describe('page et onglets', () => {
  test('bandeau, onglets dans l’URL, guide ouvert directement sans série demandée', async ({ api, page }) => {
    const mortar = mockMortar(api)
    await page.goto('/mortier?tab=guide')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { level: 1, name: 'Mortier' })).toBeVisible()
    await expect(page.getByText('Mesure à la grille, règle la distance, tire. 10 cibles par série.')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Guide' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('mortar-guide-card')).toHaveCount(4)
    // L'entraînement n'est pas monté : aucune série demandée, aucun classement lu.
    expect(mortar.starts).toEqual([])

    await page.getByRole('tab', { name: 'Entraînement' }).click()
    await expect(page).toHaveURL(/\/mortier$/)
    await expect(page.getByTestId('mortar-map')).toBeVisible()
    await expect.poll(() => mortar.starts.length).toBe(1)

    // Retour au guide : l'URL le garde, un rechargement aussi ; la série en cours (un tir fait) n'est pas relancée.
    await shoot(page, mortarTargets('medium')[0].distance)
    await page.getByRole('tab', { name: 'Guide' }).click()
    await expect(page).toHaveURL(/\?tab=guide$/)
    await expect(page.getByTestId('mortar-game')).toBeHidden()
    await page.getByRole('tab', { name: 'Entraînement' }).click()
    await expect(page.getByTestId('mortar-result')).toBeVisible()
    await expect(dots(page).first()).toHaveAttribute('data-state', 'hit')
    expect(mortar.starts).toHaveLength(1)
    await page.getByRole('tab', { name: 'Entraînement' }).press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Guide' })).toBeFocused()
    await expect(page).toHaveURL(/\?tab=guide$/)
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Guide' })).toHaveAttribute('aria-selected', 'true')
  })

  test('lien « Mortier » juste sous « Tournois », actif sur /mortier', async ({ api, page }, testInfo) => {
    mockMortar(api)
    await openTraining(page)
    let nav = page.locator('aside').first().locator('nav')
    if (!isDesktopNav(testInfo)) {
      await page.getByRole('button', { name: 'Ouvrir la navigation' }).click()
      nav = page.locator('#mobile-clan-nav nav')
    }
    const names = await nav.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('title')))
    expect(names.indexOf('Mortier')).toBe(names.indexOf('Tournois') + 1)
    const link = nav.getByRole('link', { name: 'Mortier' })
    await expect(link).toHaveAttribute('href', '/mortier')
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(link.locator('svg')).toHaveCount(1)
  })
})

test.describe('entraînement', () => {
  test('un tir trop court réglé au clavier : verdict, ligne, impact et valeurs', async ({ api, page }) => {
    mockMortar(api)
    await openTraining(page)
    const target = mortarTargets('medium')[0]
    const offset = target.distance - 30 >= MORTAR_RANGE.min ? -30 : 30
    const wanted = target.distance + offset

    await expect(page.getByTestId('mortar-tolerance')).toHaveText('Au but à ±10 m')
    await expect(page.getByTestId('mortar-setting')).toHaveText(formatMeters(MORTAR_DEFAULT_SETTING))
    await expect(page.getByTestId('mortar-map').locator('[data-marker-label="shooter"]')).toHaveText('Toi')
    await expect(page.getByTestId('mortar-map').locator('[data-marker-label="target"]')).toHaveText('Cible')
    await expect(dots(page).first()).toHaveAttribute('data-state', 'current')

    // Boutons ±25 : aller-retour.
    await page.getByRole('button', { name: '+25' }).click()
    await expect(page.getByTestId('mortar-setting')).toHaveText(formatMeters(MORTAR_DEFAULT_SETTING + 25))
    await page.getByRole('button', { name: '−25' }).click()
    await expect(page.getByTestId('mortar-setting')).toHaveText(formatMeters(MORTAR_DEFAULT_SETTING))

    // Clavier : Maj + flèche = 25 m, flèche = 1 m, Entrée = tirer.
    const delta = wanted - MORTAR_DEFAULT_SETTING
    const coarse = Math.trunc(delta / 25)
    const fine = delta - coarse * 25
    await slider(page).focus()
    for (let step = 0; step < Math.abs(coarse); step += 1) await page.keyboard.press(coarse > 0 ? 'Shift+ArrowRight' : 'Shift+ArrowLeft')
    for (let step = 0; step < Math.abs(fine); step += 1) await page.keyboard.press(fine > 0 ? 'ArrowRight' : 'ArrowLeft')
    await expect(page.getByTestId('mortar-setting')).toHaveText(formatMeters(wanted))
    await page.keyboard.press('Enter')

    const result = page.getByTestId('mortar-result')
    await expect(result).toHaveAttribute('data-verdict', offset < 0 ? 'short' : 'long')
    await expect(page.getByTestId('mortar-verdict')).toHaveText(`${offset < 0 ? 'Trop court' : 'Trop long'} de 30 m`)
    await expect(page.getByTestId('mortar-shot-setting')).toHaveText(formatMeters(wanted))
    await expect(page.getByTestId('mortar-shot-distance')).toHaveText(formatMeters(target.distance))
    await expect(page.getByTestId('mortar-shot-error')).toHaveText(formatMeters(offset, { signed: true }))
    // Carte : trajectoire, distance réelle sur la ligne, impact.
    const map = page.getByTestId('mortar-map')
    await expect(map.locator('[data-line="shot"]')).toHaveCount(1)
    await expect(map.getByText(formatMeters(target.distance), { exact: true })).toBeVisible()
    await expect(map.locator('[data-marker="impact-miss"]')).toHaveCount(1)
    await expect(map.locator('[data-marker-label="impact-miss"]')).toHaveText('Impact')
    await expect(dots(page).first()).toHaveAttribute('data-state', 'miss')
    // Le curseur a disparu avec le réglage : « Cible suivante » prend le focus.
    await expect(page.getByRole('button', { name: 'Cible suivante' })).toBeFocused()
  })

  test('« Cible suivante » : cible 2, réglage remis à 300 m, curseur prêt', async ({ api, page }) => {
    mockMortar(api)
    await openTraining(page)
    const target = mortarTargets('medium')[0]
    await shoot(page, Math.round(target.distance))
    await expect(page.getByTestId('mortar-verdict')).toHaveText('Au but')
    await expect(page.getByTestId('mortar-map').locator('[data-marker="impact-hit"]')).toHaveCount(1)

    await page.getByRole('button', { name: 'Cible suivante' }).press('Enter')
    await expect(page.getByTestId('mortar-series-count')).toHaveText('2 / 10')
    await expect(page.getByTestId('mortar-setting')).toHaveText(formatMeters(MORTAR_DEFAULT_SETTING))
    await expect(slider(page)).toBeFocused()
    await expect(dots(page).nth(0)).toHaveAttribute('data-state', 'hit')
    await expect(dots(page).nth(1)).toHaveAttribute('data-state', 'current')
    await expect(page.getByTestId('mortar-map').locator('[data-line="shot"]')).toHaveCount(0)
  })

  test('série complète enregistrée : bilan, record, corps de la fin de série, classement rechargé, Rejouer', async ({ api, page }) => {
    mockMemberSession(api)
    const mortar = mockMortar(api)
    await openTraining(page)
    await expect(boardRows(page).first()).toBeVisible()
    const boardCalls = () => api.paramValues('/api/mortar/leaderboard', 'difficulty').length
    const callsBefore = boardCalls()

    const { targets, settings } = await playSeries(page, 'medium')
    await expect(page.getByRole('button', { name: 'Cible suivante' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Voir le bilan' }).click()

    // Corps de la fin de série : les dix réglages, des temps entiers et plausibles.
    await expect.poll(() => mortar.finishes.length).toBe(1)
    const body = mortar.finishes[0]
    expect(body.shots.map((shot) => shot.setting)).toEqual(settings)
    for (const shot of body.shots) {
      expect(Number.isInteger(shot.timeMs)).toBe(true)
      expect(shot.timeMs).toBeGreaterThanOrEqual(300)
    }

    const expected = scoreMortarSeries(targets, body.shots, 'medium')
    const summary = page.getByTestId('mortar-summary')
    await expect(summary.getByRole('heading', { name: 'Série terminée' })).toBeVisible()
    await expect(page.getByTestId('mortar-record-stamp')).toHaveText('Nouveau record')
    await expect(summary).toContainText('Moyen · série 3')
    await expect(summary).toContainText(formatMeters(expected.meanError, { decimals: true }))
    await expect(summary).toContainText(`${expected.hits} / 10`)
    await expect(summary).toContainText('à ±10 m')
    const record = page.getByTestId('mortar-record-kpi')
    await expect(record).toContainText(formatMeters(expected.meanError, { decimals: true }))
    await expect(record).toContainText(`ancien : ${formatMeters(MORTAR_PREVIOUS_BEST, { decimals: true })}`)
    await expect(record.locator('.t-gold')).toHaveCount(1)
    await expect(page.getByTestId('mortar-login-hint')).toHaveCount(0)

    // Les dix tirs : verdict et écart signé.
    const rows = page.getByTestId('mortar-shot-row')
    await expect(rows).toHaveCount(10)
    const last = shotError(settings[9], targets[9])
    await expect(rows.nth(9)).toContainText(formatMeters(last, { signed: true }))
    await expect(rows.nth(0)).toHaveAttribute('data-verdict', 'hit')
    await expect(dots(page)).toHaveCount(10)
    await expect(page.getByTestId('mortar-series-count')).toHaveText('10 / 10')

    // Classement relu après la série enregistrée.
    await expect.poll(boardCalls).toBeGreaterThan(callsBefore)

    await expect(page.getByRole('button', { name: 'Rejouer' })).toBeFocused()
    await page.getByRole('button', { name: 'Rejouer' }).click()
    await expect.poll(() => mortar.starts.length).toBe(2)
    await expect(page.getByTestId('mortar-map')).toBeVisible()
    await expect(page.getByTestId('mortar-series-count')).toHaveText('1 / 10')
    expect(api.served.filter((call) => call.url.pathname === MORTAR_FINISH_PATH)).toHaveLength(1)
  })

  test('visiteur : série jouée sans enregistrement, aucune fin de série envoyée, invitation à se connecter', async ({ api, page }) => {
    const mortar = mockMortar(api, { recorded: false })
    await openTraining(page)
    const { targets, settings } = await playSeries(page, 'medium')
    await page.getByRole('button', { name: 'Voir le bilan' }).click()

    const summary = page.getByTestId('mortar-summary')
    await expect(summary).toContainText('Moyen · série non enregistrée')
    const local = scoreMortarSeries(targets, settings.map((setting) => ({ setting, timeMs: 300 })), 'medium')
    await expect(summary).toContainText(formatMeters(local.meanError, { decimals: true }))
    await expect(page.getByTestId('mortar-record-stamp')).toHaveCount(0)
    await expect(page.getByTestId('mortar-record-kpi')).toHaveCount(0)
    const login = page.getByTestId('mortar-login-hint')
    await expect(login).toContainText('Connecte-toi pour enregistrer tes séries et entrer au classement')
    await expect(login.getByRole('link', { name: 'Connecte-toi' })).toHaveAttribute('href', '/login?redirect=/mortier')
    expect(mortar.finishes).toEqual([])
    expect(api.served.some((call) => call.url.pathname === MORTAR_FINISH_PATH)).toBe(false)
  })

  test('changement de difficulté en cours de série : nouvelle série, classement rechargé, dénivelé en Difficile', async ({ api, page }) => {
    const mortar = mockMortar(api)
    await openTraining(page)
    await shoot(page, mortarTargets('medium')[0].distance)
    await page.getByRole('button', { name: 'Cible suivante' }).click()
    await expect(page.getByTestId('mortar-series-count')).toHaveText('2 / 10')

    await difficulty(page).getByRole('button', { name: 'Difficile' }).click()
    await expect(difficulty(page).getByRole('button', { name: 'Difficile' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => mortar.starts.map((start) => start.difficulty)).toEqual(['medium', 'hard'])
    await expect.poll(() => api.paramValues('/api/mortar/leaderboard', 'difficulty').at(-1)).toBe('hard')
    await expect(page.getByTestId('mortar-series-count')).toHaveText('1 / 10')
    await expect(page.getByTestId('mortar-tolerance')).toHaveText('Au but à ±5 m')
    await expect(board(page)).toContainText('Difficile · écart moyen, le plus bas en tête')

    const target = mortarTargets('hard')[0]
    const height = `${Math.abs(target.elevation)} m plus ${target.elevation > 0 ? 'haute' : 'basse'}`
    await expect(page.getByTestId('mortar-elevation')).toHaveText(`Cible ${height}`)
    await expect(page.getByTestId('mortar-map').locator('[data-marker-label="target"]')).toHaveText(
      `Cible ${formatMeters(target.elevation, { signed: true })}`
    )
    // Tir à la distance à plat : raté du demi-dénivelé, et la page donne le bon réglage.
    await shoot(page, target.distance)
    await expect(page.getByTestId('mortar-shot-error')).toHaveText(formatMeters(shotError(target.distance, target), { signed: true }))
    await expect(page.getByTestId('mortar-shot-ideal')).toHaveText(
      `Dénivelé ${formatMeters(target.elevation, { signed: true })} : il fallait ${formatMeters(requiredSetting(target))}`
    )
  })
})

test.describe('classement du clan', () => {
  test('ligne « Toi » ajoutée hors des dix premiers, médailles, lecteur dans le classement, classement vide', async ({ api, page }) => {
    mockMemberSession(api)
    mockMortar(api)
    await openTraining(page)

    await expect(board(page)).toContainText('Moyen · écart moyen, le plus bas en tête')
    await expect(boardRows(page)).toHaveCount(11)
    await expect(boardRows(page).first().getByRole('img', { name: 'Rang 1, médaille d’or' })).toBeVisible()
    await expect(boardRows(page).nth(2).getByRole('img', { name: 'Rang 3, médaille de bronze' })).toBeVisible()
    await expect(boardRows(page).first()).toContainText('7,9 m')
    const viewer = boardRows(page).last()
    await expect(viewer).toHaveAttribute('aria-current', 'true')
    await expect(viewer).toContainText('Toi')
    await expect(viewer).toContainText('Joueur Alpha')
    await expect(viewer).toContainText('12')
    await expect(board(page).locator('[aria-current="true"]')).toHaveCount(1)

    await difficulty(page).getByRole('button', { name: 'Facile' }).click()
    await expect(board(page)).toContainText('Facile · écart moyen, le plus bas en tête')
    await expect(boardRows(page)).toHaveCount(4)
    await expect(boardRows(page).nth(1)).toHaveAttribute('aria-current', 'true')
    await expect(boardRows(page).nth(1)).toContainText('41 séries')
    await expect(boardRows(page).nth(1).getByRole('img', { name: 'Rang 2, médaille d’argent' })).toBeVisible()

    await difficulty(page).getByRole('button', { name: 'Difficile' }).click()
    await expect(board(page)).toContainText('Personne n’a encore terminé de série en Difficile — sois le premier')
    await expect(boardRows(page)).toHaveCount(0)
  })
})

test.describe('guide', () => {
  test('fiches, table de la grille (361 surligné, hors portée grisé), « S’entraîner → » règle la difficulté', async ({ api, page }) => {
    const mortar = mockMortar(api)
    await page.goto('/mortier?tab=guide')
    await page.waitForLoadState('networkidle')

    const cards = page.getByTestId('mortar-guide-card')
    await expect(cards).toHaveCount(4)
    for (const [index, title] of ['Les bases', 'Mesurer à la grille', 'Corriger le tir', 'Jouer en équipe'].entries()) {
      await expect(cards.nth(index).getByRole('heading', { level: 2 })).toHaveText(title)
    }
    await expect(cards.nth(0)).toContainText('Hachuré : trop près, le mortier refuse de tirer.')
    const table = page.getByTestId('mortar-grid-table')
    await expect(table.locator('[data-example]')).toHaveText('361')
    await expect(table.locator('[data-in-range="false"]')).toContainText(['100', '707'])
    await expect(page.getByTestId('mortar-guide-grid-map')).toContainText('3 carrés')
    await expect(page.getByTestId('mortar-guide-grid-map')).toContainText('361 m')
    await expect(cards.nth(2)).toContainText('Tir 3')
    await expect(cards.nth(3)).toContainText('« +25 »')

    // 01 → Facile.
    await cards.nth(0).getByRole('button', { name: /S.entraîner/ }).click()
    await expect(page.getByRole('tab', { name: 'Entraînement' })).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/\/mortier$/)
    await expect(difficulty(page).getByRole('button', { name: 'Facile' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => mortar.starts.map((start) => start.difficulty)).toEqual(['easy'])

    // 03 → Difficile : nouvelle série.
    await page.getByRole('tab', { name: 'Guide' }).click()
    await cards.nth(2).getByRole('button', { name: /S.entraîner/ }).click()
    await expect(difficulty(page).getByRole('button', { name: 'Difficile' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => mortar.starts.map((start) => start.difficulty)).toEqual(['easy', 'hard'])
    await expect(page.getByTestId('mortar-elevation')).toBeVisible()
  })
})

test('aucun défilement horizontal : réglage, verdict, bilan et guide', async ({ api, page }) => {
  mockMemberSession(api)
  mockMortar(api)
  await openTraining(page)
  expect(await horizontalOverflow(page)).toEqual({ page: 0, scrollers: [] })
  await playSeries(page, 'medium')
  expect(await horizontalOverflow(page)).toEqual({ page: 0, scrollers: [] })
  await page.getByRole('button', { name: 'Voir le bilan' }).click()
  await expect(page.getByTestId('mortar-summary')).toBeVisible()
  expect(await horizontalOverflow(page)).toEqual({ page: 0, scrollers: [] })
  await page.getByRole('tab', { name: 'Guide' }).click()
  await expect(page.getByTestId('mortar-guide-card')).toHaveCount(4)
  expect(await horizontalOverflow(page)).toEqual({ page: 0, scrollers: [] })
})
