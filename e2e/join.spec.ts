import type { Page } from '@playwright/test'

import { expect, test } from './support/api'

/**
 * Inscription des clans (`/join`, visiteur) — docs/features/accueil.md, « Vocabulaire ». Le site ne recrute pas : il suit
 * les clans qui existent déjà dans PUBG. On relie son compte à son clan déjà suivi, ou on inscrit son clan. Seul l'aperçu
 * (`mode: 'preview'`, sans écriture) est figé : aucune demande n'est envoyée.
 */

type Preview = { actionType: 'join_existing' | 'create_clan'; authenticated: boolean; clan: { name: string; tag: string } }

function preview({ actionType, authenticated, clan }: Preview) {
  return {
    mode: 'preview',
    authenticated,
    player: { pubgPlayerName: 'Balthazar_99', platformShard: 'steam', pubgAccountId: 'account.demo' },
    clan: { pubgClanId: 'clan.demo', name: clan.name, tag: clan.tag, existsOnSite: actionType === 'join_existing' },
    actionType,
    targetClanName: clan.name,
    targetClanTag: clan.tag,
  }
}

async function checkPlayer(page: Page) {
  await page.getByLabel('Pseudo PUBG officiel').fill('Balthazar_99')
  await page.getByRole('button', { name: 'Vérifier et continuer' }).click()
}

test('la page parle d’inscrire son clan ou de relier son compte, jamais de recrutement', async ({ page }) => {
  await page.goto('/join')
  await expect(page.getByRole('heading', { level: 1, name: 'Votre clan sur chickendinner.fr' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Relier son compte ou inscrire son clan' })).toBeVisible()
  await expect(page.getByText('Le site ne recrute pas : il suit les clans qui existent déjà dans PUBG.', { exact: false })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/recrutement|rejoignez|rejoindre ou créer|fondez/i)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('clan pas encore suivi : la modale propose de l’inscrire, e-mail de contact exigé avant l’envoi', async ({ api, page }) => {
  api.on('POST', '/api/join', { body: preview({ actionType: 'create_clan', authenticated: true, clan: { name: 'Smoke Squad', tag: 'SMOK' } }) })
  await page.goto('/join')
  await checkPlayer(page)

  const dialog = page.getByRole('dialog', { name: 'Inscrire le clan' })
  await expect(dialog).toContainText('[SMOK] Smoke Squad n’est pas encore suivi par le site')
  await expect(dialog).not.toContainText(/créer|fonder/i)
  // Sans e-mail de contact, rien n'est envoyé : message dans la modale.
  await dialog.getByRole('button', { name: 'Soumettre au SuperUser' }).click()
  await expect(dialog).toContainText('Saisissez une adresse e-mail de contact.')
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await expect(dialog).toHaveCount(0)
})

test('clan déjà suivi, visiteur non connecté : la modale propose de relier son compte après connexion', async ({ api, page }) => {
  api.on('POST', '/api/join', { body: preview({ actionType: 'join_existing', authenticated: false, clan: { name: 'La Meute', tag: 'LMT' } }) })
  await page.goto('/join')
  await checkPlayer(page)

  const dialog = page.getByRole('dialog', { name: 'Relier son compte au clan' })
  await expect(dialog).toContainText('[LMT] La Meute est déjà suivi : la demande de rattachement est transmise à son administrateur')
  await expect(dialog).toContainText('Connexion requise pour finaliser')
  await expect(dialog.getByRole('button', { name: 'Se connecter pour continuer' })).toBeVisible()
})
