import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { MEMBER_ID } from './support/data'
import { appHeader, dock, periodFilter, toolbar } from './support/layout'
import { mockMemberNemesis } from './support/nemesis'

/**
 * Némésis — docs/features/nemesis.md (maquette « Némésis », 2026-09-27). Face-à-face et revanche (duel inverse de
 * l'API), bilan, chasseurs et proies paginés (onglets sur mobile), death cam, période et arme dans le bandeau qui colle
 * aussi sur mobile.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

test.beforeEach(async ({ api, page }) => {
  mockMemberNemesis(api)
  await page.goto(`/members/${MEMBER_ID}/nemesis`)
  await expect(page.getByRole('heading', { level: 1, name: 'Némésis de Joueur Alpha' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Ton némésis' })).toBeVisible()
})

test('face-à-face : némésis, proie favorite et revanche calculée sur le duel inverse', async ({ page }) => {
  const nemesis = page.getByRole('article', { name: 'Ton némésis' })
  await expect(nemesis).toContainText('xSnipeZz')
  await expect(nemesis).toContainText('[TTV]')
  await expect(nemesis).toContainText('×7')
  await expect(nemesis).toContainText('dernière fois il y a 3 j')
  const revenge = page.getByRole('article', { name: 'Revanche' })
  await expect(revenge).toContainText('2–7')
  await expect(page.getByTestId('revenge')).toHaveText('5 kills à rendre')
  await expect(page.getByRole('article', { name: 'Ta proie favorite' })).toContainText('Mouette_91')
  await expect(page.getByRole('article', { name: 'Ta proie favorite' })).toContainText('×9')
})

test('bilan sur une ligne : joueurs, bots et zone à part', async ({ page }) => {
  const tally = page.getByRole('region', { name: 'Bilan' })
  await expect(tally).toContainText('43 kills')
  await expect(tally).toContainText('30 morts')
  await expect(tally).toContainText('1,43 K/D')
  await expect(tally).toContainText('14 bots neutralisés')
  await expect(tally).toContainText('9 morts par la zone')
})

test('chasseurs paginés par 5, duel dans les deux sens, joueur jamais nommé', async ({ page }, testInfo) => {
  const hunters = page.getByRole('list', { name: 'Tes chasseurs' })
  await expect(hunters.getByRole('listitem')).toHaveCount(5)
  await expect(hunters.getByRole('listitem').first().getByTestId('duel-badge')).toHaveText('2–7')
  await expect(hunters.getByRole('listitem').nth(3).getByTestId('duel-badge')).toHaveText('6–3')
  await expect(hunters.getByRole('listitem').nth(4)).toContainText('Joueur inconnu')
  await page.getByRole('navigation', { name: 'Pages · Tes chasseurs' }).getByRole('button', { name: 'Page suivante' }).click()
  await expect(hunters.getByRole('listitem').first()).toContainText('PanzerPoulet')
  if (isMobile(testInfo)) {
    // Sur mobile, un onglet à la fois.
    await expect(page.getByRole('list', { name: 'Tes proies' })).toHaveCount(0)
    await page.getByRole('group', { name: 'Liste affichée' }).getByRole('button', { name: 'Proies' }).click()
    await expect(page.getByRole('list', { name: 'Tes proies' }).getByRole('listitem').first()).toContainText('Mouette_91')
  } else {
    await expect(page.getByRole('list', { name: 'Tes proies' }).getByRole('listitem')).toHaveCount(5)
  }
  await expectNoHorizontalScroll(page)
})

test('death cam : les 5 armes de toutes les morts', async ({ page }) => {
  const cam = page.getByRole('list', { name: 'Armes qui t’ont eu' })
  await expect(cam.getByRole('listitem')).toHaveCount(5)
  await expect(cam.getByRole('listitem').first()).toContainText('11')
})

test('période et arme dans l’API ; la pastille se colore quand une arme est choisie', async ({ api, page }) => {
  await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/nemesis`, 'period').at(-1)).toBe('all')
  await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
  await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/nemesis`, 'period').at(-1)).toBe('month')
  await page.getByTestId('weapon-chip').click()
  await page.getByRole('menuitemradio', { name: /Kar98k/ }).click()
  await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/nemesis`, 'weapon').at(-1)).toBe('Item_Weapon_Kar98k_C')
  await expect(page.getByTestId('weapon-chip')).toHaveAttribute('aria-label', /Kar98k/)
  await expect(page.getByRole('list', { name: 'Tes chasseurs' }).getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('list', { name: 'Tes proies' })).toHaveCount(0)
})

test('bandeau docké sur une ligne, aussi sur mobile, avec la pastille d’arme', async ({ page }) => {
  await page.waitForLoadState('networkidle')
  await expect(appHeader(page)).toBeVisible()
  await dock(page)
  await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
  await expect(page.getByTestId('weapon-chip')).toBeVisible()
  expect((await toolbar(page).boundingBox())!.height).toBeLessThan(80)
  await expectNoHorizontalScroll(page)
})
