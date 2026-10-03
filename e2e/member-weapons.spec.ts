import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { MEMBER_ID } from './support/data'
import { appHeader, dock, periodFilter, toolbar } from './support/layout'
import { mockMemberArsenal, signInAsClanMember } from './support/member-weapons'

/**
 * Armes d'un joueur — docs/features/armes-joueur.md (maquette « Armes joueur », 2026-09-27). Deux onglets : « Suivi par
 * le site » (télémétrie de la période) et « Carrière PUBG » (maîtrise officielle). Cartes paginées au lieu de tableaux,
 * bandeau sur une ligne qui colle aussi sur mobile.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const count = (value: number) => new Intl.NumberFormat('fr-FR').format(value)
const weaponsApi = `/api/members/${MEMBER_ID}/telemetry/weapons`
const throwsApi = `/api/members/${MEMBER_ID}/throwables`
const masteryApi = `/api/members/${MEMBER_ID}/weapon-mastery`

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

const rack = (page: Page) => page.getByRole('list', { name: 'Ton râtelier' })
const mastery = (page: Page) => page.getByRole('list', { name: 'Maîtrise par arme' })
const pubgTab = (page: Page) => toolbar(page).getByRole('button', { name: /^(Carrière PUBG|PUBG)$/ })

test.describe('onglet « Suivi par le site »', () => {
  test.beforeEach(async ({ api, page }) => {
    mockMemberArsenal(api)
    await page.goto(`/members/${MEMBER_ID}/weapons`)
    await expect(page.getByRole('heading', { level: 1, name: "L'arsenal de Joueur Alpha" })).toBeVisible()
    await expect(page.getByRole('article', { name: 'Arme de prédilection' })).toContainText('M416')
  })

  test('arme de prédilection : variantes fusionnées (M416 et M416 de Duncan)', async ({ page }) => {
    const favourite = page.getByRole('article', { name: 'Arme de prédilection' })
    await expect(favourite).toContainText('cette semaine')
    await expect(favourite).toContainText("Fusils d'assaut · 11 parties")
    await expect(favourite.getByRole('definition')).toHaveText(['18', '24 %', '28 %', '187 m'])
  })

  test('loadout : règle de l’armurerie, lancers de la période en emplacement 5', async ({ api, page }) => {
    const slots = page.getByRole('list', { name: 'Emplacements du sac' })
    await expect(slots.getByRole('listitem').nth(0)).toContainText('M416')
    // La secondaire vient d'une autre famille : pas la Beryl (fusil d'assaut), le Mini 14.
    await expect(slots.getByRole('listitem').nth(1)).toContainText('Mini 14')
    await expect(slots.getByRole('listitem').nth(2)).toContainText('P1911')
    await expect(slots.getByRole('listitem').nth(3)).toContainText('Poêle')
    await expect(page.getByTestId('throw-chip')).toHaveCount(4)
    await expect(page.getByTestId('throw-chip').first()).toHaveText('Grenade ×14')
    // La pomme lancée pour le jeu n'est pas un lancer de combat : 5 lancers, 4 affichés.
    await expect(slots).toContainText('+1 autre')
    await expect(slots).not.toContainText('Pomme')
    expect(api.paramValues(throwsApi, 'period').at(-1)).toBe('week')
  })

  test('records : une ligne hors arme ne bat jamais le Kar98k, seuils de tirs et de kills', async ({ page }) => {
    await expect(page.getByRole('article', { name: 'Kill le plus long' })).toContainText('412 m')
    await expect(page.getByRole('article', { name: 'Kill le plus long' })).toContainText('au Kar98k')
    await expect(page.getByRole('article', { name: 'Meilleure précision' })).toContainText('32 %')
    await expect(page.getByRole('article', { name: 'Meilleure précision' })).toContainText('au Mini 14')
    await expect(page.getByRole('article', { name: 'Headshot machine' })).toContainText('67 %')
  })

  test('râtelier en cartes paginées, médailles, tri et aucun défilement horizontal', async ({ page }, testInfo) => {
    const perPage = isMobile(testInfo) ? 4 : 6
    await expect(rack(page).getByRole('listitem')).toHaveCount(perPage)
    await expect(page.getByRole('navigation', { name: 'Pages · Ton râtelier' })).toContainText(isMobile(testInfo) ? '1 / 3' : '1 / 2')
    await expect(rack(page).getByRole('article', { name: 'M416' }).getByRole('img', { name: 'Rang 1, médaille d’or' })).toBeVisible()
    await expect(page.getByText('None', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Distance' }).click()
    await expect(rack(page).getByRole('article').first()).toHaveAccessibleName('Kar98k')
    await page.getByRole('navigation', { name: 'Pages · Ton râtelier' }).getByRole('button', { name: 'Page suivante' }).click()
    await expect(page.getByRole('navigation', { name: 'Pages · Ton râtelier' })).toContainText('2 /')
    await expectNoHorizontalScroll(page)
  })

  test('catégorie : pastille colorée, liste filtrée, adresse partageable', async ({ page }) => {
    await toolbar(page).getByTestId('category-chip').click()
    await page.getByRole('menuitemradio', { name: /Snipers/ }).click()
    await expect(toolbar(page).getByTestId('category-chip')).toHaveAttribute('aria-label', 'Catégorie : Snipers')
    await expect(rack(page).getByRole('article')).toHaveCount(1)
    await expect(rack(page).getByRole('article').first()).toHaveAccessibleName('Kar98k')
    await expect(page).toHaveURL(/[?&]cat=SR/)
    // Le loadout et les records restent ceux de toute la période.
    await expect(page.getByRole('article', { name: 'Arme de prédilection' })).toContainText('M416')
  })

  test('la période recharge la télémétrie et les lancers, pas la maîtrise', async ({ api, page }) => {
    const masteryCalls = api.served.filter((call) => call.url.pathname === masteryApi).length
    await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
    await expect.poll(() => api.paramValues(weaponsApi, 'period').at(-1)).toBe('month')
    await expect.poll(() => api.paramValues(throwsApi, 'period').at(-1)).toBe('month')
    await expect(page.getByRole('article', { name: 'Arme de prédilection' })).toContainText('ce mois')
    expect(api.served.filter((call) => call.url.pathname === masteryApi).length).toBe(masteryCalls)
  })

  test('bandeau docké sur une ligne, aussi sur mobile : onglet, période, catégorie', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    await dock(page)
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
    await expect(pubgTab(page)).toBeVisible()
    await expect(periodFilter(page)).toBeVisible()
    await expect(toolbar(page).getByTestId('category-chip')).toBeVisible()
    expect((await toolbar(page).boundingBox())!.height).toBeLessThan(80)
    await expectNoHorizontalScroll(page)
  })
})

test.describe('onglet « Carrière PUBG »', () => {
  test('arme la plus maîtrisée, carrière, niveaux d’expert ; la synchro remplace la période', async ({ api, page }, testInfo) => {
    mockMemberArsenal(api)
    await page.goto(`/members/${MEMBER_ID}/weapons`)
    await pubgTab(page).click()
    await expect(page).toHaveURL(/[?&]source=pubg/)
    const hero = page.getByRole('article', { name: 'Arme la plus maîtrisée' })
    await expect(hero).toContainText('M416')
    await expect(hero).toContainText('99')
    await expect(hero.getByTestId('expert-badge')).toHaveText('EXPERT 6')
    await expect(periodFilter(page)).toHaveCount(0)
    // Visiteur : la date de synchro, sans bouton.
    await expect(toolbar(page).getByTestId('mastery-sync')).toContainText(isMobile(testInfo) ? '2 h' : 'Synchro il y a 2 h')
    await expect(toolbar(page).getByRole('button', { name: /Rafraîchir/ })).toHaveCount(0)
    const career = page.getByRole('region', { name: 'Carrière PUBG' })
    await expect(career).toContainText(count(13074))
    await expect(career.getByRole('list', { name: 'Armes par niveau d’expert' })).toContainText('Avant le niveau 100 · 3')
    await expect(career.getByRole('list', { name: 'Armes par niveau d’expert' })).toContainText('Expert 6 · 1')
    // La poêle jamais utilisée n'a pas de carte.
    await expect(page.getByRole('article', { name: 'Poêle' })).toHaveCount(0)
    await expect(mastery(page).getByRole('listitem')).toHaveCount(isMobile(testInfo) ? 4 : 6)
    await expectNoHorizontalScroll(page)
  })

  test('lien direct : onglet et catégorie lus dans l’adresse', async ({ api, page }) => {
    mockMemberArsenal(api)
    await page.goto(`/members/${MEMBER_ID}/weapons?source=pubg&cat=AR`)
    await expect(page.getByRole('article', { name: 'Arme la plus maîtrisée' })).toContainText('M416')
    await expect(mastery(page).getByRole('article')).toHaveCount(2)
    await expect(mastery(page).getByRole('article').nth(1)).toHaveAccessibleName('Beryl M762')
    await page.getByRole('button', { name: 'Kills' }).click()
    await expect(mastery(page).getByRole('article').first()).toHaveAccessibleName('M416')
  })

  test('membre du clan connecté : le bouton rafraîchit puis recharge la maîtrise', async ({ api, page }) => {
    mockMemberArsenal(api)
    signInAsClanMember(api)
    await page.goto(`/members/${MEMBER_ID}/weapons?source=pubg`)
    const refresh = toolbar(page).getByRole('button', { name: /Rafraîchir la maîtrise PUBG/ })
    await expect(refresh).toBeVisible()
    await refresh.click()
    await expect.poll(() => api.served.some((call) => call.method === 'POST' && call.url.pathname === masteryApi)).toBe(true)
    await expect.poll(() => api.paramValues(masteryApi, 'v').at(-1)).toBe('1')
  })
})

test('bandeau : tous les contrôles ont la hauteur du rail, sur les deux onglets', async ({ api, page }) => {
  mockMemberArsenal(api)
  await page.goto(`/members/${MEMBER_ID}/weapons?period=all`)
  await expect(page.getByRole('article', { name: 'Arme de prédilection' })).toBeVisible()
  // Segmented (icônes comprises), synchro et menu de catégorie : une seule hauteur par ligne (docs/ui/index.html).
  const heights = () =>
    toolbar(page).evaluate((bar) =>
      [...bar.querySelectorAll('.app-segmented-control, [data-testid="mastery-sync"], [data-testid="category-chip"]')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => Math.round(el.getBoundingClientRect().height))
    )
  const site = await heights()
  expect(site.length).toBeGreaterThanOrEqual(3)
  expect(new Set(site).size).toBe(1)

  await pubgTab(page).click()
  await expect(page.getByRole('article', { name: 'Arme la plus maîtrisée' })).toBeVisible()
  const pubg = await heights()
  expect(pubg.length).toBeGreaterThanOrEqual(3)
  expect(new Set(pubg).size).toBe(1)
})
