import type { TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID, clanOverview } from './support/data'
import { mockClanOverview } from './support/pages'
import { mockMemberSession, withSessionCookie } from './support/session'

/**
 * En-tête du shell (`ClanNavigation`) : hauteur fixée par le bouton de menu (48 px sous 1 024 px), cartes Clan et Joueur
 * en icône seule sous 640 px — les textes écrasaient le header sur deux lignes et le bouton de menu à 36 px (2026-10-25)
 * — avec un nom accessible complet ; textes visibles dès 640 px.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

test('menu de 48 px jamais écrasé, cartes en icône seule sous 640 px, header à une ligne', async ({ api, page }, testInfo) => {
  mockClanOverview(api)
  await page.goto(`/clans/${CLAN_ID}/overview`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const header = page.locator('[data-app-header]')
  const clanCard = header.getByRole('button', { name: /Changer de clan — actuel : Clan Démo \[DEMO\]/ })
  const playerCard = header.getByRole('button', { name: 'Choisir un joueur' })
  await expect(clanCard).toBeVisible()
  await expect(playerCard).toBeVisible()

  // Une seule ligne : 48 px de bouton + 12 px de marge de chaque côté (+ bordure), jamais plus.
  const headerBox = (await header.boundingBox())!
  expect(headerBox.height).toBeLessThanOrEqual(74)

  const burger = header.getByRole('button', { name: 'Ouvrir la navigation' })
  if (testInfo.project.name === 'chromium-desktop') {
    await expect(burger).toBeHidden()
  } else {
    const box = (await burger.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(48)
    expect(box.height).toBeGreaterThanOrEqual(48)
  }

  const visitorLabel = clanCard.getByText('Mode visiteur')
  const playerLabel = playerCard.getByText('Choisir...')
  if (isMobile(testInfo)) {
    await expect(visitorLabel).toBeHidden()
    await expect(playerLabel).toBeHidden()
    for (const card of [clanCard, playerCard]) {
      const box = (await card.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeLessThanOrEqual(52)
    }
    // Menu à gauche, cartes poussées à droite (2026-10-25).
    const viewport = page.viewportSize()!
    const playerBox = (await playerCard.boundingBox())!
    expect(viewport.width - (playerBox.x + playerBox.width), 'carte Joueur au bord droit').toBeLessThanOrEqual(24)
    expect((await burger.boundingBox())!.x, 'menu au bord gauche').toBeLessThanOrEqual(24)
  } else {
    await expect(visitorLabel).toBeVisible()
    await expect(playerLabel).toBeVisible()
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'défilement horizontal').toBe(0)
})

test('modale « Changer de clan » : le clan actif en tête, les autres dans l’ordre du serveur', async ({ api, page }) => {
  mockClanOverview(api)
  const clan = (id: number, name: string, tag: string) => ({ id, name, tag, platformShard: 'steam', membersCount: 10, matchesCount: 50 })
  api.on('GET', '/api/clans', { body: [clan(2, 'Clan Témoin', 'TEMO'), clan(CLAN_ID, 'Clan Démo', 'DEMO'), clan(3, 'Clan Meute', 'MEUT')] })
  await page.goto(`/clans/${CLAN_ID}/overview`)
  await page.locator('[data-app-header]').getByRole('button', { name: /Changer de clan/ }).click()
  const options = page.getByRole('listbox').getByRole('option')
  await expect(options).toHaveCount(3)
  await expect(options.nth(0)).toContainText('Clan Démo')
  await expect(options.nth(0)).toContainText('Actif')
  await expect(options.nth(1)).toContainText('Clan Témoin')
  await expect(options.nth(2)).toContainText('Clan Meute')
})

test('modale « Joueur » : le membre du compte connecté en tête, même dernier côté serveur', async ({ api, page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
  mockMemberSession(api)
  mockClanOverview(api)
  const overview = clanOverview()
  api.on('GET', `/api/clans/${CLAN_ID}/overview`, { body: { ...overview, roster: [...overview.roster].reverse() } })
  await page.goto(`/clans/${CLAN_ID}/overview`)
  await page.locator('[data-app-header]').getByRole('button', { name: 'Choisir un joueur' }).click()
  const options = page.getByRole('listbox').getByRole('option')
  await expect(options.first()).toContainText('Joueur Alpha')
  await expect(options.nth(1)).toContainText(overview.roster[overview.roster.length - 1].displayName)
})
