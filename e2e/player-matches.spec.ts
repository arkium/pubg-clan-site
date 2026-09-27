import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { MEMBER_ID } from './support/data'
import { appHeader, dock, periodFilter, toolbar } from './support/layout'
import { mockPlayerMatches, sessionDaysAgo } from './support/player-matches'

/**
 * Carnet de vol d'un joueur — docs/features/matchs-joueur.md (maquette « Matchs joueur », 2026-09-27). Chiffres clés,
 * chronologie paginée (10, 5 sur mobile) au lieu d'un défilement, barre des modes, soirées paginées par 4 et leurs cartes
 * de fin de partie, période et mode dans le bandeau qui colle aussi sur mobile.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const matchesApi = `/api/members/${MEMBER_ID}/matches`

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

const chronology = (page: Page) => page.getByRole('region', { name: 'Chronologie' })
/** Chiffre clé (premier bloc de la page) : la carte qui porte ce libellé. */
const kpi = (page: Page, label: string) => page.locator('dl').first().locator('div').filter({ has: page.getByRole('term').filter({ hasText: label }) })
const sessions = (page: Page) => page.getByRole('region', { name: 'Soirées' })
const sessionButton = (page: Page, index: number) => sessions(page).getByRole('list', { name: 'Soirées' }).getByRole('listitem').nth(index).getByRole('button').first()

async function openMatches(page: Page, query = '') {
  await page.goto(`/members/${MEMBER_ID}/matches${query}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Carnet de vol de Joueur Alpha' })).toBeVisible()
  await expect(chronology(page)).toBeVisible()
}

test.describe('carnet de vol', () => {
  test.beforeEach(async ({ api, page }) => {
    mockPlayerMatches(api)
    await openMatches(page)
  })

  test('toute la période en un appel ; chiffres clés de la période', async ({ api, page }) => {
    expect(api.paramValues(matchesApi, 'limit').at(-1)).toBe('all')
    await expect(page.getByText('21 parties cette semaine')).toBeVisible()
    await expect(page.getByText('3 chicken dinners')).toBeVisible()
    await expect(kpi(page, 'Kills')).toContainText('58')
    await expect(kpi(page, 'Meilleure place')).toContainText('#1')
    await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
    await expect.poll(() => api.paramValues(matchesApi, 'period').at(-1)).toBe('month')
  })

  test('chronologie paginée, ouverte sur les plus récentes, sans défilement horizontal', async ({ page }, testInfo) => {
    const steps = chronology(page).getByRole('list', { name: 'Parties', exact: true }).getByRole('listitem')
    const pager = page.getByRole('navigation', { name: 'Pages · Chronologie' })
    await expect(steps).toHaveCount(isMobile(testInfo) ? 5 : 10)
    await expect(pager).toContainText(isMobile(testInfo) ? '5 / 5' : '3 / 3')
    await expect(chronology(page)).toContainText('parties 12 à 21 sur 21'.replace('12', isMobile(testInfo) ? '17' : '12'))
    await pager.getByRole('button', { name: 'Parties plus anciennes' }).click()
    await expect(pager).toContainText(isMobile(testInfo) ? '4 / 5' : '2 / 3')
    const modes = chronology(page).getByRole('list', { name: 'Parties par mode' })
    await expect(modes).toContainText('Sans le clan')
    await expectNoHorizontalScroll(page)
  })

  test('soirées par 4, la plus récente ouverte : débriefing, télémétrie en attente, partie sans le clan', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Pages · Soirées' })).toContainText('1 / 2')
    await expect(sessionButton(page, 0)).toHaveAttribute('aria-expanded', 'true')
    await expect(sessionButton(page, 0)).toContainText('Ce soir')
    await expect(sessionButton(page, 0)).toContainText('CHICKEN DINNER')
    const today = sessions(page).getByRole('listitem').first()
    await expect(today.getByRole('link', { name: 'Débriefing' }).first()).toHaveAttribute('href', new RegExp(`/clans/1/telemetry/matches/sm-\\d+/debrief\\?period=week&fromDate=${sessionDaysAgo(0)}`))
    await expect(today).toContainText('Télémétrie en attente')
    await expect(today.getByRole('link', { name: 'État' })).toHaveAttribute('href', /\/telemetry\/matches\/sm-21\/telemetry/)
    // Soirée à 6 jours : une partie sans coéquipier du clan, sans lien.
    await sessionButton(page, 3).click()
    const older = sessions(page).getByRole('list', { name: 'Soirées' }).getByRole('listitem').nth(3)
    await expect(older).toContainText('Sans coéquipier du clan')
    await expect(page).toHaveURL(new RegExp(`soiree=${sessionDaysAgo(6)}`))
  })

  test('toucher une étape ouvre sa soirée et met la partie en avant', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Pages · Chronologie' }).getByRole('button', { name: 'Parties plus anciennes' }).click()
    await chronology(page).getByRole('list', { name: 'Parties', exact: true }).getByRole('button').first().click()
    await expect(page.locator('article[data-selected="true"]')).toBeVisible()
    await expect(page).toHaveURL(/[?&]soiree=\d{4}-\d{2}-\d{2}/)
  })

  test('mode : pastille colorée, compte par mode, adresse partageable', async ({ page }) => {
    await toolbar(page).getByTestId('mode-chip').click()
    await expect(page.getByRole('menuitemradio', { name: /Duo/ })).toContainText('4')
    await page.getByRole('menuitemradio', { name: /Duo/ }).click()
    await expect(toolbar(page).getByTestId('mode-chip')).toHaveAttribute('aria-label', 'Mode : Duo')
    await expect(page).toHaveURL(/[?&]mode=duo/)
    await expect(kpi(page, 'Kills')).toContainText('13')
  })

  test('bandeau docké sur une ligne, aussi sur mobile : période et mode', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    await dock(page)
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
    await expect(periodFilter(page)).toBeVisible()
    await expect(toolbar(page).getByTestId('mode-chip')).toBeVisible()
    expect((await toolbar(page).boundingBox())!.height).toBeLessThan(80)
    await expectNoHorizontalScroll(page)
  })
})

test('lien partagé : la soirée de l’adresse est ouverte, sur sa page', async ({ api, page }) => {
  mockPlayerMatches(api)
  await openMatches(page, `?soiree=${sessionDaysAgo(12)}`)
  await expect(page.getByRole('navigation', { name: 'Pages · Soirées' })).toContainText('2 / 2')
  await expect(sessionButton(page, 1)).toHaveAttribute('aria-expanded', 'true')
  await expect(sessions(page)).toContainText('Télémétrie expirée')
})
