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
  // Plus de section « Configuration » ni de variables du .env ici.
  await expect(page.getByRole('heading', { level: 2, name: 'Configuration' })).toHaveCount(0)
  await expect(page.getByText('PUBG_API_KEY')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '1 erreur(s) · 2 alerte(s) de configuration' })).toHaveAttribute('href', '/settings/configuration')
})
