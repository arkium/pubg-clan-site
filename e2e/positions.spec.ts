import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { appHeader, dock, periodFilter, toolbar } from './support/layout'
import { mockClanPositions } from './support/positions'

/**
 * Cartographie tactique — docs/features/positions.md (maquette « Positions », 2026-09-27). Bandeau des zones de drop
 * (une ligne, docké aussi sur mobile), sept événements, un seul rendu, phase du cercle, zone chaude, rapport de force,
 * top 5, « Qui … où » paginé par chevrons ; lien préfiltré du panneau « Villes » (`?map=&view=`).
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

const events = (page: Page) => page.getByRole('group', { name: 'Événement' })
const pins = (page: Page) => page.getByTestId('city-pin')

test.describe('Cartographie tactique', () => {
  test.beforeEach(async ({ api, page }) => {
    mockClanPositions(api)
    await page.goto(`/clans/${CLAN_ID}/stats/positions`)
    await expect(page.getByRole('heading', { level: 1, name: 'Cartographie tactique' })).toBeVisible()
    await expect(pins(page).first()).toBeVisible()
  })

  test('sept événements avec leur compteur ; Kills par défaut, en pastilles', async ({ page }) => {
    await expect(events(page).getByRole('button')).toHaveCount(7)
    await expect(events(page).getByRole('button', { name: /Kills/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(events(page).getByRole('button', { name: /Kills/ })).toContainText('25')
    await expect(events(page).getByRole('button', { name: /Tirs/ })).toContainText('195')
    await expect(page.getByTestId('event-dot')).toHaveCount(7)
    await expect(page.getByTestId('event-legend')).toContainText('Kills position du tueur au moment du kill · taille = nombre')
  })

  test('un seul rendu à la fois ; Infligés / Reçus sur la carte seulement quand l’événement en a', async ({ page }) => {
    const role = page.getByRole('group', { name: 'Sens de l’événement' })
    await expect(role).toHaveCount(0)
    await events(page).getByRole('button', { name: /Dégâts/ }).click()
    await expect(page.getByTestId('event-dot')).toHaveCount(0)
    await expect(page.getByTestId('event-glow')).toHaveCount(2)
    await role.getByRole('button', { name: 'Reçus' }).click()
    await expect(page.getByTestId('event-legend')).toContainText('Dégâts reçus')
    await expect(page.getByRole('heading', { name: 'Qui prend cher où' })).toBeVisible()
    await events(page).getByRole('button', { name: /Revives/ }).click()
    await expect(role.getByRole('button', { name: 'Donnés' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('véhicules : la tuile compte les véhicules, Montées / Descentes sur la carte', async ({ page }) => {
    const vehicles = events(page).getByRole('button', { name: /Véhicules/ })
    await expect(vehicles).toContainText('7')
    await vehicles.click()
    const role = page.getByRole('group', { name: 'Sens de l’événement' })
    await expect(role.getByRole('button', { name: 'Montées' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('event-legend')).toContainText('Véhicules pris')
    await expect(page.getByRole('heading', { name: 'Qui prend un véhicule où' })).toBeVisible()
    await role.getByRole('button', { name: 'Descentes' }).click()
    await expect(page.getByTestId('event-legend')).toContainText('Véhicules laissés')
    await expect(page.getByRole('heading', { name: 'Qui laisse un véhicule où' })).toBeVisible()
  })

  test('épingles du top 5 : toucher zoome, « Toute la carte » revient', async ({ page }) => {
    await expect(pins(page)).toHaveCount(5)
    await expect(pins(page).first()).toHaveAccessibleName('1. Pochinki : 12')
    await pins(page).first().click()
    const back = page.getByRole('button', { name: /Pochinki · Toute la carte/ })
    await expect(back).toBeVisible()
    await back.click()
    await expect(back).toHaveCount(0)
  })

  test('zone chaude, rapport de force et top 5 des villes', async ({ page }) => {
    const hot = page.getByTestId('hot-zone')
    await expect(hot).toContainText('Là où le clan fait ses kills')
    await expect(hot).toContainText('Pochinki')
    await expect(hot).toContainText('12 kills · 48 % sur Erangel')
    await expect(hot).toContainText('Roi du coin : Joueur Alpha ×7')

    const force = page.getByRole('list', { name: 'Rapport de force par ville' })
    await expect(force.getByRole('listitem')).toHaveCount(4)
    await expect(force.getByRole('listitem').first()).toContainText('Terrain gagnant · 3')
    await expect(force.getByRole('listitem').nth(1)).toContainText('School')
    await expect(force.getByRole('listitem').nth(1)).toContainText('Équilibré')

    await expect(page.getByRole('region', { name: /Top 5 · kills/ })).toContainText('23 en ville · 2 hors ville')
    await page.getByRole('list', { name: 'Top 5 des villes' }).getByRole('button', { name: /School/ }).click()
    await expect(page.getByRole('button', { name: /School · Toute la carte/ })).toBeVisible()
  })

  test('phase du cercle : la zone moyenne s’affiche, l’API reçoit la phase', async ({ api, page }) => {
    await expect(page.getByTestId('safe-zone')).toHaveCount(0)
    await page.getByRole('group', { name: 'Phase du cercle' }).getByRole('button', { name: /Milieu/ }).click()
    await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/telemetry/positions`, 'phase').at(-1)).toBe('mid')
    await expect(page.getByTestId('safe-zone')).toBeVisible()
    await expect(page.getByText('cercle blanc : zone moyenne de cette phase')).toBeVisible()
  })

  test('joueur depuis le bandeau ou « Qui … où » : la carte se filtre, la zone chaude parle de lui', async ({ api, page }, testInfo) => {
    const who = page.getByRole('list', { name: 'Joueurs de la carte' })
    await expect(page.getByRole('heading', { name: 'Qui fait ses kills où' })).toBeVisible()
    await expect(who.getByRole('listitem')).toHaveCount(isMobile(testInfo) ? 2 : 4)
    await expect(page.getByRole('navigation', { name: 'Pages des joueurs' })).toContainText(isMobile(testInfo) ? '1/3' : '1/2')
    await expect(who.getByRole('listitem').first()).toContainText('Joueur Alpha')
    await expect(who.getByRole('listitem').first()).toContainText('Pochinki ×7')

    await toolbar(page).getByRole('button', { name: /Joueur : Tout le clan/ }).click()
    await page.getByRole('menuitemradio', { name: /Joueur Bravo/ }).click()
    await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/telemetry/positions`, 'memberKey').at(-1)).toBe('account.2')
    await expect(page.getByTestId('hot-zone')).toContainText('Joueur Bravo fait ses kills')
    await expect(page.getByTestId('hot-zone')).toContainText('School')
    await expect(page.getByTestId('hot-zone')).not.toContainText('Roi du coin')
  })

  test('carte ‹ › : message quand rien sur la carte, glisser change de map', async ({ page }, testInfo) => {
    await toolbar(page).getByRole('button', { name: 'Carte suivante' }).click()
    await expect(page.getByTestId('active-map')).toHaveText('Miramar')
    await expect(pins(page)).toHaveCount(0)
    await expect(page.getByTestId('event-dot')).toHaveCount(1)
    await events(page).getByRole('button', { name: /Morts/ }).click()
    await expect(page.getByText('Aucun événement « morts » pour le clan sur Miramar cette semaine')).toBeVisible()
    if (!isMobile(testInfo)) {
      const viewport = page.locator('[data-drop-zone-map-viewport]')
      await viewport.scrollIntoViewIfNeeded()
      const box = (await viewport.boundingBox())!
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.72)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.72, { steps: 8 })
      await page.mouse.up()
      await expect(page.getByTestId('active-map')).toHaveText('Erangel')
    }
  })

  test('bandeau docké sur une ligne, aussi sur mobile ; période dans l’API', async ({ api, page }) => {
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    await dock(page)
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
    await expect(toolbar(page).getByRole('button', { name: 'Carte suivante' })).toBeVisible()
    expect((await toolbar(page).boundingBox())!.height).toBeLessThan(80)
    await expectNoHorizontalScroll(page)
    await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
    await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/telemetry/positions`, 'period').at(-1)).toBe('month')
  })
})

test('lien préfiltré du panneau « Villes » : carte et événement repris de l’URL', async ({ api, page }) => {
  mockClanPositions(api)
  await page.goto(`/clans/${CLAN_ID}/stats/positions?map=Desert_Main&view=revive&period=month`)
  await expect(page.getByTestId('active-map')).toHaveText('Miramar')
  await expect(events(page).getByRole('button', { name: /Revives/ })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/telemetry/positions`, 'map').at(-1)).toBe('Desert_Main')
  expect(api.paramValues(`/api/clans/${CLAN_ID}/telemetry/positions`, 'period').at(-1)).toBe('month')
})
