import { expect, test } from './support/api'
import { mockPubgApiCalls } from './support/pubg-api'
import { mockMemberSession, withSessionCookie } from './support/session'

/**
 * API PUBG (/settings/pubg-api, SuperUser) — docs/TODO/fraicheur-des-parties.md : les 404 attendus (partie pas encore
 * publiée) ne rougissent plus la grille ; un échec « à traiter » ou trois passagers, si. Échecs du jour par classe, quota
 * de la dernière heure par priorité. Toutes les API sont simulées.
 */

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

test('grille du jour : 404 attendus en vert, un 403 en rouge, deux 502 en vert', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  mockPubgApiCalls(api)
  await page.goto('/settings/pubg-api')

  const activity = page.locator('#pubg-api-activity').locator('xpath=ancestor::section[1]')
  await expect(page.getByRole('heading', { level: 2, name: 'Activité du jour' })).toBeVisible()
  const cell = (fragment: string) => activity.locator(`span[title*="${fragment}"]:visible`).first()
  await expect(cell('4 attendu')).toHaveAttribute('style', /--game-pos/)
  await expect(cell('1 à traiter')).toHaveAttribute('style', /--game-neg/)
  await expect(cell('2 passager')).toHaveAttribute('style', /--game-pos/)
  await expect(activity.getByText('En ordre (404 attendus compris)')).toBeVisible()
})

test('échecs du jour classés, du plus grave au moins grave, avec ce qu’il faut en faire', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  mockPubgApiCalls(api)
  await page.goto('/settings/pubg-api')

  const failures = page.locator('#pubg-api-top-errors').locator('xpath=ancestor::section[1]')
  await expect(page.getByRole('heading', { level: 2, name: 'Échecs du jour' })).toBeVisible()
  await expect(failures.getByTestId('pubg-api-failure-classes')).toHaveText('À traiter : 1Passager : 2Attendu : 4')
  await expect(failures.getByRole('listitem').nth(0)).toContainText('403 · Recherche joueur')
  await expect(failures.getByRole('listitem').nth(2)).toContainText('partie pas encore publiée (reprise au tour suivant)')
})

test('quota de la dernière heure : jauge par priorité, à 70 % en ordre, à 97 % au plafond', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  mockPubgApiCalls(api, { quotaLimited: 420 })
  await page.goto('/settings/pubg-api')

  const quota = page.getByTestId('pubg-api-quota')
  await expect(quota).toContainText('420 / 600')
  await expect(quota.getByText('70 %')).toHaveAttribute('style', /--game-pos/)
  await expect(quota).toContainText('Synchronisation des parties et tournois : 126')
  await expect(quota).toContainText('la synchronisation des parties passe devant')

  mockPubgApiCalls(api, { quotaLimited: 582 })
  await page.reload()
  await expect(page.getByTestId('pubg-api-quota').getByText('97 %')).toHaveAttribute('style', /--game-neg/)
})
