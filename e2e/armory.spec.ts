import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID, PLAYERS } from './support/data'
import { periodFilter, toolbar } from './support/layout'
import { mockClanWeapons } from './support/pages'

/**
 * L'armurerie du clan — docs/features/weapons.md §7. Une seule page pour les armes : la catégorie vit dans l'URL
 * (`?cat=`), l'ancienne page « Catégories armes » y redirige, changer de catégorie ne recharge rien. Données fictives :
 * 24 joueurs × 7 armes (e2e/support/data.ts), soit 168 lignes et dix catégories (aucune ligne « Autre »).
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const ARMORY = `/clans/${CLAN_ID}/stats/weapons`
const WEAPONS_API = `/api/clans/${CLAN_ID}/telemetry/weapons`

const pager = (page: Page) => page.getByRole('region', { name: "Catégorie d'armes" })
const table = (page: Page) => page.getByRole('table')
const header = (page: Page, name: string) => table(page).getByRole('columnheader', { name, exact: true })
const tablePages = (page: Page) => page.getByRole('navigation', { name: 'Pages du classement' })

async function openArmory(page: Page, query = '') {
  await page.goto(`${ARMORY}${query}`)
  await expect(page.getByRole('heading', { name: "L'armurerie du clan" })).toBeVisible()
  await expect(pager(page)).toBeVisible()
}

test.beforeEach(({ api }) => {
  mockClanWeapons(api)
})

test('« Tout l’arsenal » par défaut : loadout du clan, compteur 1 / 11', async ({ page }) => {
  await openArmory(page)
  await expect(pager(page)).toContainText("Tout l'arsenal")
  await expect(pager(page)).toContainText('1 / 11')
  await expect(page.getByRole('heading', { name: 'Le loadout du clan' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Le râtelier' })).toHaveCount(0)
  // Fixture : la M416 a le plus de kills ; aucune arme de mêlée, l'emplacement 4 reste vide.
  await expect(page.getByRole('button', { name: /^Arme principale : M416/ })).toBeVisible()
  await expect(page.getByText('Emplacement vide')).toBeVisible()
  await expect(page.getByText(/Arme signature : M416/)).toBeVisible()
})

test('les chevrons changent de catégorie, l’URL suit, sans recharger les données', async ({ api, page }) => {
  await openArmory(page)
  await page.waitForLoadState('networkidle')
  const calls = api.paramValues(WEAPONS_API, 'period').length

  await page.getByRole('button', { name: 'Catégorie suivante' }).click()
  await expect(pager(page)).toContainText("Fusils d'assaut")
  await expect(pager(page)).toContainText('2 / 11')
  await expect(page).toHaveURL(/[?&]cat=AR\b/)
  await expect(page.getByRole('heading', { name: 'Le râtelier' })).toBeVisible()
  await expect(page.getByText('Conseil pro')).toBeVisible()

  await page.getByRole('button', { name: 'Catégorie précédente' }).click()
  await page.getByRole('button', { name: 'Catégorie précédente' }).click()
  await expect(pager(page)).toContainText('Spécial')
  await expect(page).toHaveURL(/[?&]cat=SPECIAL\b/)

  expect(api.paramValues(WEAPONS_API, 'period')).toHaveLength(calls)
})

test('un emplacement du loadout ouvre sa catégorie', async ({ page }) => {
  await openArmory(page)
  await page.getByRole('button', { name: /^Lancer : Grenade/ }).click()
  await expect(pager(page)).toContainText('Explosifs')
  await expect(page).toHaveURL(/[?&]cat=THROWABLE\b/)
  await expect(page.getByText('Des dégâts de zone, sans viser.', { exact: false })).toBeVisible()
  await expect(page.getByText('Conseil pro')).toBeVisible()
  await expect(page.getByText('Part des kills du clan')).toBeVisible()
})

test('lien direct vers une catégorie, conservée au changement de période', async ({ api, page }) => {
  await openArmory(page, '?cat=sr')
  await expect(pager(page)).toContainText('Snipers')
  await expect(page.getByText('Dégâts massifs par tir.', { exact: false })).toBeVisible()

  await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
  await expect(page).toHaveURL(/[?&]period=month\b/)
  await expect(page).toHaveURL(/[?&]cat=SR\b/)
  await expect.poll(() => api.paramValues(WEAPONS_API, 'period').at(-1)).toBe('month')
  await expect(pager(page)).toContainText('Snipers')
})

test('l’ancienne page « Catégories armes » redirige vers l’armurerie, période comprise', async ({ page }) => {
  // Vraie redirection HTTP (next.config.ts) : le shell de l'ancienne URL n'est jamais rendu.
  const response = await page.request.get(`/clans/${CLAN_ID}/stats/weapons/categories?period=month`, { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  const location = new URL(response.headers().location, 'http://localhost')
  expect(location.pathname).toBe(ARMORY)
  expect(Object.fromEntries(location.searchParams)).toEqual({ cat: 'AR', period: 'month' })

  await page.goto(`/clans/${CLAN_ID}/stats/weapons/categories?period=month`)
  await expect(page).toHaveURL(new RegExp(`^[^?]*${ARMORY}\\?`))
  await expect(pager(page)).toContainText("Fusils d'assaut")

  await page.goto(`/clans/${CLAN_ID}/stats/weapons/categories?cat=smg`)
  await expect(page).toHaveURL(/[?&]cat=SMG\b/) // forme canonique réécrite par la page
  await expect(pager(page)).toContainText('Pistolets-mitrailleurs')
})

test('le filtre joueur réduit le classement à ses armes', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'même logique sur mobile ; le menu est vérifié sur ordinateur et tablette')
  await openArmory(page)
  await expect(page.getByText('168 lignes')).toBeVisible()

  await toolbar(page).locator('#weapon-player-dropdown').click()
  await page.locator('#weapon-player-dropdown-menu').getByText(PLAYERS[1].displayName, { exact: true }).click()
  await expect(page.getByText('7 lignes')).toBeVisible()
})

test.describe('ordinateur et tablette', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(isMobile(testInfo), 'le tableau est remplacé par la liste mobile sous 768 px')
  })

  test('tri par les en-têtes et pagination numérotée', async ({ page }) => {
    await openArmory(page)
    await expect(header(page, 'Kills')).toHaveAttribute('aria-sort', 'descending')
    await expect(tablePages(page).getByText('Lignes 1–8 sur 168')).toBeVisible()

    await page.getByRole('navigation', { name: 'Pages du classement' }).getByRole('button', { name: '2', exact: true }).click()
    await expect(tablePages(page).getByText('Lignes 9–16 sur 168')).toBeVisible()

    // Changer de tri ramène à la première page.
    await header(page, 'Précision').getByRole('button').click()
    await expect(header(page, 'Précision')).toHaveAttribute('aria-sort', 'descending')
    await expect(tablePages(page).getByText('Lignes 1–8 sur 168')).toBeVisible()

    // Tirs et touches passent dans l'infobulle de la précision.
    await expect(table(page).locator('tbody td[title="120 touches sur 400 tirs"]').first()).toBeVisible()
  })

  test('podium recalculé sur la catégorie affichée', async ({ page }) => {
    await openArmory(page, '?cat=SMG')
    await expect(table(page).locator('tbody tr').first().getByRole('img', { name: /Rang 1/ })).toBeVisible()
  })
})

test('mobile : liste de classement à puces « Trier par », sans tableau', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'vérification propre à la largeur mobile')
  await openArmory(page)
  await expect(page.getByRole('group', { name: 'Trier par' })).toBeVisible()
  await expect(table(page)).toBeHidden()
})

test('mobile : au-delà de 15 lignes, pagination plutôt que « Afficher les N autres »', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'vérification propre à la largeur mobile')
  await openArmory(page)
  const pages = page.getByRole('navigation', { name: 'Pages de la liste du classement' })
  await expect(page.getByRole('button', { name: /Afficher les \d+ autres/ })).toHaveCount(0)
  await expect(pages.getByText('Lignes 1–8 sur 168')).toBeVisible()

  await pages.getByRole('button', { name: '2', exact: true }).click()
  await expect(pages.getByText('Lignes 9–16 sur 168')).toBeVisible()

  // Changer de tri ramène à la première page.
  await page.getByRole('group', { name: 'Trier par' }).getByRole('button', { name: 'Dégâts' }).click()
  await expect(pages.getByText('Lignes 1–8 sur 168')).toBeVisible()
})
