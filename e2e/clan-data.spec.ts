import { expect, test } from './support/api'
import { mockClanData } from './support/clan-data'
import { CLAN_ID } from './support/data'
import { withSessionCookie } from './support/session'

/**
 * « Données » d'un clan ramenées à trois onglets (docs/TODO/administration.md §8) : Santé (files nommées, pipeline),
 * Récupérations (échecs des deux files avec relance), Soirées, et redirections des onglets supprimés. Toutes les API
 * sont simulées : les relances sont notées, jamais exécutées.
 */

const DATA = `/clans/${CLAN_ID}/settings/data`

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

async function horizontalOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

async function expectThreeTabs(page: import('@playwright/test').Page, isMobile: boolean) {
  const nav = page.getByRole('navigation', { name: 'Données du clan' })
  if (isMobile) {
    await nav.getByRole('button', { name: /^Données du clan :/ }).click()
    await expect(nav.getByRole('menuitem')).toHaveText(['Santé des données', 'Soirées', 'Récupérations'])
    await nav.getByRole('button', { name: /^Données du clan :/ }).click()
  } else {
    await expect(nav.getByRole('link')).toHaveText(['Santé des données', 'Soirées', 'Récupérations'])
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`Santé (${theme === 'light' ? 'clair' : 'sombre'}) : couverture, pipeline et deux files nommées`, async ({ api, page, isMobile }, testInfo) => {
    await page.addInitScript((value) => window.localStorage.setItem('pubg_app_theme', value), theme)
    mockClanData(api)
    await page.goto(DATA)

    await expect(page.getByRole('heading', { level: 1, name: 'Santé des données' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-app-theme', theme)
    await expectThreeTabs(page, isMobile)

    // Couverture : 7 parties sans télémétrie, dont 2 expirées → lien de mise en file vers Récupérations.
    await expect(page.getByRole('link', { name: 'Mettre en file →' })).toHaveAttribute('href', `${DATA}/recoveries#couverture`)

    const pipeline = page.getByRole('region', { name: 'Pipeline de récupération' })
    await expect(pipeline.getByText('50 %').first()).toBeVisible()
    await expect(pipeline.getByText('Taux d’échec des jobs')).toBeVisible()
    await expect(pipeline.getByText('4,2 s').first()).toBeVisible()

    const queues = page.getByRole('region', { name: 'Files du worker pour ce clan' })
    await expect(queues.getByText('Récupération PUBG')).toBeVisible()
    await expect(queues.getByText('Retraitement de fichiers')).toBeVisible()
    await expect(queues.getByRole('link', { name: 'Voir les échecs →' }).first()).toHaveAttribute('href', `${DATA}/recoveries#echecs`)
    // Plus de réordonnancement de la file (aucun usage, passe devant les autres clans).
    await expect(page.getByRole('button', { name: /Réordonner/ })).toHaveCount(0)

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await page.screenshot({ path: testInfo.outputPath(`sante-${theme}.png`), fullPage: true })
  })
}

test('Récupérations : échecs des deux files et relance, sans le moteur global', async ({ api, page, isMobile }, testInfo) => {
  const calls = mockClanData(api)
  await page.goto(`${DATA}/recoveries`)

  await expect(page.getByRole('heading', { level: 1, name: 'Récupérations' })).toBeVisible()
  await expectThreeTabs(page, isMobile)
  await expect(page.getByText('Moteur et file d’attente')).toHaveCount(0)
  await expect(page.getByText('Santé de la télémétrie')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Moteur et tous les clans' })).toHaveAttribute('href', '/settings/telemetry')

  const failures = page.getByRole('region', { name: 'Échecs' })
  await expect(failures.getByText('PUBG a répondu 503')).toBeVisible()
  await expect(failures.getByText('Fichier capturé introuvable')).toBeVisible()
  // L'échec expiré n'est pas relançable : seulement compté.
  await expect(failures.getByText('Fichier expiré chez PUBG')).toHaveCount(0)
  await expect(failures).toContainText('parce que le fichier a expiré chez PUBG')

  const pubgRow = failures.getByRole('listitem').filter({ hasText: 'PUBG a répondu 503' })
  await pubgRow.getByRole('button', { name: 'Relancer' }).click()
  await expect.poll(() => calls.enqueued).toEqual([{ squadMatchIds: ['sm-ko'] }])
  await expect(pubgRow.getByText('En file')).toBeVisible()

  const fileRow = failures.getByRole('listitem').filter({ hasText: 'Fichier capturé introuvable' })
  await fileRow.getByRole('button', { name: 'Relancer' }).click()
  await expect.poll(() => calls.deadLetter).toEqual([{ jobIds: ['file-job-1'] }])

  // L'historique mène à la soirée des Données, là où l'on agit sur la partie.
  const history = page.getByRole('region', { name: 'Historique des récupérations' })
  await expect(history.getByRole('link', { name: 'Soirée' }).first()).toHaveAttribute('href', new RegExp(`^${DATA}/sessions/\\d{4}-\\d{2}-\\d{2}\\?period=`))

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: testInfo.outputPath('recuperations.png'), fullPage: true })
})

test('anciens onglets : redirigés vers leur nouvelle place', async ({ api, page }) => {
  mockClanData(api)

  await page.goto(`${DATA}/errors`)
  await expect(page).toHaveURL(`${DATA}/recoveries#echecs`)
  await expect(page.getByRole('region', { name: 'Échecs' })).toBeVisible()

  await page.goto(`${DATA}/state`)
  await expect(page).toHaveURL(DATA)
  await expect(page.getByRole('heading', { level: 1, name: 'Santé des données' })).toBeVisible()

  await page.goto(`${DATA}/sync`)
  await expect(page).toHaveURL(`${DATA}/sessions`)
  await expect(page.getByRole('heading', { level: 1, name: 'Soirées' })).toBeVisible()
})
