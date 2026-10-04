import type { Page } from '@playwright/test'

import { expect, test } from './support/api'
import { mockAccount } from './support/account'
import { withSessionCookie } from './support/session'

/**
 * Mon compte (`/account`) — charte UI (docs/ui/index.html, migrée le 04/10/2026) : bandeau photo à titre Teko, trois
 * panneaux (Profil, Membres liés, Mot de passe), champs de la charte, avatars en tuiles à l'accent, retours
 * d'enregistrement, confirmation du mot de passe en modale. Toutes les API sont simulées.
 */

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

/**
 * Ouvre la page et attend qu'elle soit stable : le shell remonte la page quand la session arrive (profil chargé trois
 * fois) ; une saisie faite avant le dernier chargement serait écrasée (vu sur WebKit).
 */
async function openAccount(page: Page) {
  await page.goto('/account')
  await page.waitForLoadState('networkidle')
  await expect(page.getByLabel('Email')).toHaveValue('joueur@example.com')
}

test('profil chargé : champs remplis, membres liés actifs seulement', async ({ api, page }) => {
  await mockAccount(api, page)
  await openAccount(page)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue('joueur@example.com')
  await expect(page.getByLabel('Pseudo d’affichage')).toHaveValue('Alpha')
  const members = page.getByTestId('account-members')
  await expect(members).toContainText('Joueur Alpha')
  await expect(members).not.toContainText('Ancien compte')
  await expect(members.getByRole('link', { name: /Notifications/ })).toHaveAttribute('href', /\/members\/1\//)
})

test('profil : pseudo et avatar modifiés, enregistrés, message de succès', async ({ api, page }) => {
  const calls = await mockAccount(api, page)
  await openAccount(page)
  await page.getByLabel('Pseudo d’affichage').fill('Alpha Prime')
  const tile = page.getByRole('group', { name: 'Avatars proposés' }).getByRole('button').first()
  await tile.click()
  await expect(tile).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('URL de l’avatar')).toHaveValue(/dicebear/)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Profil mis à jour' })).toBeVisible()
  expect(calls.profiles).toHaveLength(1)
  expect(calls.profiles[0]).toMatchObject({ email: 'joueur@example.com', displayName: 'Alpha Prime' })
  expect(calls.profiles[0].avatarUrl).toContain('dicebear')
})

test('mot de passe : contrôles locaux, confirmation en modale, champs vidés après succès', async ({ api, page }) => {
  const calls = await mockAccount(api, page)
  await openAccount(page)
  const form = page.getByTestId('account-password')
  await form.getByLabel('Mot de passe actuel').fill('ancien-mdp')
  // Moins de 8 caractères : le navigateur bloque l'envoi (minLength), aucune requête.
  await form.getByLabel('Nouveau mot de passe', { exact: true }).fill('nouveau-mdp-123')
  await form.getByLabel('Confirmer le nouveau mot de passe').fill('autre-mdp-123')
  await form.getByRole('button', { name: 'Mettre à jour le mot de passe' }).click()
  await expect(form.getByRole('alert')).toContainText('ne correspondent pas')
  expect(calls.passwords).toHaveLength(0)

  await form.getByLabel('Confirmer le nouveau mot de passe').fill('nouveau-mdp-123')
  await form.getByRole('button', { name: 'Mettre à jour le mot de passe' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirmer' }).click()
  await expect(form.getByRole('status')).toContainText('Mot de passe mis à jour')
  expect(calls.passwords).toEqual([{ currentPassword: 'ancien-mdp', newPassword: 'nouveau-mdp-123' }])
  await expect(form.getByLabel('Mot de passe actuel')).toHaveValue('')
})

test('mot de passe refusé par le serveur : message d’erreur affiché', async ({ api, page }) => {
  await mockAccount(api, page)
  await openAccount(page)
  const form = page.getByTestId('account-password')
  await form.getByLabel('Mot de passe actuel').fill('mauvais-mdp')
  await form.getByLabel('Nouveau mot de passe', { exact: true }).fill('nouveau-mdp-123')
  await form.getByLabel('Confirmer le nouveau mot de passe').fill('nouveau-mdp-123')
  await form.getByRole('button', { name: 'Mettre à jour le mot de passe' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click()
  await expect(form.getByRole('alert')).toContainText('Mot de passe actuel incorrect')
})

test('aucun défilement horizontal', async ({ api, page }) => {
  await mockAccount(api, page)
  await openAccount(page)
  await expect(page.getByLabel('Email')).toHaveValue('joueur@example.com')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
