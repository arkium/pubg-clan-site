import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { appHeader, clickInPlace, dock, toolbar } from './support/layout'
import { mockMemberSession } from './support/session'
import { ZONE_PREVIOUS_BEST, mockZoneReading, zoneReadingAnalysis, zoneSeriesRounds } from './support/zone-reading'
import {
  bandHeadline,
  closingVerdict,
  entriesNearAxis,
  practicalRule,
} from '../src/lib/zone-reading/zone-reading-analysis'
import {
  ROUND_VERDICT_LABELS,
  ZONE_READING_ROUNDS,
  ZONE_READING_STEPS,
  formatDistance,
  scoreZoneReadingRound,
  scoreZoneReadingSeries,
} from '../src/lib/zone-reading/zone-reading-game'
import {
  axisHeading,
  cardinalOfHeading,
  rotateAxis,
  towardsCardinal,
  type Axis,
  type Point,
} from '../src/lib/zone-reading/zone-reading-geometry'

/**
 * Lecture de zone — analyse et entraînement (docs/features/lecture-de-zone.md ; maquette « Lecture de zone - A faire »
 * recadrée sur les données réelles). Toutes les API sont simulées ; l'analyse attendue est recalculée avec les
 * fonctions du site, l'entraînement se joue au clavier pour connaître chaque position envoyée.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const isDesktopNav = (testInfo: TestInfo) => testInfo.project.name === 'chromium-desktop'
const analysisOf = (query = '') => zoneReadingAnalysis(new URL(`http://localhost/api/zone-reading${query}`))
const axisText = (axis: Axis) => {
  const heading = axisHeading(axis)
  return `Axe ${heading}° · ${towardsCardinal(cardinalOfHeading(heading))}`
}

async function openAnalysis(page: Page, path = '/lecture-de-zone') {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: 'Lecture de zone' })).toBeVisible()
  await expect(page.getByTestId('zone-reading-headline')).toBeVisible()
}

async function openTraining(page: Page) {
  await page.goto('/lecture-de-zone?tab=training')
  // Le shell remonte la page quand la session arrive : une touche pressée avant serait perdue.
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('zone-game-map')).toBeVisible()
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

test.describe('analyse', () => {
  test('titres et chiffres calculés : bande, premier cercle, sens de fermeture, règle pratique', async ({ api, page }, testInfo) => {
    mockZoneReading(api)
    await openAnalysis(page)
    const payload = analysisOf()
    const stats = payload.stats!

    await expect(page.getByTestId('zone-reading-headline')).toHaveText(bandHeadline(stats))
    await expect(page.getByTestId('figure-final-line')).toContainText(formatDistance(stats.finalLineMedian))
    await expect(page.getByTestId('figure-first-center')).toContainText(formatDistance(stats.firstCenterLineMedian))
    await expect(page.getByTestId('figure-crosses-first')).toContainText(`${Math.round(stats.crossesFirstShare * 100)} %`)
    await expect(page.getByTestId('zone-reading-closing-verdict')).toHaveText(closingVerdict(stats))
    await expect(page.getByTestId('closing-bar')).toHaveCount(stats.closing.filter((bar) => bar.total > 0).length)
    await expect(page.getByTestId('zone-reading-rule')).toHaveText(practicalRule(stats.rule.filter((row) => row.total > 0)))
    await expect(page.getByTestId('rule-row')).toHaveCount(4)
    await expect(page.getByTestId('top-cell')).toHaveCount(3)
    await expect(page.getByTestId('zone-reading-hazard')).toHaveText(
      'La zone garde une part de hasard : ces chiffres donnent des probabilités, pas des certitudes.'
    )
    // Bureau : dans le bandeau ; tablette et mobile : sous les onglets.
    const summary = page.getByTestId(isDesktopNav(testInfo) ? 'zone-reading-summary' : 'zone-reading-summary-mobile')
    await expect(summary).toHaveText('Calculé sur 360 parties depuis le 4 juillet 2026')
  })

  test('axe du C-130 : tourner et décaler change la ligne, les parties proches et la grille « Selon l’axe »', async ({ api, page }) => {
    mockZoneReading(api)
    await openAnalysis(page)
    const payload = analysisOf()
    const axis = payload.defaultAxis!
    const plane = page.getByRole('region', { name: 'L’avion et la zone' })

    await expect(plane.getByTestId('axis-label')).toHaveText(axisText(axis))
    await expect(plane.getByTestId('axis-count')).toContainText(`${entriesNearAxis(payload.axes, axis, payload.mapSizeMeters).length} partie`)

    await plane.getByRole('button', { name: 'Tourner l’avion de 15° vers la droite' }).click()
    const rotated = rotateAxis(axis, 15)
    await expect(plane.getByTestId('axis-label')).toHaveText(axisText(rotated))
    await expect(plane.getByTestId('axis-count')).toContainText(`${entriesNearAxis(payload.axes, rotated, payload.mapSizeMeters).length} partie`)

    // Le bloc 04 suit le même axe : « Selon l'axe » affiche ses commandes et filtre la grille.
    const grid = page.getByRole('region', { name: 'Où finit la zone' })
    await grid.getByRole('button', { name: 'Selon l’axe' }).click()
    await expect(grid.getByTestId('axis-label')).toHaveText(axisText(rotated))
    await grid.getByRole('button', { name: 'Tourner l’avion de 15° vers la gauche' }).click()
    await expect(plane.getByTestId('axis-label')).toHaveText(axisText(axis))
    await grid.getByRole('button', { name: 'Toutes les parties' }).click()
    await expect(grid.getByTestId('axis-label')).toHaveCount(0)
  })

  test('carte ‹ ›, mode et période dans la requête ; « Tous » par défaut', async ({ api, page }, testInfo) => {
    mockZoneReading(api)
    await openAnalysis(page)
    expect(api.paramValues('/api/zone-reading', 'period')).toContain('all')

    await clickInPlace(page, toolbar(page).getByRole('button', { name: 'Carte suivante' }))
    await expect.poll(() => api.paramValues('/api/zone-reading', 'map')).toContain('Desert_Main')
    await expect(toolbar(page).getByTestId('active-map')).toHaveText('Miramar')

    // Mobile : le mode est un bouton qui passe au suivant, pour laisser sa place au nom de la carte.
    await clickInPlace(page, toolbar(page).getByRole('button', { name: isMobile(testInfo) ? /^Mode : Squad/ : 'Duo' }))
    await expect.poll(() => api.paramValues('/api/zone-reading', 'mode')).toContain('duo')

    await clickInPlace(page, toolbar(page).getByRole('button', { name: '30 j' }))
    await expect.poll(() => api.paramValues('/api/zone-reading', 'period')).toContain('days-30')
    await expect(page).toHaveURL(/period=days-30/)
  })

  test('trop peu de parties : compteur et raccourci vers la carte la plus jouée', async ({ api, page }) => {
    mockZoneReading(api)
    await openAnalysis(page, '/lecture-de-zone')
    // Erangel, Miramar, Haven : la carte précédente d'Erangel est Haven (les points font 6 px sur mobile).
    await clickInPlace(page, toolbar(page).getByRole('button', { name: 'Carte précédente' }))
    const notEnough = page.getByTestId('zone-reading-not-enough')
    await expect(notEnough).toBeVisible()
    await expect(notEnough).toContainText('Pas encore assez de parties sur Haven')
    await expect(notEnough).toContainText('40 / 300')
    await notEnough.getByRole('button', { name: 'Voir Erangel' }).click()
    await expect(page.getByTestId('zone-reading-headline')).toBeVisible()
    expect(api.paramValues('/api/zone-reading', 'map').at(-1)).toBe('Baltic_Main')
  })

  test('lien « Lecture de zone » juste sous « Carte des ressources », actif sur la page', async ({ api, page }, testInfo) => {
    mockZoneReading(api)
    await openAnalysis(page)
    let nav = page.locator('aside').first().locator('nav')
    if (!isDesktopNav(testInfo)) {
      await page.getByRole('button', { name: 'Ouvrir la navigation' }).click()
      nav = page.locator('#mobile-clan-nav nav')
    }
    const names = await nav.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('title')))
    expect(names.indexOf('Lecture de zone')).toBe(names.indexOf('Carte des ressources') + 1)
    const link = nav.getByRole('link', { name: 'Lecture de zone' })
    await expect(link).toHaveAttribute('href', '/lecture-de-zone')
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(link.locator('svg')).toHaveCount(1)
  })
})

test.describe('entraînement', () => {
  test('visiteur : marqueur posé au clic, cercles dévoilés un à un, zone finale, partie suivante sans avion', async ({ api, page }) => {
    const state = mockZoneReading(api)
    await openTraining(page)
    await expect(page.getByRole('tab', { name: 'Entraînement' })).toHaveAttribute('aria-selected', 'true')
    expect(state.starts[0]).toMatchObject({ map: 'Baltic_Main', mode: 'squad', period: 'all', clanId: 1 })

    await expect(page.getByTestId('zone-step-chip')).toHaveText('Cercle 1 / 4')
    await expect(page.getByTestId('zone-plane-chip')).toHaveText('Avec avion')
    const reveal = page.getByRole('button', { name: 'Dévoiler le cercle 2' })
    await expect(reveal).toBeDisabled()

    const map = page.getByTestId('zone-game-map')
    await map.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await map.click()
    await expect(map.getByText('Toi', { exact: true })).toBeVisible()
    await expect(reveal).toBeEnabled()

    for (let step = 2; step <= ZONE_READING_STEPS; step += 1) {
      await page.getByRole('button', { name: `Dévoiler le cercle ${step}` }).click()
      await expect(page.getByTestId('zone-step-chip')).toHaveText(`Cercle ${step} / 4`)
    }
    await page.getByRole('button', { name: 'Voir la zone finale' }).click()
    await expect(page.getByTestId('zone-reveal')).toBeVisible()
    await expect(page.getByTestId('zone-reveal-step')).toHaveCount(4)
    await expect(page.getByTestId('zone-reveal-verdict')).toHaveText(new RegExp(Object.values(ROUND_VERDICT_LABELS).join('|')))
    await expect(map.getByText('Zone finale', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Partie suivante' }).click()
    await expect(page.getByTestId('zone-series-count')).toHaveText('2 / 10')
    await expect(page.getByTestId('zone-plane-chip')).toHaveText('Sans avion')
    // Visiteur : tout se joue sur place, aucune étape envoyée.
    expect(state.guesses).toEqual([])
  })

  test('membre : quarante étapes envoyées dans l’ordre, écarts du serveur, bilan, record et classement rechargé', async ({ api, page }) => {
    test.slow()
    mockMemberSession(api)
    const state = mockZoneReading(api, { recorded: true })
    await openTraining(page)
    const rounds = zoneSeriesRounds()
    const size = 8192
    const delta = size * 0.01
    const results: Array<{ index: number; withPlane: boolean; you: number; center: number; line: number }> = []

    for (let roundIndex = 0; roundIndex < ZONE_READING_ROUNDS; roundIndex += 1) {
      await expect(page.getByTestId('zone-series-count')).toHaveText(`${roundIndex + 1} / 10`)
      const map = page.getByTestId('zone-game-map')
      await map.focus()
      // Flèche droite : le marqueur part du centre du cercle affiché, puis avance de 1 % de la carte à chaque étape.
      const guesses: Point[] = []
      for (let step = 1; step <= ZONE_READING_STEPS; step += 1) {
        await page.keyboard.press('ArrowRight')
        const from = guesses.at(-1) ?? rounds[roundIndex].circles[0]
        guesses.push({ x: Math.min(size, from.x + delta), y: from.y })
        await page.keyboard.press('Enter')
        if (step < ZONE_READING_STEPS) await expect(page.getByTestId('zone-step-chip')).toHaveText(`Cercle ${step + 1} / 4`)
      }
      const score = scoreZoneReadingRound(rounds[roundIndex], guesses)
      results.push({ index: roundIndex, withPlane: rounds[roundIndex].withPlane, you: score.you, center: score.center, line: score.line })
      await expect(page.getByTestId('zone-reveal-score')).toHaveText(`${formatDistance(score.you)} d’écart moyen`)
      await page.getByRole('button', { name: roundIndex === ZONE_READING_ROUNDS - 1 ? 'Voir le bilan' : 'Partie suivante' }).click()
    }

    expect(state.guesses).toHaveLength(40)
    expect(state.guesses.slice(0, 4).map((entry) => [entry.round, entry.step])).toEqual([[0, 1], [0, 2], [0, 3], [0, 4]])
    expect(state.guesses[0].x).toBeCloseTo(rounds[0].circles[0].x + delta, 3)

    const series = scoreZoneReadingSeries(results)
    const summary = page.getByTestId('zone-summary')
    await expect(summary).toBeVisible()
    await expect(page.getByTestId('zone-summary-mean')).toHaveText(formatDistance(series.meanError))
    await expect(page.getByTestId('zone-summary-center')).toHaveText(`${series.betterThanCenter} / 10`)
    await expect(page.getByTestId('zone-summary-with-plane')).toContainText('5 parties')
    await expect(page.getByTestId('zone-record-stamp')).toHaveCount(series.meanError < ZONE_PREVIOUS_BEST ? 1 : 0)
    await expect(summary).toContainText('série 4')
    await expect.poll(() => api.paramValues('/api/zone-reading/leaderboard', 'map').length).toBeGreaterThanOrEqual(2)
    await expect(page.getByRole('region', { name: 'Le clan' }).locator('[aria-current="true"]')).toContainText('Toi')

    await summary.getByRole('button', { name: 'Rejouer' }).click()
    await expect.poll(() => state.starts.length).toBe(2)
    await expect(page.getByTestId('zone-series-count')).toHaveText('1 / 10')
  })
})

test('aucun défilement horizontal ; bandeau docké sur une ligne', async ({ api, page }, testInfo) => {
  mockZoneReading(api)
  await openAnalysis(page)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)

  await page.waitForLoadState('networkidle')
  await expect(appHeader(page)).toBeVisible()
  await dock(page)
  const height = (await toolbar(page).boundingBox())?.height ?? 0
  expect(height).toBeLessThan(isMobile(testInfo) ? 80 : 90)
  await clickInPlace(page, toolbar(page).getByRole('button', { name: 'Carte suivante' }))
  await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
  // Le nom de la carte reste lisible dans le bandeau, même à 375 px.
  await expect(toolbar(page).getByTestId('active-map')).toHaveText('Miramar')
  const nameBox = await toolbar(page).getByTestId('active-map').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  expect(nameBox).toBe(true)

  await page.getByRole('tab', { name: 'Entraînement' }).click()
  await expect(page.getByTestId('zone-game-map')).toBeVisible()
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
})
