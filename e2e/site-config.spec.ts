import { expect, test } from './support/api'
import { mockMemberSession, withSessionCookie } from './support/session'
import { mockCronSettings, mockSiteConfiguration } from './support/site-config'

/**
 * Configuration du site — page SuperUser /settings/configuration (sortie de Tâches planifiées le 2026-10-10) : chaque
 * réglage du .env avec son statut, son effet et sa correction, erreurs récapitulées en tête avec un lien vers leur
 * section, liens vers les pages de réglage. Tâches planifiées garde les horaires et renvoie à la configuration.
 * Toutes les API sont simulées.
 */

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

test('le SuperUser voit chaque réglage, son statut, son effet et la correction à faire', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  mockSiteConfiguration(api)
  await page.goto('/settings/configuration')

  await expect(page.getByRole('heading', { level: 1, name: 'Configuration du site' })).toBeVisible()
  await expect(page.getByText('1 erreur · 2 alertes')).toBeVisible()

  // Récapitulatif des erreurs, chacune liée à sa section.
  const errors = page.getByTestId('config-errors')
  await expect(errors).toContainText('1 erreur à corriger')
  await expect(errors.getByRole('link', { name: 'Secret du bootstrap Owner' })).toHaveAttribute('href', '#config-security')

  const bootstrap = page.getByTestId('config-bootstrap_secret')
  await expect(bootstrap).toHaveAttribute('data-status', 'error')
  await expect(bootstrap).toContainText('Erreur')
  await expect(bootstrap).toContainText('AUTH_BOOTSTRAP_SECRET')
  await expect(bootstrap).toContainText('valeur d’exemple de .env.example (publique)')
  await expect(bootstrap).toContainText('openssl rand -base64 32')

  await expect(page.getByTestId('config-unsubscribe_secret')).toContainText('À revoir')
  await expect(page.getByTestId('config-clan_subdomains')).toContainText('Info')
  await expect(page.getByTestId('config-site_name')).toContainText('OK')
  await expect(page.getByTestId('config-section-obsolete')).toContainText('NEXT_PUBLIC_API_URL')

  // Les réglages qui ont leur page y mènent.
  await expect(page.getByTestId('config-section-email').getByRole('link', { name: 'Envoyer un e-mail de test' })).toHaveAttribute('href', '/settings/email-delivery')
  await expect(page.getByTestId('config-section-tasks').getByRole('link', { name: 'Horaires et exécutions' })).toHaveAttribute('href', '/settings/cron')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('un membre qui n’est pas SuperUser ne voit pas la configuration', async ({ api, page }) => {
  mockMemberSession(api, { superUser: false })
  await page.goto('/settings/configuration')
  await expect(page.getByText('Accès restreint')).toBeVisible()
  await expect(page.getByTestId('config-section-security')).toHaveCount(0)
})

test('Tâches planifiées : horaires gardés, configuration déplacée, décompte lié à la nouvelle page', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  mockCronSettings(api)
  await page.goto('/settings/cron')

  await expect(page.getByRole('heading', { level: 1, name: 'Tâches planifiées' })).toBeVisible()
  const schedules = page.locator('#cron-schedules').locator('xpath=ancestor::section[1]')
  await expect(page.getByRole('heading', { level: 2, name: 'Horaires des tâches' })).toBeVisible()
  await expect(schedules.getByRole('link', { name: 'Configuration du site' })).toHaveAttribute('href', '/settings/configuration')
  // D'où vient chaque horaire, et quand un changement est repris (par le service des tâches, pas par le web).
  await expect(schedules.getByText('le service des tâches reprend un changement dans la minute')).toBeVisible()
  for (const [label, source] of [
    ['Sync des parties des clans', 'personnalisé'],
    ['Recalcul stats quotidien', '.env'],
    ['Sync carrière (lifetime)', 'défaut'],
  ]) {
    await expect(schedules.getByRole('listitem').filter({ hasText: label }).getByText(source, { exact: true })).toBeVisible()
  }
  // Plus de section « Configuration » ni de variables du .env ici.
  await expect(page.getByRole('heading', { level: 2, name: 'Configuration' })).toHaveCount(0)
  await expect(page.getByText('PUBG_API_KEY')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '1 erreur(s) · 2 alerte(s) de configuration' })).toHaveAttribute('href', '/settings/configuration')
})

test.describe('Fraîcheur des parties (docs/TODO/fraicheur-des-parties.md)', () => {
  test('en ordre : délai, dernier tour, marge, tours sautés, parties en attente et quota', async ({ api, page }) => {
    mockMemberSession(api, { superUser: true })
    mockCronSettings(api)
    await page.goto('/settings/cron')

    const card = page.getByTestId('match-sync-health')
    await expect(page.getByRole('heading', { level: 2, name: 'Fraîcheur des parties' })).toBeVisible()
    await expect(card.getByTestId('match-sync-status')).toHaveText('En ordre')
    await expect(card.getByTestId('match-sync-delay')).toContainText('15 min')
    await expect(card.getByTestId('match-sync-delay')).toContainText('90 % sous 27 min · 1221 partie(s) · 2 rattrapage(s) à part')
    await expect(card.getByTestId('match-sync-last-pass')).toContainText('13 min · 45 clans · 52 partie(s)')
    await expect(card.getByTestId('match-sync-margin')).toContainText('43 %')
    await expect(card.getByTestId('match-sync-skipped')).toContainText('0')
    await expect(card.getByTestId('match-sync-pending')).toContainText('1')
    await expect(card.getByTestId('match-sync-calls')).toContainText('545 / 600 (91 %)')
    await expect(card.getByTestId('match-sync-reasons')).toHaveCount(0)

    await card.getByTestId('match-sync-pending-list').locator('summary').click()
    await expect(card.getByTestId('match-sync-pending-list')).toContainText('[ALP]')
    await expect(card.getByTestId('match-sync-pending-list').getByText('En attente', { exact: true })).toBeVisible()
    // Le service cron porte les tâches, plus « le processus web ».
    await expect(page.getByText('Service des tâches (cron)')).toBeVisible()
  })

  test('dégradé : raisons en tête, urgent, partie perdue', async ({ api, page }) => {
    mockMemberSession(api, { superUser: true })
    mockCronSettings(api, { matchSyncHealth: 'degraded' })
    await page.goto('/settings/cron')

    const card = page.getByTestId('match-sync-health')
    await expect(card.getByTestId('match-sync-status')).toHaveText('Urgent')
    await expect(card.getByTestId('match-sync-reasons')).toContainText('Aucun tour terminé depuis 2 h 10')
    await expect(card.getByTestId('match-sync-reasons')).toContainText('1 partie perdue')
    await card.getByTestId('match-sync-pending-list').locator('summary').click()
    await expect(card.getByTestId('match-sync-pending-list').getByText('Perdue', { exact: true })).toBeVisible()
  })

  test('avant le premier tour : « Pas encore de mesure », jamais un faux zéro', async ({ api, page }) => {
    mockMemberSession(api, { superUser: true })
    mockCronSettings(api, { matchSyncHealth: 'empty' })
    await page.goto('/settings/cron')

    const card = page.getByTestId('match-sync-health')
    await expect(card.getByTestId('match-sync-empty')).toContainText('Pas encore de mesure')
    await expect(card.getByTestId('match-sync-delay')).toHaveCount(0)
    await expect(card.getByText('0 min')).toHaveCount(0)
  })
})
