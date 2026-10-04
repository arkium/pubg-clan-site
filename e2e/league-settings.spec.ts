import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { toolbar } from './support/layout'
import { mockLeagueSettings, withSessionCookie } from './support/league-settings'

/**
 * Réglages de la ligue — page SuperUser /settings/league (docs/features/ligue-clans.md §5), selon la charte UI :
 * barème, coefficients, pondération, seuils par type et par période, zones et titres ; aperçu du classement avant
 * enregistrement ; erreurs champ par champ ; réservée au SuperUser. Toutes les API sont simulées.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

async function setField(page: Page, testId: string, value: string) {
  const field = page.getByTestId(testId)
  await field.fill(value)
}

test.describe('SuperUser', () => {
  test('valeurs par défaut affichées, aperçu calculé, rien de modifié', async ({ api, page }) => {
    mockLeagueSettings(api)
    await page.goto('/settings/league')
    await expect(page.getByRole('heading', { level: 1, name: 'Réglages de la ligue' })).toBeVisible()
    await expect(page.getByTestId('league-settings-stamp')).toContainText('Réglages par défaut')
    await expect(page.getByTestId('placement-point-1')).toHaveValue('10')
    await expect(page.getByTestId('placement-point-8')).toHaveValue('1')
    await expect(page.getByTestId('weight-placement')).toHaveValue('250')
    await expect(page.getByTestId('threshold-official-week')).toHaveValue('5')
    await expect(page.getByTestId('preview-summary')).toContainText('En vigueur : 5 classés, 1 en qualification (seuil 5)')
    await expect(page.getByTestId('league-settings-dirty')).toHaveCount(0)
    await expect(toolbar(page).getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  test('coefficient modifié : formule, liste des changements, aperçu recalculé, enregistrement', async ({ api, page }, testInfo) => {
    const calls = mockLeagueSettings(api)
    await page.goto('/settings/league')
    await expect(page.getByTestId('preview-summary')).toBeVisible()
    await setField(page, 'weight-placement', '170')
    await expect(page.getByTestId('raw-score-formula')).toContainText('points × 170')
    await expect(page.getByTestId('league-settings-dirty')).toContainText('coefficient du placement : 250 → 170')
    await expect.poll(() => calls.previews.at(-1)?.placementWeight).toBe(170)
    await expect(page.getByTestId('score-shares')).toBeVisible()

    if (isMobile(testInfo)) await page.evaluate(() => window.scrollTo(0, 0))
    await toolbar(page).getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByTestId('league-settings-saved')).toContainText('1 modification')
    expect(calls.saves).toHaveLength(1)
    expect(calls.saves[0].placementWeight).toBe(170)
    await expect(page.getByTestId('league-settings-dirty')).toHaveCount(0)
    await expect(page.getByTestId('league-settings-stamp')).toContainText('admin@example.com')
  })

  test('seuil abaissé : un clan en qualification entre au classement dans l’aperçu', async ({ api, page }) => {
    mockLeagueSettings(api)
    await page.goto('/settings/league')
    await expect(page.getByTestId('preview-summary')).toBeVisible()
    await setField(page, 'threshold-official-week', '4')
    await expect(page.getByTestId('league-settings-dirty')).toContainText('seuil Normal / semaine : 5 → 4 parties')
    await expect(page.getByTestId('preview-summary')).toContainText('avec vos réglages : 6 classés, 0 en qualification (seuil 4)')
    await expect(page.getByTestId('league-preview').getByRole('row', { name: /Clan Charlie/ })).toContainText('classé')
  })

  test('valeur hors bornes : erreur sous le champ, enregistrement bloqué, aperçu suspendu', async ({ api, page }) => {
    mockLeagueSettings(api)
    await page.goto('/settings/league')
    await setField(page, 'zone-end', '2')
    await expect(page.getByText('dernier rang « Dans la zone » : entier entre 4 et 30')).toBeVisible()
    await expect(page.getByTestId('zone-end')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Corrigez les champs en erreur pour voir l’aperçu.')).toBeVisible()
    // Docké sur mobile, le bandeau ne garde que la période : on remonte pour voir les boutons du brouillon.
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(toolbar(page).getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    await setField(page, 'placement-point-2', '12')
    await expect(page.getByText('2e place : pas plus de points que la place précédente')).toBeVisible()
  })

  test('barème : ajouter puis retirer une place ; valeurs par défaut et annuler', async ({ api, page }) => {
    mockLeagueSettings(api)
    await page.goto('/settings/league')
    await page.getByRole('button', { name: 'Ajouter la 9e place' }).click()
    await expect(page.getByTestId('placement-point-9')).toHaveValue('0')
    await setField(page, 'placement-point-9', '1')
    await expect(page.getByTestId('league-settings-dirty')).toContainText('barème de placement : 10 · 6 · 5 · 4 · 3 · 2 · 1 · 1 → 10 · 6 · 5 · 4 · 3 · 2 · 1 · 1 · 1')
    await page.getByRole('button', { name: 'Retirer la 9e place' }).click()
    await expect(page.getByTestId('placement-point-9')).toHaveCount(0)
    await expect(page.getByTestId('league-settings-dirty')).toHaveCount(0)

    await setField(page, 'prior-matches', '0')
    await expect(page.getByRole('list', { name: 'Poids du propre score d’un clan' })).toContainText('100 % de son score')
    await page.evaluate(() => window.scrollTo(0, 0))
    await toolbar(page).getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByTestId('prior-matches')).toHaveValue('20')
  })

  test('aucun défilement horizontal', async ({ api, page }) => {
    mockLeagueSettings(api)
    await page.goto('/settings/league')
    await expect(page.getByTestId('preview-summary')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})

test('membre sans droits SuperUser : page refusée, aucun réglage lu', async ({ api, page }) => {
  mockLeagueSettings(api, { superUser: false })
  await page.goto('/settings/league')
  await expect(page.getByTestId('league-settings-forbidden')).toBeVisible()
  expect(api.served.some((call) => call.url.pathname === '/api/settings/league')).toBe(false)
})
