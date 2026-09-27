import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { mockCareerApis } from './support/career'
import { MEMBER_ID } from './support/data'
import { appHeader, dock, toolbar } from './support/layout'
import { signInAsClanMember } from './support/member-weapons'
import { mockMemberProfile } from './support/members'

/**
 * Carrière PUBG d'un joueur — docs/features/carriere-joueur.md (maquette « Stats joueur », 2026-09-27). Plaque et états
 * de service par mode, saisons (Ranked par défaut quand la saison en a), vitrine des médailles du clan, hauts faits,
 * fiches ; bandeau mode + synchro qui colle aussi sur mobile (page sans période).
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const statsApi = `/api/members/${MEMBER_ID}/stats`

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

const service = (page: Page) => page.getByRole('article', { name: 'États de service' })
const modeButton = (page: Page, name: string) => toolbar(page).getByRole('button', { name, exact: true })

async function openCareer(page: Page, query = '') {
  await page.goto(`/members/${MEMBER_ID}/stats${query}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Carrière PUBG' })).toBeVisible()
  await expect(service(page)).toBeVisible()
}

test.describe('visiteur', () => {
  test.beforeEach(async ({ api, page }) => {
    mockMemberProfile(api)
    mockCareerApis(api)
    await openCareer(page)
  })

  test('plaque et états de service ; le mode change les chiffres et l’adresse, Solo absent est désactivé', async ({ page }) => {
    await expect(page.getByTestId('dog-tag')).toContainText('Alpha_FR')
    await expect(page.getByTestId('dog-tag')).toContainText('Clan Démo · [DEMO]')
    await expect(service(page).getByRole('definition')).toHaveText(['42', new Intl.NumberFormat('fr-FR').format(3412), '2,89', '612 k'])
    await expect(modeButton(page, 'Solo')).toBeDisabled()
    await modeButton(page, 'Squad').click()
    await expect(page).toHaveURL(/[?&]mode=squad/)
    await expect(service(page)).toContainText('ÉTATS DE SERVICE · SQUAD')
    await expect(service(page).getByRole('definition').first()).toHaveText('34')
  })

  test('saisons : Ranked par défaut (la saison en cours en a), palier suivant, puis Normal (TPP + FPP)', async ({ page }) => {
    const seasons = page.getByRole('region', { name: 'Saisons' })
    await expect(seasons.getByTestId('current-tier')).toHaveText('Or 2')
    await expect(seasons).toContainText('meilleur : Platine 4')
    await expect(seasons).toContainText('50 pts avant Or 1')
    await expect(seasons.getByRole('list', { name: 'Saisons classées' }).getByRole('listitem')).toHaveCount(3)
    await seasons.getByRole('button', { name: 'Normal' }).click()
    const normal = seasons.getByRole('list', { name: 'Saisons normales' })
    await expect(normal.getByRole('listitem').first()).toContainText('33 parties')
    await expect(normal.getByRole('listitem').first()).toContainText('K/D 8,37')
  })

  test('vitrine du clan : chaque stat médaillée ; les fiches montrent la médaille en « Tous » seulement', async ({ page }) => {
    const showcase = page.getByRole('region', { name: 'Vitrine du clan' })
    await expect(showcase.getByRole('list', { name: 'Stats médaillées' }).getByRole('listitem')).toHaveCount(3)
    await expect(showcase.getByRole('listitem').first()).toContainText('Kills')
    await expect(showcase.getByTestId('medal-counts')).toContainText('×1')
    const combat = page.getByRole('region', { name: 'Combat' })
    await expect(combat.getByRole('img', { name: 'Or · 1er du clan' })).toBeVisible()
    await modeButton(page, 'Duo').click()
    await expect(showcase).toContainText('Calculée sur tous les modes.')
    await expect(combat.getByRole('img')).toHaveCount(0)
  })

  test('hauts faits et phrases calculées (objets utilisés, pas des points de vie)', async ({ page }) => {
    const records = page.getByRole('list', { name: 'Hauts faits' })
    await expect(records).toContainText('612 m')
    await expect(records).toContainText('9 kills')
    await expect(records).toContainText('31 min')
    await expect(page.getByRole('region', { name: 'Victoire et survie' })).toContainText('Un chicken dinner toutes les 29 parties en moyenne.')
    await expect(page.getByRole('region', { name: 'Soutien' })).toContainText('3 soins et boosts par partie en moyenne.')
    await expect(page.getByRole('region', { name: 'Déplacements' })).toContainText('150 traversées d’Erangel')
  })

  test('synchro : la date seule pour un visiteur', async ({ page }, testInfo) => {
    await expect(toolbar(page).getByTestId('career-sync')).toContainText(isMobile(testInfo) ? '3 h' : 'Synchro PUBG il y a 3 h')
    await expect(toolbar(page).getByRole('button', { name: /Rafraîchir/ })).toHaveCount(0)
  })

  test('bandeau docké sur une ligne, aussi sur mobile (page sans période)', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    await dock(page)
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
    await expect(modeButton(page, 'Squad')).toBeVisible()
    await expect(toolbar(page).getByTestId('career-sync')).toBeVisible()
    expect((await toolbar(page).boundingBox())!.height).toBeLessThan(80)
    await expectNoHorizontalScroll(page)
  })
})

test('lien direct : le mode est lu dans l’adresse', async ({ api, page }) => {
  mockMemberProfile(api)
  mockCareerApis(api)
  await openCareer(page, '?mode=duo')
  await expect(modeButton(page, 'Duo')).toHaveAttribute('aria-pressed', 'true')
  await expect(service(page).getByRole('definition').nth(1)).toHaveText('717')
})

test('membre du clan connecté : la synchro rafraîchit carrière et saisons, puis recharge', async ({ api, page }) => {
  mockMemberProfile(api)
  mockCareerApis(api)
  signInAsClanMember(api)
  await openCareer(page)
  const refresh = toolbar(page).getByRole('button', { name: /Rafraîchir la carrière PUBG/ })
  await expect(refresh).toBeVisible()
  await refresh.click()
  await expect.poll(() => api.served.filter((call) => call.method === 'POST').map((call) => call.url.pathname).sort()).toEqual([
    `/api/members/${MEMBER_ID}/season-stats`,
    statsApi,
  ])
  await expect.poll(() => api.paramValues(statsApi, 'v').at(-1)).toBe('1')
})
