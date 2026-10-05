import type { Page } from '@playwright/test'

import { expect, test } from './support/api'

/**
 * Pages légales et footer — docs/features/pages-legales.md. Visiteur sans session : quatre pages publiques, footer sur
 * une ligne avec la page courante marquée, sommaire d'ancres, formulaire « Retirer mes données » (réponse figée : rien
 * n'est enregistré).
 */

// « Retirer mes données » n'est pas dans le footer : son lien parent, Confidentialité, y est marqué (`aria-current="true"`).
const PAGES = [
  { path: '/mentions-legales', link: 'Mentions légales', current: 'page', heading: 'Mentions légales et CGU' },
  { path: '/confidentialite', link: 'Confidentialité', current: 'page', heading: 'Confidentialité' },
  { path: '/confidentialite/demande', link: 'Confidentialité', current: 'true', heading: 'Retirer mes données' },
  { path: '/a-propos', link: 'À propos', current: 'page', heading: 'À propos' },
]

const footer = (page: Page) => page.locator('.app-footer')
const requestForm = (page: Page) => page.locator('form', { has: page.getByRole('button', { name: 'Envoyer la demande' }) })

async function fillValidRequest(page: Page) {
  await page.getByLabel('Pseudo PUBG (IGN)').fill('Arkium_FR')
  await page.getByText('Purger mon historique', { exact: true }).click()
  await expect(page.getByRole('radio', { name: /Purger mon historique/ })).toBeChecked()
  await page.getByLabel('E-mail de contact').fill('joueur@exemple.fr')
  await page.getByText('Je confirme être le titulaire de ce compte PUBG.').click()
}

for (const entry of PAGES) {
  test(`${entry.path} : publique, footer complet avec la page courante marquée, sans défilement horizontal`, async ({ page }) => {
    await page.goto(entry.path)
    await expect(page.getByRole('heading', { level: 1, name: entry.heading })).toBeVisible()

    const legal = footer(page).getByRole('navigation', { name: 'Informations légales' })
    await expect(legal.getByRole('link')).toHaveCount(3)
    await expect(legal.getByRole('link', { name: entry.link })).toHaveAttribute('aria-current', entry.current)
    await expect(footer(page)).toContainText('n’est ni affilié à, ni sponsorisé, ni approuvé par KRAFTON, Inc.')

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

test('footer : « © Arkium » mène à arkium.eu, le logo chickendinner.fr à l’accueil', async ({ page }) => {
  await page.goto('/a-propos')
  await expect(footer(page).getByRole('link', { name: /© \d{4} Arkium/ })).toHaveAttribute('href', 'https://arkium.eu')
  await expect(footer(page).getByRole('link', { name: 'chickendinner.fr, accueil' })).toHaveAttribute('href', '/')
})

test('le footer mène d’une page légale à l’autre', async ({ page }) => {
  await page.goto('/mentions-legales')
  await footer(page).getByRole('link', { name: 'À propos' }).click()
  await expect(page).toHaveURL(/\/a-propos$/)
  await expect(page.getByRole('heading', { level: 1, name: 'À propos' })).toBeVisible()
  await expect(footer(page).getByRole('link', { name: 'À propos' })).toHaveAttribute('aria-current', 'page')
})

test('confidentialité : le sommaire mène aux sections, « Tes droits » au formulaire', async ({ page }) => {
  await page.goto('/confidentialite')
  const toc = page.getByRole('navigation', { name: 'Sur cette page' })
  await expect(toc.getByRole('link')).toHaveCount(5)
  await toc.getByRole('link', { name: /Tes droits/ }).click()
  await expect(page).toHaveURL(/#droits$/)
  await expect(page.getByRole('heading', { level: 2, name: /Tes droits/ })).toBeInViewport()

  const rights = page.locator('#droits')
  await expect(rights).toContainText('Autorité de protection des données (APD)')
  await expect(rights.getByRole('link', { name: 'Retirer mes données' })).toHaveAttribute('href', '/confidentialite/demande')
  await expect(rights.getByRole('link', { name: /contact@chickendinner\.fr/ })).toHaveAttribute('href', 'mailto:contact@chickendinner.fr')
})

test('formulaire : erreurs par champ sans appel, puis envoi et confirmation', async ({ api, page }) => {
  let sent: unknown = null
  api.on('POST', '/api/privacy-requests', (_url, request) => {
    sent = request.postDataJSON()
    return { status: 201, body: { ok: true, id: 42 } }
  })
  await page.goto('/confidentialite/demande')

  await requestForm(page).getByRole('button', { name: 'Envoyer la demande' }).click()
  await expect(page.getByText('Indique ton pseudo PUBG.', { exact: true })).toBeVisible()
  await expect(page.getByText('Indique une adresse e-mail.', { exact: true })).toBeVisible()
  await expect(page.getByText('Confirme être le titulaire de ce compte PUBG.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Pseudo PUBG (IGN)')).toBeFocused()
  expect(sent).toBeNull()

  await fillValidRequest(page)
  await requestForm(page).getByRole('button', { name: 'Envoyer la demande' }).click()

  const done = page.getByTestId('privacy-request-sent')
  await expect(done).toContainText('Demande envoyée · n° 42')
  await expect(done).toContainText('joueur@exemple.fr')
  expect(sent).toEqual({ pubgName: 'Arkium_FR', kind: 'purge', reason: '', email: 'joueur@exemple.fr', confirmOwner: true, website: '' })
})

test('formulaire : un refus du serveur s’affiche sans perdre la saisie', async ({ api, page }) => {
  api.on('POST', '/api/privacy-requests', { status: 429, body: { error: 'Trop de demandes envoyées. Réessaie dans une heure.' } })
  await page.goto('/confidentialite/demande')

  await fillValidRequest(page)
  await requestForm(page).getByRole('button', { name: 'Envoyer la demande' }).click()

  await expect(requestForm(page).getByRole('alert')).toHaveText('Trop de demandes envoyées. Réessaie dans une heure.')
  await expect(page.getByLabel('Pseudo PUBG (IGN)')).toHaveValue('Arkium_FR')
  await expect(page.getByTestId('privacy-request-sent')).toHaveCount(0)
})
