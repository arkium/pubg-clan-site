import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { appHeader, dock, periodFilter, toolbar } from './support/layout'
import { mockClansLeaderboard } from './support/pages'

/**
 * Ligue Inter-Clans — docs/features/ligue-clans.md (maquette « Ligue clans », 2026-09-27). Podium en marches, fil de la
 * ligue, titres, classement par cercle (zone, blue zone repliée, sans partie), flèches par rapport à la période
 * précédente, pastille « Mon clan », bandeau sur une ligne aussi docké sur mobile.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

async function chooseCriterion(page: Page, testInfo: TestInfo, label: string) {
  if (isMobile(testInfo)) {
    const cycle = toolbar(page).getByRole('button', { name: /^Critère :/ })
    for (let step = 0; step < 5 && !((await cycle.getAttribute('aria-label')) ?? '').startsWith(`Critère : ${label}`); step += 1) await cycle.click()
  } else {
    await toolbar(page).getByRole('group', { name: 'Critère' }).getByRole('button', { name: label }).click()
  }
}

test.describe('Ligue Inter-Clans (visiteur)', () => {
  test.beforeEach(async ({ api, page }) => {
    mockClansLeaderboard(api)
    await page.goto('/clans-leaderboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Ligue Inter-Clans' })).toBeVisible()
    await expect(page.getByTestId('podium-1')).toBeVisible()
  })

  test('podium en marches 2-1-3 avec couronne, qui suit le critère', async ({ page }, testInfo) => {
    await expect(page.getByTestId('podium-1')).toContainText('Clan Alpha')
    await expect(page.getByTestId('podium-1').getByLabel('Premier')).toBeVisible()
    await expect(page.getByText('WINNER WINNER CHICKEN DINNER')).toBeVisible()
    await chooseCriterion(page, testInfo, 'Knocks')
    await expect(page.getByRole('region', { name: 'Podium · Knocks moyens' })).toBeVisible()
    await expect(page.getByTestId('podium-1')).toContainText('Clan Echo')
  })

  test('fil de la ligue (3 lignes sur mobile, 5 sur ordinateur) et titres de la période', async ({ page }, testInfo) => {
    const feed = page.getByRole('list', { name: 'Fil de la ligue' })
    await expect(feed.getByRole('listitem').filter({ visible: true })).toHaveCount(isMobile(testInfo) ? 3 : 5)
    await expect(feed.getByRole('listitem').first()).toContainText('Clan Alpha')
    await expect(feed.getByRole('listitem').first()).toContainText('a sorti Clan Bravo de la 1re place')
    await expect(page.getByRole('article', { name: 'Plus gros dégâts' })).toContainText('Clan Alpha')
    await expect(page.getByRole('article', { name: 'Machine à knocks' })).toContainText('5,2 / partie')
    await expect(page.getByRole('article', { name: 'Meilleure remontée' })).toContainText('▲3 places')
  })

  test('classement par cercle : zone 4 à 8, blue zone repliée, clans sans partie à part', async ({ page }) => {
    await expect(page.getByRole('list', { name: 'Dans la zone' }).getByRole('listitem')).toHaveCount(5)
    await expect(page.getByRole('list', { name: 'Blue zone' })).toHaveCount(0)
    await page.getByRole('button', { name: /Blue zone/ }).click()
    await expect(page.getByRole('list', { name: 'Blue zone' }).getByRole('listitem')).toHaveCount(8)
    await expect(page.getByRole('button', { name: /Sans partie/ })).toContainText('2 clans sans partie officielle cette semaine')
    await page.getByRole('button', { name: /Sans partie/ }).click()
    await expect(page.getByRole('list', { name: 'Clans sans partie' })).toContainText('Clan Endormi')
    await expectNoHorizontalScroll(page)
  })

  test('flèches ▲▼ en Power score seulement, par rapport à la période précédente ; aucune pour « Tous »', async ({ page }, testInfo) => {
    const zone = page.getByRole('list', { name: 'Dans la zone' })
    await expect(zone.getByRole('listitem').first()).toContainText('▼1') // Clan Delta : 3e la semaine d'avant, 4e
    await expect(zone.getByRole('listitem').nth(2)).toContainText('▲3') // Clan Foxtrot : 9e → 6e
    await chooseCriterion(page, testInfo, 'Dégâts')
    await expect(zone.getByRole('listitem').first()).not.toContainText(/[▲▼]/)
    await chooseCriterion(page, testInfo, 'Power')
    await periodFilter(page).getByRole('button', { name: 'Tous' }).click()
    await expect(page).toHaveURL(/[?&]period=all\b/)
    await expect(zone.getByRole('listitem').first()).not.toContainText(/[▲▼]/)
    await expect(page.getByRole('article', { name: 'Meilleure remontée' })).toHaveCount(0)
  })

  test('visiteur : pas de pastille « Mon clan » ; chaque clan ouvre sa vue d’ensemble', async ({ page }) => {
    await expect(page.getByTestId('mine-chip')).toHaveCount(0)
    await expect(page.getByRole('link', { name: '4. Clan Delta' })).toHaveAttribute('href', '/clans/5/overview')
  })

  test('bandeau docké sur une ligne, aussi sur mobile', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    await dock(page)
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
    await expect(periodFilter(page)).toBeVisible()
    expect((await toolbar(page).boundingBox())!.height).toBeLessThan(80)
    await expectNoHorizontalScroll(page)
  })
})

test.describe('Ligue Inter-Clans (membre connecté)', () => {
  test.beforeEach(async ({ api, page }) => {
    mockClansLeaderboard(api)
    api
      .on('GET', '/api/auth/mode', { body: { authDisabled: false } })
      .on('GET', '/api/members/1', { body: { id: 1, displayName: 'Joueur Alpha', avatarUrl: null, clanId: CLAN_ID } })
      .on('GET', '/api/auth/session', {
        body: {
          authenticated: true,
          user: { email: 'membre@example.com', isSuperUser: false },
          activeMemberId: 1,
          permissions: [],
          members: [{ memberId: 1, displayName: 'Joueur Alpha', clanId: CLAN_ID, clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' } }],
          isSuperUser: false,
        },
      })
    await page.goto('/clans-leaderboard')
    await expect(page.getByTestId('podium-1')).toBeVisible()
  })

  test('« Mon clan · #10 » : sa ligne reste visible repliée, avec la cible juste devant', async ({ page }) => {
    await expect(page.getByTestId('mine-chip')).toContainText('#10')
    const blue = page.getByRole('list', { name: 'Blue zone' })
    await expect(blue.getByRole('listitem')).toHaveCount(1)
    await expect(blue).toContainText('MON CLAN')
    await expect(page.getByTestId('league-target')).toContainText('Clan India à')
  })

  test('la pastille déplie la blue zone et amène sa ligne à l’écran', async ({ page }) => {
    await page.getByTestId('mine-chip').click()
    await expect(page.getByRole('list', { name: 'Blue zone' }).getByRole('listitem')).toHaveCount(8)
    await expect(page.locator(`#league-clan-${CLAN_ID}`)).toBeInViewport()
  })

  test('un membre n’ouvre que son clan ; les autres restent affichés sans lien', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Clan Démo \(mon clan\)/ })).toHaveAttribute('href', `/clans/${CLAN_ID}/overview`)
    await expect(page.getByRole('link', { name: '4. Clan Delta' })).toHaveCount(0)
    await expect(page.getByLabel('4. Clan Delta')).toBeVisible()
  })
})
