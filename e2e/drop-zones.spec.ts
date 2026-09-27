import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID, MEMBER_ID } from './support/data'
import { mockClanDropZones, mockMemberDropZones } from './support/drop-zones'
import { appHeader, dock, periodFilter, toolbar } from './support/layout'

/**
 * Zones de drop — docs/features/drop-zones.md (maquette « Zones de drop », 2026-09-27). Bandeau sur une ligne, aussi
 * docké sur mobile (exception nommée à sticky.md §2) ; carte à deux lectures, épingles du top 5, glisser pour changer
 * de carte ; spot favori, profil de saut, top 5, « Qui saute où » paginé par chevrons.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

const activeMap = (page: Page) => page.getByTestId('active-map')
const pins = (page: Page) => page.getByTestId('spot-pin')

test.describe('Zones de drop du clan', () => {
  test.beforeEach(async ({ api, page }) => {
    mockClanDropZones(api)
    await page.goto(`/clans/${CLAN_ID}/drop-zones`)
    await expect(page.getByRole('heading', { level: 1, name: 'Zones de drop' })).toBeVisible()
    await expect(pins(page).first()).toBeVisible()
  })

  test('carte la plus jouée d’abord, puis ‹ › et points de pagination dans le bandeau', async ({ page }) => {
    await expect(activeMap(page)).toHaveText('Erangel')
    await toolbar(page).getByRole('button', { name: 'Carte suivante' }).click()
    await expect(activeMap(page)).toHaveText('Miramar')
    await expect(toolbar(page).getByRole('button', { name: 'Miramar' })).toHaveAttribute('aria-current', 'true')
    await toolbar(page).getByRole('button', { name: 'Erangel' }).click()
    await expect(activeMap(page)).toHaveText('Erangel')
  })

  test('épingles du top 5 sur la carte ; toucher une épingle zoome, « Toute la carte » revient', async ({ page }) => {
    await expect(pins(page)).toHaveCount(5)
    await expect(pins(page).first()).toHaveAccessibleName('1. Pochinki : 8 sauts')
    await pins(page).first().click()
    await expect(pins(page).first()).toHaveAttribute('aria-pressed', 'true')
    const back = page.getByRole('button', { name: /Pochinki · Toute la carte/ })
    await expect(back).toBeVisible()
    await back.click()
    await expect(back).toHaveCount(0)
    await expect(page.getByText('Glisse la carte pour changer de map')).toBeVisible()
  })

  test('deux lectures : nos sauts (couleur = pression) ou densité, une seule légende', async ({ page }) => {
    await expect(page.getByTestId('drop-dot')).toHaveCount(20)
    await expect(page.getByTestId('map-legend')).toContainText('Adversaires au sol à 250 m')
    await expect(page.getByTestId('map-legend')).toContainText('Très chaud 16+')
    await page.getByRole('group', { name: 'Lecture de la carte' }).getByRole('button', { name: 'Densité' }).click()
    await expect(page.getByTestId('drop-dot')).toHaveCount(0)
    await expect(page.getByTestId('map-legend')).toContainText('Densité de nos sauts')
  })

  test('spot favori, profil de saut, top 5 des spots', async ({ page }) => {
    const favorite = page.getByTestId('favorite-spot')
    await expect(favorite).toContainText('Pochinki')
    await expect(favorite).toContainText('8 sauts sur 20 · 40 % des drops sur Erangel')
    await expect(favorite).toContainText('Hot drop · 10,1 adv.')
    await expect(favorite).toContainText('Roi du spot : Joueur Alpha ×5')
    await expect(favorite).toContainText('Hot drop : on saute pour se battre.')

    const profile = page.getByRole('region', { name: 'Profil de saut' })
    await expect(profile).toContainText('6,8')
    await expect(profile).toContainText('18')
    await expect(profile).toContainText('50 %')

    const top = page.getByRole('list', { name: 'Top 5 des spots' })
    await expect(top.getByRole('listitem')).toHaveCount(5)
    await expect(page.getByRole('region', { name: 'Top 5 des spots' })).toContainText('19 en ville · 1 hors périmètre')
    await top.getByRole('button', { name: /School/ }).click()
    await expect(page.getByRole('button', { name: /School · Toute la carte/ })).toBeVisible()
  })

  test('filtrer un joueur depuis le bandeau : son spot favori, message quand il n’a pas sauté sur la carte', async ({ page }) => {
    await toolbar(page).getByRole('button', { name: /Joueur : Tout le clan/ }).click()
    await page.getByRole('menuitemradio', { name: /Joueur Charlie/ }).click()
    await expect(page.getByTestId('favorite-spot')).toContainText('Spot favori de Joueur Charlie')
    await expect(page.getByTestId('favorite-spot')).toContainText('Rozhok')
    await expect(page.getByTestId('drop-dot')).toHaveCount(3)
    await toolbar(page).getByRole('button', { name: 'Carte suivante' }).click()
    await expect(page.getByText('Joueur Charlie n’a pas sauté sur Miramar cette semaine')).toBeVisible()
  })

  test('« Qui saute où » : une carte par joueur, chevrons au lieu d’un défilement ; toucher filtre la carte', async ({ page }, testInfo) => {
    const who = page.getByRole('list', { name: 'Joueurs de la carte' })
    const pager = page.getByRole('navigation', { name: 'Pages des joueurs' })
    await expect(who.getByRole('listitem')).toHaveCount(isMobile(testInfo) ? 2 : 4)
    await expect(pager).toContainText(isMobile(testInfo) ? '1/3' : '1/2')
    await pager.getByRole('button', { name: 'Joueurs suivants' }).click()
    await expect(pager).toContainText(isMobile(testInfo) ? '2/3' : '2/2')
    await who.getByRole('button').first().click()
    await expect(who.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true')
    await expect(toolbar(page).getByRole('button', { name: /Joueur : Joueur/ })).toBeVisible()
    await expectNoHorizontalScroll(page)
  })

  test('glisser la carte change de map', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'geste à la souris sur ordinateur ; le toucher suit le même code')
    const viewport = page.locator('[data-drop-zone-map-viewport]')
    await viewport.scrollIntoViewIfNeeded()
    const box = (await viewport.boundingBox())!
    // Loin des épingles et des boutons posés sur la carte : un glissé qui part d'un bouton reste un clic.
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.72)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.72, { steps: 8 })
    await page.mouse.up()
    await expect(activeMap(page)).toHaveText('Miramar')
  })

  test('bandeau docké : une seule ligne avec la carte, aussi sur mobile (exception nommée)', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    await dock(page)
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
    await expect(toolbar(page).getByRole('button', { name: 'Carte suivante' })).toBeVisible()
    await expect(periodFilter(page)).toBeVisible()
    const height = (await toolbar(page).boundingBox())!.height
    expect(height).toBeLessThan(80)
    await expectNoHorizontalScroll(page)
  })

  test('la période recharge la carte ; plus de panneaux sous « Qui saute où » (maquette, 2026-09-27)', async ({ api, page }) => {
    await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
    await expect(page).toHaveURL(/[?&]period=month\b/)
    await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/telemetry/drop-zones`, 'period').at(-1)).toBe('month')
    await expect(page.getByRole('heading', { name: 'Pression au drop' })).toHaveCount(0)
    await expect(page.getByText(/Villes et zones de combat/i)).toHaveCount(0)
    // Les routes des anciens panneaux ne sont plus appelées (sinon l'appel, sans réponse prévue, ferait échouer le test).
    expect(api.paramValues(`/api/clans/${CLAN_ID}/drop-pressure-stats`, 'period')).toEqual([])
    expect(api.paramValues(`/api/clans/${CLAN_ID}/city-insights`, 'period')).toEqual([])
  })
})

test.describe('Zones de drop d’un joueur', () => {
  test.beforeEach(async ({ api, page }) => {
    mockMemberDropZones(api)
    await page.goto(`/members/${MEMBER_ID}/drop-zones`)
    await expect(page.getByRole('heading', { level: 1, name: 'Zones de drop' })).toBeVisible()
    await expect(pins(page).first()).toBeVisible()
  })

  test('même lecture ; le menu du bandeau choisit le périmètre (joueur, meilleur duo, clan, autre joueur)', async ({ api, page }) => {
    await expect(page.getByTestId('favorite-spot')).toContainText('Spot favori · Joueur Alpha')
    await expect(page.getByRole('region', { name: 'Qui saute où' })).toHaveCount(0)
    await toolbar(page).getByRole('button', { name: /Périmètre/ }).click()
    await expect(page.getByRole('menuitemradio', { name: /Son meilleur duo/ })).toBeVisible()
    await page.getByRole('menuitemradio', { name: 'Tout le clan' }).click()
    await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/telemetry/drop-zones`, 'scope').at(-1)).toBe('clan')
    await expect(page.getByRole('list', { name: 'Joueurs de la carte' })).toBeVisible()
  })

  test('pression au drop et villes du joueur sous la carte, même période', async ({ api, page }) => {
    await expect(page.getByRole('region', { name: 'Pression au drop et villes' })).toBeVisible()
    await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
    for (const path of ['telemetry/drop-zones', 'drop-pressure', 'city-insights']) {
      await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/${path}`, 'period').at(-1)).toBe('month')
    }
    await expectNoHorizontalScroll(page)
  })
})
