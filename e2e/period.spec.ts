import { expect, test } from './support/api'
import { CLAN_ID, MEMBER_ID } from './support/data'
import { clickInPlace, dock, periodFilter, settle } from './support/layout'
import { mockClanItems, mockClanLeaderboard, mockClansLeaderboard, mockMemberItems } from './support/pages'

/**
 * Période d'une page : l'URL fait foi, la mémoire de la visite pré-remplit les pages ouvertes sans
 * paramètre, sinon le défaut de la page (docs/TODO/sticky.md §4.E).
 */

test.beforeEach(({}, testInfo) => {
  test.skip(
    !['chromium-desktop', 'webkit-iphone'].includes(testInfo.project.name),
    'logique indépendante de la largeur : un moteur de chaque famille suffit'
  )
})

const selected = (page: import('@playwright/test').Page) => periodFilter(page).locator('button[aria-pressed="true"]')

/**
 * Navigation vers une autre page une fois la précédente au repos : WebKit signale comme erreurs les
 * requêtes encore en vol qu'une navigation interrompt.
 */
async function gotoWhenIdle(page: import('@playwright/test').Page, url: string) {
  await page.waitForLoadState('networkidle')
  await page.goto(url)
}

test('changer de période met ?period= dans l’URL, sans remonter la page, et recharge la bonne période', async ({
  api,
  page,
}) => {
  mockClanLeaderboard(api)
  await page.goto(`/clans/${CLAN_ID}/leaderboard`)
  await expect(page.getByText('Joueur Alpha').filter({ visible: true }).first()).toBeVisible()
  await expect(selected(page)).toHaveText('Semaine')

  await dock(page)
  const scrollBefore = await page.evaluate(() => window.scrollY)
  await clickInPlace(page, periodFilter(page).getByRole('button', { name: 'Mois' }))

  await expect(page).toHaveURL(/[?&]period=month\b/)
  await expect(selected(page)).toHaveText('Mois')
  await settle(page)
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(2)
  // En développement, React double les effets : un même appel peut partir deux fois.
  await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/leaderboard`, 'period').at(-1)).toBe('month')
  expect(new Set(api.paramValues(`/api/clans/${CLAN_ID}/leaderboard`, 'period'))).toEqual(new Set(['week', 'month']))
})

test('une page ouverte sans paramètre reprend la période choisie pendant la visite', async ({ api, page }) => {
  mockClanLeaderboard(api)
  mockClanItems(api)
  await page.goto(`/clans/${CLAN_ID}/leaderboard`)
  await expect(page.getByText('Joueur Alpha').filter({ visible: true }).first()).toBeVisible()
  await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
  await expect(page).toHaveURL(/[?&]period=month\b/)

  // Défaut de la page des objets : « Tous ». La mémoire de la visite l'emporte, sans premier appel avec le défaut.
  await gotoWhenIdle(page, `/clans/${CLAN_ID}/stats/items`)
  await expect(selected(page)).toHaveText('Mois')
  await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/telemetry/item-use`, 'period').length).toBeGreaterThan(0)
  expect(new Set(api.paramValues(`/api/clans/${CLAN_ID}/telemetry/item-use`, 'period'))).toEqual(new Set(['month']))

  // Le rechargement conserve la période.
  await page.waitForLoadState('networkidle')
  await page.reload()
  await expect(selected(page)).toHaveText('Mois')

  // Le retour ramène la page précédente avec sa période (l'URL la porte).
  await page.waitForLoadState('networkidle')
  await page.goBack()
  await expect(page).toHaveURL(/\/leaderboard\?period=month/)
  await expect(selected(page)).toHaveText('Mois')
})

test('un lien partagé impose sa période, quelle que soit la mémoire du destinataire', async ({ api, page }) => {
  mockMemberItems(api)
  mockClansLeaderboard(api)
  await page.goto('/clans-leaderboard')
  await periodFilter(page).getByRole('button', { name: 'Tous' }).click()
  await expect(page).toHaveURL(/[?&]period=all\b/)

  await gotoWhenIdle(page, `/members/${MEMBER_ID}/items?period=week`)
  await expect(selected(page)).toHaveText('Semaine')
  await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/item-use`, 'period').length).toBeGreaterThan(0)
  expect(new Set(api.paramValues(`/api/members/${MEMBER_ID}/item-use`, 'period'))).toEqual(new Set(['week']))
})

test('sans URL ni mémoire, chaque page garde son défaut', async ({ api, page }) => {
  mockClansLeaderboard(api)
  mockClanItems(api)
  await page.goto('/clans-leaderboard')
  await expect(selected(page)).toHaveText('Semaine')
  await gotoWhenIdle(page, `/clans/${CLAN_ID}/stats/items`)
  await expect(selected(page)).toHaveText('Tous')
})
