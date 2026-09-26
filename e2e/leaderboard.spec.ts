import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID, PLAYERS } from './support/data'
import { dock, toolbar } from './support/layout'
import { mockClanLeaderboard } from './support/pages'

/**
 * Classement du clan, page de référence de la refonte UI — docs/TODO/refonte-ui.md §4.A et phase 1.
 * Tri par les en-têtes (inversion au second clic), colonnes de mode seulement en « Tous », rappel du tri dans le
 * bandeau docké sur ordinateur. Les données fictives classent les joueurs dans le même ordre pour tous les critères.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const FIRST = PLAYERS[0].displayName
const LAST = PLAYERS[PLAYERS.length - 1].displayName

const table = (page: Page) => page.getByRole('table')
const header = (page: Page, name: string | RegExp) =>
  table(page).getByRole('columnheader', typeof name === 'string' ? { name, exact: true } : { name })
const firstRow = (page: Page) => table(page).locator('tbody tr').first()

test.beforeEach(async ({ api, page }) => {
  mockClanLeaderboard(api)
  await page.goto(`/clans/${CLAN_ID}/leaderboard`)
  await expect(page.getByText(FIRST).filter({ visible: true }).first()).toBeVisible()
})

test.describe('ordinateur et tablette', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(isMobile(testInfo), 'le tableau est remplacé par la liste mobile sous 768 px')
  })

  test('un clic sur l’en-tête trie, un second inverse, sans recharger', async ({ api, page }) => {
    const calls = api.paramValues(`/api/clans/${CLAN_ID}/leaderboard`, 'period').length
    await expect(header(page, 'Kills')).toHaveAttribute('aria-sort', 'descending')
    await expect(firstRow(page)).toContainText(FIRST)

    await header(page, 'Kills').getByRole('button').click()
    await expect(header(page, 'Kills')).toHaveAttribute('aria-sort', 'ascending')
    await expect(firstRow(page)).toContainText(LAST)

    await header(page, 'Dégâts').getByRole('button').click()
    await expect(header(page, 'Dégâts')).toHaveAttribute('aria-sort', 'descending')
    await expect(header(page, 'Kills')).toHaveAttribute('aria-sort', 'none')
    await expect(firstRow(page)).toContainText(FIRST)

    expect(api.paramValues(`/api/clans/${CLAN_ID}/leaderboard`, 'period')).toHaveLength(calls)
  })

  test('le rang suit le critère : en tri croissant, la médaille d’or reste au meilleur', async ({ page }) => {
    await header(page, 'Kills').getByRole('button').click()
    await expect(firstRow(page)).toContainText(LAST)
    await expect(table(page).getByRole('img', { name: /Rang 1/ })).toHaveCount(0) // hors des 10 premières lignes
    await page.getByRole('button', { name: /Afficher les \d+ autres joueurs/ }).click()
    await expect(table(page).locator('tbody tr').last().getByRole('img', { name: /Rang 1/ })).toBeVisible()
  })

  test('les colonnes Duo, Trio, Squad n’existent qu’en mode « Tous »', async ({ page }) => {
    // En-têtes à icône : nom accessible « Logo Squad Squad » (TeamModeBadge).
    await expect(header(page, /Squad/)).toBeVisible()
    await toolbar(page).getByRole('button', { name: 'Squad', exact: true }).click()
    await expect(header(page, /Squad/)).toHaveCount(0)
    await expect(header(page, /Duo/)).toHaveCount(0)
  })

  test('le bandeau docké rappelle le tri, pas au repos', async ({ page }) => {
    await expect(toolbar(page).getByText('Tri :')).toHaveCount(0)
    await header(page, 'Win rate').getByRole('button').click()
    await dock(page)
    await expect(toolbar(page).getByText('Tri :')).toBeVisible()
    await expect(toolbar(page)).toContainText('Win rate ↓')
  })

  test('dix lignes, puis le reste à la demande, et le total du clan', async ({ page }) => {
    await expect(table(page).locator('tbody tr')).toHaveCount(10)
    await page.getByRole('button', { name: `Afficher les ${PLAYERS.length - 10} autres joueurs` }).click()
    await expect(table(page).locator('tbody tr')).toHaveCount(PLAYERS.length)
    await expect(table(page).locator('tfoot')).toContainText('Total clan')
  })
})

test.describe('mobile', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!isMobile(testInfo), 'liste mobile seulement sous 768 px')
  })

  test('les puces « Trier par » trient et le bandeau docké ne garde que la période', async ({ page }) => {
    const sortGroup = page.getByRole('group', { name: 'Trier par' })
    await expect(sortGroup.getByRole('button', { name: /Kills/ })).toHaveAttribute('aria-pressed', 'true')
    await sortGroup.getByRole('button', { name: /Kills/ }).click()
    await expect(sortGroup.getByRole('button', { name: /Kills/ })).toContainText('↑')

    await dock(page)
    await expect(toolbar(page).getByText('Tri :')).toHaveCount(0)
  })
})
