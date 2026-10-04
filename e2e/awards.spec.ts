import type { TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { mockClanAwards } from './support/awards'
import { CLAN_ID, PLAYERS } from './support/data'
import { appHeader, dock, toolbar } from './support/layout'

/**
 * Awards du clan — charte UI (docs/ui/index.html, migrée le 04/10/2026) : titre Teko, nombre de matchs sur la photo,
 * bandeau à intitulés (« Type de match » Officiel / Tous comme le classement), lauréat mis en avant, médailles SVG,
 * aucun emoji, aucun défilement horizontal.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

test.beforeEach(async ({ api, page }) => {
  mockClanAwards(api)
  await page.goto(`/clans/${CLAN_ID}/awards`)
  await expect(page.getByRole('heading', { level: 1, name: 'Awards du clan' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Le croc mort' })).toBeVisible()
})

test('bandeau : matchs pris en compte, type de match Officiel / Tous, rafraîchir', async ({ api, page }) => {
  await expect(page.locator('header').getByText('24 matchs pris en compte')).toBeVisible()
  await expect(toolbar(page).getByRole('button', { name: 'Officiel' })).toHaveAttribute('aria-pressed', 'true')
  await toolbar(page).getByRole('button', { name: 'Tous', exact: true }).last().click()
  await expect(page.locator('header').getByText('31 matchs pris en compte')).toBeVisible()
  expect(api.paramValues(`/api/clans/${CLAN_ID}/awards`, 'scope')).toContain('all')

  await toolbar(page).getByRole('button', { name: 'Rafraîchir' }).click()
  await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/awards`, 'force')).toContain('true')
})

test('un award : lauréat en chiffre héros, médailles, distances lisibles ; sans lauréat, un message', async ({ page }) => {
  const killer = page.getByRole('article', { name: 'Le croc mort' })
  await expect(killer.getByTestId('award-winner')).toContainText(PLAYERS[0].displayName)
  await expect(killer.getByTestId('award-winner').locator('.t-hero')).toHaveText('34 kills')
  await expect(killer.getByRole('img', { name: 'Rang 1, médaille d’or' })).toBeVisible()

  await expect(page.getByRole('article', { name: 'JACKY TUNING' }).getByTestId('award-winner')).toContainText('12,4 km')
  await expect(page.getByRole('article', { name: 'Le destructeur' })).toContainText('Pas de données sur cette période.')
  await expect(page.getByText(/[💀💥🚗🥾🌿🍺🩹💣🎯🎒🚙]/u)).toHaveCount(0)
})

test('podium des performances sous les awards', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Podium des performances' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Top éliminations' })).toContainText(PLAYERS[0].displayName)
})

test('aucun défilement horizontal ; docké sur mobile, la période seule', async ({ page }, testInfo) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  // Trois awards : sur ordinateur, la page est trop courte pour docker le bandeau.
  if (!isMobile(testInfo)) return
  await page.waitForLoadState('networkidle')
  await expect(appHeader(page)).toBeVisible()
  await dock(page)
  await expect(toolbar(page).getByRole('button', { name: 'Officiel' })).toHaveCount(0)
  await expect(toolbar(page).getByRole('button', { name: 'Rafraîchir' })).toHaveCount(0)
})
