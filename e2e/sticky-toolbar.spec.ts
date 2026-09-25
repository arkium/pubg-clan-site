import type { TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID, MEMBER_ID } from './support/data'
import {
  appHeader,
  clickInPlace,
  dock,
  dockingThreshold,
  documentTop,
  focusedElementVisibility,
  periodFilter,
  scrollToY,
  settle,
  toolbar,
} from './support/layout'
import { mockClanLeaderboard, mockClanOverview, mockClanWeapons, mockMemberWeapons } from './support/pages'

/** Bandeau collant — géométrie et comportement (docs/TODO/sticky.md §4 et §7.C). */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

test.describe('Classement du clan (page de référence)', () => {
  test.beforeEach(async ({ api, page }) => {
    mockClanLeaderboard(api)
    await page.goto(`/clans/${CLAN_ID}/leaderboard`)
    await expect(page.getByText('Joueur Alpha').first()).toBeVisible()
    await expect(toolbar(page)).toBeVisible()
  })

  test('se docke sous le header, sur toute la colonne de contenu, et reste lisible', async ({ page }) => {
    await dock(page)
    const bar = await toolbar(page).boundingBox()
    const header = await appHeader(page).boundingBox()
    const column = await page.locator('main').boundingBox()
    expect(bar && header && column).toBeTruthy()
    expect(Math.abs(bar!.y - (header!.y + header!.height))).toBeLessThanOrEqual(1)
    expect(Math.abs(bar!.x - column!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(bar!.width - column!.width)).toBeLessThanOrEqual(1)

    // Lisible pendant le défilement : rien ne le recouvre (WebKit / iPhone compris).
    await scrollToY(page, (await dockingThreshold(page)) + 600)
    const visible = await toolbar(page).evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return Boolean(hit && element.contains(hit))
    })
    expect(visible).toBe(true)
  })

  test('ne fait pas sauter le contenu à la bascule', async ({ page }) => {
    const threshold = await dockingThreshold(page)
    const content = page.locator('[data-docking-toolbar] + div + div')

    await scrollToY(page, threshold - 20)
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'false')
    const before = await documentTop(content)

    await scrollToY(page, threshold + 20)
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
    await settle(page)
    const after = await documentTop(content)

    expect(Math.abs(after - before)).toBeLessThanOrEqual(2)
  })

  test('docké sur mobile : la période seule', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'comportement propre au mobile (< 640 px)')
    await dock(page)
    await expect(toolbar(page)).toHaveAttribute('data-compact', 'true')
    await expect(periodFilter(page).locator('button')).toHaveCount(3)
    expect(await toolbar(page).locator('button').count()).toBe(3)
  })

  test('docké sur ordinateur : les contrôles, sans la note', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'comportement ordinateur')
    await expect(toolbar(page).getByText(/Classement calcul|mis à jour|Dernière/i)).toHaveCount(0)
    await dock(page)
    await expect(toolbar(page)).toHaveAttribute('data-compact', 'false')
    await expect(periodFilter(page)).toBeVisible()
    expect(await toolbar(page).locator('button').count()).toBeGreaterThan(3)
  })

  test('au clavier, aucun élément focalisé ne passe sous le header ou le bandeau', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'navigation au clavier : ordinateur')
    await dock(page)
    // En remontant depuis le bas de page, un élément pourrait se glisser sous le bandeau docké.
    await page.locator('main a[href], main button').last().focus()
    for (let step = 0; step < 25; step += 1) {
      await page.keyboard.press('Shift+Tab')
      await settle(page)
      expect(await focusedElementVisibility(page)).toBe('ok')
    }
  })
})

test.describe("Vue d'ensemble (page de référence)", () => {
  test('se docke sous le header sans faire sauter le contenu', async ({ api, page }) => {
    mockClanOverview(api)
    await page.goto(`/clans/${CLAN_ID}/overview`)
    await expect(toolbar(page)).toBeVisible()
    const threshold = await dockingThreshold(page)
    const content = page.locator('[data-docking-toolbar] + div + div')

    await scrollToY(page, threshold - 20)
    const before = await documentTop(content)
    await scrollToY(page, threshold + 20)
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
    await settle(page)
    expect(Math.abs((await documentTop(content)) - before)).toBeLessThanOrEqual(2)

    const bar = await toolbar(page).boundingBox()
    const header = await appHeader(page).boundingBox()
    expect(Math.abs(bar!.y - (header!.y + header!.height))).toBeLessThanOrEqual(1)
  })
})

test.describe('Menus déroulants du bandeau', () => {
  test('un long menu ouvert depuis le bandeau docké se parcourt jusqu’au bout', async ({ api, page }, testInfo) => {
    test.skip(isMobile(testInfo), 'sur mobile, le bandeau docké ne garde que la période')
    mockClanWeapons(api)
    await page.goto(`/clans/${CLAN_ID}/stats/weapons`)
    await expect(toolbar(page).locator('#weapon-player-dropdown')).toBeVisible()
    await dock(page)

    await clickInPlace(page, toolbar(page).locator('#weapon-player-dropdown'))
    const menu = page.locator('#weapon-player-dropdown-menu')
    await expect(menu).toBeVisible()
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
    await menu.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
    await settle(page)

    const lastItem = menu.locator('.member-section-nav-mobile-item').last()
    const reachable = await lastItem.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      if (rect.bottom > window.innerHeight) return false
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return Boolean(hit && element.contains(hit))
    })
    expect(reachable).toBe(true)
  })
})

test.describe('Ancres dans le bandeau', () => {
  test("une ancre amène le titre de sa section sous le bandeau, pas dessous", async ({ api, page }, testInfo) => {
    test.skip(isMobile(testInfo), 'sur mobile, les ancres ne restent pas dans le bandeau docké')
    mockMemberWeapons(api)
    await page.goto(`/members/${MEMBER_ID}/weapons`)
    const anchor = toolbar(page).getByRole('link', { name: 'Stats télémétrie' })
    await expect(anchor).toBeVisible()
    await expect(page.locator('#sec-member-weapons-telemetry')).toBeVisible()

    await anchor.click()
    await expect(page).toHaveURL(/#sec-member-weapons-telemetry$/)
    await settle(page)
    await settle(page)

    const bar = await toolbar(page).boundingBox()
    const section = await page.locator('#sec-member-weapons-telemetry').boundingBox()
    expect(section!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1)
  })
})
