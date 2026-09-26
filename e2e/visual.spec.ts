import type { TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { clickInPlace, dock, toolbar } from './support/layout'
import { mockClanLeaderboard, mockClanWeapons } from './support/pages'

/**
 * Captures de référence — docs/ops/tests-e2e.md. États repos, docké et menu ouvert, en thèmes
 * clair et sombre, à 1 280, 768 et 375 px et sur le profil iPhone. Les captures sont propres au
 * système qui les a générées (rendu des polices) : les régénérer avec `npm run test:e2e:update`.
 */

const THEMES = ['light', 'dark'] as const
const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

for (const theme of THEMES) {
  test.describe(`thème ${theme === 'light' ? 'clair' : 'sombre'}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => window.localStorage.setItem('pubg_app_theme', value), theme)
    })

    test('classement du clan — repos et docké', async ({ api, page }) => {
      mockClanLeaderboard(api)
      await page.goto(`/clans/${CLAN_ID}/leaderboard`)
      await expect(page.getByText('Joueur Alpha').filter({ visible: true }).first()).toBeVisible()
      await page.waitForLoadState('networkidle')

      await expect(page).toHaveScreenshot(`classement-repos-${theme}.png`)
      await dock(page)
      await expect(page).toHaveScreenshot(`classement-docke-${theme}.png`)
    })

    test('armes du clan — menu ouvert depuis le bandeau docké', async ({ api, page }, testInfo) => {
      test.skip(isMobile(testInfo), 'sur mobile, le bandeau docké ne garde que la période')
      mockClanWeapons(api)
      await page.goto(`/clans/${CLAN_ID}/stats/weapons`)
      await expect(toolbar(page).locator('#weapon-player-dropdown')).toBeVisible()
      await page.waitForLoadState('networkidle')

      await dock(page)
      await clickInPlace(page, toolbar(page).locator('#weapon-player-dropdown'))
      await expect(page.locator('#weapon-player-dropdown-menu')).toBeVisible()
      await expect(page).toHaveScreenshot(`armes-menu-ouvert-${theme}.png`)
    })
  })
}
