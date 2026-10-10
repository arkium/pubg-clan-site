import type { Page } from '@playwright/test'

import { expect, test } from './support/api'

/**
 * Inscription des clans (`/join`, visiteur) — docs/features/accueil.md § 2 (« Vocabulaire ») et docs/features/clans.md
 * (« Ajout d'un membre — flux auto-inscription »). Le site ne recrute pas : il suit les clans qui existent déjà dans PUBG.
 * On demande l'accès à son clan déjà suivi, ou on inscrit son clan, sans compte : la demande part avec une adresse de
 * contact, et le compte se crée à son acceptation. Les réponses de `POST /api/join` (aperçu et envoi) sont figées : rien
 * n'est enregistré.
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

test('la page parle de demander l’accès à son clan ou de l’inscrire, sans compte, jamais de recrutement', async ({ page }) => {
  await page.goto('/join')
  await expect(page.getByRole('heading', { level: 1, name: 'Votre clan sur chickendinner.fr' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Demander l’accès à son clan ou l’inscrire' })).toBeVisible()
  await expect(page.getByText('Le site ne recrute pas : il suit les clans qui existent déjà dans PUBG.', { exact: false })).toBeVisible()
  await expect(page.getByText('Pas besoin de compte pour demander')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/recrutement|rejoignez|rejoindre ou créer|fondez|défis communautaires/i)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('clan déjà suivi, visiteur sans compte : demande envoyée avec son adresse, le compte se crée à l’acceptation', async ({ api, page }) => {
  const sent: Array<Record<string, unknown>> = []
  api.on('POST', '/api/join', (_url, request) => {
    const body = request.postDataJSON() as Record<string, unknown>
    if (body.mode === 'preview') return { body: preview({ actionType: 'join_existing', authenticated: false, clan: { name: 'La Meute', tag: 'LMT' } }) }
    sent.push(body)
    return {
      body: {
        status: 'pending',
        clanId: 7,
        clanName: 'La Meute',
        memberId: 41,
        message: "Votre demande d'accès au clan \"La Meute\" a été envoyée. Quand son Owner l'acceptera, vous recevrez à joueur@exemple.fr le lien pour créer votre compte.",
      },
    }
  })
  await page.goto('/join')
  await checkPlayer(page)

  const dialog = page.getByRole('dialog', { name: 'Demander l’accès au clan' })
  await expect(dialog).toContainText('[LMT] La Meute est déjà suivi : la demande est transmise à son Owner')
  await expect(dialog).toContainText('Pas besoin de compte')
  await expect(dialog).not.toContainText('Connexion requise')

  // Sans adresse, rien n'est envoyé.
  await dialog.getByRole('button', { name: 'Envoyer la demande à l’Owner' }).click()
  await expect(dialog).toContainText('Saisissez une adresse e-mail de contact.')
  expect(sent).toHaveLength(0)

  await dialog.getByLabel('Adresse e-mail de contact').fill('joueur@exemple.fr')
  await dialog.getByRole('button', { name: 'Envoyer la demande à l’Owner' }).click()
  await expect(page.getByText('Demande enregistrée')).toBeVisible()
  await expect(page.getByText('vous recevrez à joueur@exemple.fr le lien pour créer votre compte', { exact: false })).toBeVisible()
  expect(sent).toEqual([expect.objectContaining({ mode: 'join', pubgPlayerName: 'Balthazar_99', contactEmail: 'joueur@exemple.fr' })])
  await expect(page.getByRole('link', { name: 'Voir les clans' })).toHaveAttribute('href', '/clans')
})

test('clan pas encore suivi : la modale propose de l’inscrire, e-mail de contact exigé avant l’envoi', async ({ api, page }) => {
  api.on('POST', '/api/join', { body: preview({ actionType: 'create_clan', authenticated: true, clan: { name: 'Smoke Squad', tag: 'SMOK' } }) })
  await page.goto('/join')
  await checkPlayer(page)

  const dialog = page.getByRole('dialog', { name: 'Inscrire le clan' })
  await expect(dialog).toContainText('[SMOK] Smoke Squad n’est pas encore suivi par le site')
  await expect(dialog).not.toContainText(/créer|fonder/i)
  await dialog.getByRole('button', { name: 'Soumettre au SuperUser' }).click()
  await expect(dialog).toContainText('Saisissez une adresse e-mail de contact.')
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await expect(dialog).toHaveCount(0)
})
