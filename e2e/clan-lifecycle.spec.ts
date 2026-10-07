import type { Page } from '@playwright/test'

import { expect, test } from './support/api'
import { mockClanLifecycle, withSessionCookie } from './support/clan-lifecycle'
import { dock } from './support/layout'

/**
 * Cycle de vie des clans — page SuperUser /settings/clans/lifecycle (docs/features/cycle-de-vie-clan.md), selon la
 * charte UI (04/10/2026) : bandeau photo, onglets dans le bandeau collant (menu sur mobile), journal des mutations
 * filtré et paginé, clans en attente et archivés (confirmation en modale), parking, réglages (un PATCH par réglage),
 * santé du cron ; erreurs de section, aucun défilement horizontal, refus d'un non-SuperUser. Toutes les API sont
 * simulées : aucune écriture en base.
 */

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

/** Ouvre la page et attend qu'elle soit stable : le shell remonte la page quand la session arrive. */
async function openLifecycle(page: Page, query = '') {
  await page.goto(`/settings/clans/lifecycle${query}`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { level: 1, name: 'Cycle de vie des clans' })).toBeVisible()
}

const isNarrow = (page: Page) => (page.viewportSize()?.width ?? 1280) < 640

/** Change d'onglet comme un joueur : tuiles du bandeau, ou menu sous 640 px. */
async function openTab(page: Page, label: string) {
  await page.evaluate(() => window.scrollTo(0, 0))
  if (isNarrow(page)) {
    await page.getByTestId('lifecycle-tab-menu').click()
    await page.getByRole('menuitemradio', { name: label }).click()
  } else {
    await page.getByRole('tab', { name: label }).click()
  }
}

/** Choisit un statut du journal : tuiles, ou menu sous 640 px. */
async function chooseStatus(page: Page, label: string) {
  if (isNarrow(page)) {
    await page.getByTestId('lifecycle-status-menu').click()
    await page.getByRole('menuitemradio', { name: label, exact: true }).click()
  } else {
    await page.getByTestId('lifecycle-status-filter').getByRole('button', { name: label, exact: true }).click()
  }
}

const panel = (page: Page) => page.getByTestId('clan-lifecycle-panel')

/** Compteurs de la page : rendus au repos seulement (le bandeau docké ne garde que les onglets), on remonte d'abord. */
async function counters(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  return page.getByTestId('lifecycle-counters')
}

test('vue d’ensemble : bandeau, mode, compteurs et journal des mutations', async ({ api, page }) => {
  mockClanLifecycle(api)
  await openLifecycle(page)

  await expect(page.getByTestId('lifecycle-mode-chip')).toHaveText('Mode observation')
  await expect(page.getByTestId('lifecycle-mode')).toContainText('aucun membre n’est déplacé')
  await expect(page.getByTestId('lifecycle-counters')).toContainText('2 mouvements à relire · 2 clans en attente · 2 clans archivés · 14 joueurs au parking, dont 3 archivables')

  const rows = panel(page).getByTestId('lifecycle-mutation')
  await expect(rows).toHaveCount(30)
  await expect(page.getByTestId('lifecycle-mutations-total')).toHaveText('35 lignes')
  const transfer = rows.filter({ hasText: 'Joueur Bravo' })
  await expect(transfer).toContainText('[DEMO]')
  await expect(transfer).toContainText('[RATZ]')
  await expect(transfer).toContainText('Appliqué')
  await expect(transfer).toContainText('Détecté — a changé de clan')
  await expect(transfer.getByRole('button', { name: 'Annuler' })).toBeVisible()
  await expect(transfer.getByRole('button', { name: 'Marquer comme vu' })).toBeVisible()
  // Vers le clan technique : « Parking », pas le tag UNG.
  await expect(rows.filter({ hasText: 'Joueur Charlie' })).toContainText('Parking')
  // Déjà vu : plus de « Marquer comme vu », l'annulation reste possible.
  const seen = rows.filter({ hasText: 'Joueur Delta' })
  await expect(seen).toContainText('vu')
  await expect(seen.getByRole('button', { name: 'Marquer comme vu' })).toHaveCount(0)
  // Écart en cours de confirmation : aucune action, clan PUBG observé non suivi.
  const observed = rows.filter({ hasText: 'Joueur Echo' })
  await expect(observed).toContainText('En cours de confirmation')
  await expect(observed).toContainText('[BOFS]')
  await expect(observed.getByRole('button')).toHaveCount(0)
})

test('journal : filtre de statut envoyé à la route, état vide, pagination', async ({ api, page }) => {
  mockClanLifecycle(api)
  await openLifecycle(page)
  await expect(panel(page).getByTestId('lifecycle-mutation')).toHaveCount(30)

  await page.getByRole('navigation', { name: 'Pages du journal des mouvements' }).getByRole('button', { name: '2' }).click()
  await expect(panel(page).getByTestId('lifecycle-mutation')).toHaveCount(5)
  expect(api.paramValues('/api/settings/clan-lifecycle/mutations', 'page')).toContain('2')

  await chooseStatus(page, 'Annulés')
  await expect(panel(page).getByTestId('lifecycle-mutation')).toHaveCount(1)
  await expect(panel(page).getByTestId('lifecycle-mutation')).toContainText('Joueur Foxtrot')
  // Nouveau filtre : on repart de la première page.
  expect(api.served.filter((call) => call.url.pathname === '/api/settings/clan-lifecycle/mutations').at(-1)?.url.search).toBe('?status=reverted')

  await chooseStatus(page, 'En attente de clan')
  await expect(page.getByTestId('lifecycle-mutations-empty')).toContainText('Aucun événement pour ce filtre')
  expect(api.paramValues('/api/settings/clan-lifecycle/mutations', 'status').slice(-2)).toEqual(['reverted', 'pending'])
})

test('marquer comme vu puis annuler : corps envoyés, toasts, compteur de relecture', async ({ api, page }) => {
  const calls = mockClanLifecycle(api)
  await openLifecycle(page)
  const bravo = panel(page).getByTestId('lifecycle-mutation').filter({ hasText: 'Joueur Bravo' })

  await bravo.getByRole('button', { name: 'Marquer comme vu' }).click()
  await expect(page.getByTestId('lifecycle-toasts')).toContainText('Mouvement marqué comme vu.')
  expect(calls.mutationActions).toEqual([{ action: 'acknowledge', changeId: 'chg-1' }])
  await expect(bravo.getByRole('button', { name: 'Marquer comme vu' })).toHaveCount(0)
  await expect(await counters(page)).toContainText('1 mouvement à relire')

  await bravo.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByTestId('lifecycle-toasts')).toContainText('Joueur Bravo a été replacé dans son clan précédent.')
  expect(calls.mutationActions.at(-1)).toEqual({ action: 'revert', changeId: 'chg-1' })
  await expect(bravo).toContainText('Annulé')
})

test('clans en attente : valider, refuser après confirmation en modale', async ({ api, page }) => {
  const calls = mockClanLifecycle(api)
  await openLifecycle(page)
  await openTab(page, 'Clans en attente')

  const clans = panel(page).getByTestId('lifecycle-pending-clan')
  await expect(clans).toHaveCount(2)
  await expect(clans.first()).toContainText('Smoke_Leader')
  await expect(clans.first()).toContainText('chef@smoke-squad.example')
  await expect(clans.first()).toContainText('Demande /join')
  await expect(clans.nth(1)).toContainText('Découvert automatiquement')
  await expect(clans.nth(1)).toContainText('3 joueur(s) y seront rattachés')
  await expect(clans.nth(1).getByRole('link', { name: 'Confrontations' })).toHaveAttribute('href', '/settings/clans?opponentsQ=BOFS')

  await clans.first().getByRole('button', { name: 'Valider' }).click()
  await expect(page.getByTestId('lifecycle-toasts')).toContainText('Clan [SMK] Smoke Squad validé.')
  expect(calls.decisions).toEqual([{ clanId: 41, decision: 'approve', body: {} }])
  await expect(clans).toHaveCount(1)

  await clans.first().getByRole('button', { name: 'Refuser' }).click()
  const dialog = page.getByRole('dialog', { name: 'Refuser cette demande de clan ?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await expect(dialog).toHaveCount(0)
  expect(calls.decisions).toHaveLength(1)

  await clans.first().getByRole('button', { name: 'Refuser' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Refuser' }).click()
  expect(calls.decisions.at(-1)).toEqual({ clanId: 42, decision: 'reject', body: {} })
  await expect(page.getByTestId('lifecycle-pending-empty')).toBeVisible()
  await expect(await counters(page)).toContainText('0 clan en attente · 3 clans archivés')
})

test('clans archivés : réactivation confirmée en modale, corps envoyé', async ({ api, page }) => {
  const calls = mockClanLifecycle(api)
  await openLifecycle(page, '?tab=archived')

  const clans = panel(page).getByTestId('lifecycle-archived-clan')
  await expect(clans).toHaveCount(2)
  await expect(clans.filter({ hasText: 'Vieux Clan' })).toContainText('Suivi arrêté')
  await expect(clans.filter({ hasText: 'Vieux Clan' })).toContainText('4 fiches encore rattachées')
  await expect(clans.filter({ hasText: 'Demande Refusée' })).toContainText('Demande refusée')

  await clans.filter({ hasText: 'Vieux Clan' }).getByRole('button', { name: 'Réactiver le suivi' }).click()
  const dialog = page.getByRole('dialog', { name: 'Suivre de nouveau ce clan ?' })
  await expect(dialog).toContainText('Ses anciens membres ne seront pas réintégrés automatiquement.')
  await dialog.getByRole('button', { name: 'Réactiver le suivi' }).click()
  await expect(page.getByTestId('lifecycle-toasts')).toContainText('Le suivi de [OLD] Vieux Clan reprend.')
  expect(calls.reactivations).toEqual([{ clanId: 51, body: { action: 'reactivate' } }])
  await expect(clans).toHaveCount(1)
})

test('parking : liste paginée, archivage des candidats', async ({ api, page }) => {
  const calls = mockClanLifecycle(api)
  await openLifecycle(page, '?tab=ungrouped')

  await expect(page.getByTestId('lifecycle-parking-summary')).toContainText('14 joueurs au parking · 3 archivables au-delà de 90 jours')
  const members = panel(page).getByTestId('lifecycle-parking-member')
  await expect(members).toHaveCount(10)
  await expect(members.filter({ hasText: 'Sans Clan 02' })).toContainText('aucun match connu')
  await expect(members.filter({ hasText: 'Sans Clan 01' })).toContainText('Archivable')
  await page.getByRole('navigation', { name: 'Pages du parking' }).getByRole('button', { name: '2' }).click()
  await expect(members).toHaveCount(4)

  await page.getByRole('button', { name: 'Archiver les 3 candidats' }).click()
  await expect(page.getByTestId('lifecycle-toasts')).toContainText('3 membre(s) archivé(s).')
  expect(calls.archives).toEqual([{ action: 'archive', memberIds: [201, 202, 203] }])
  await expect(page.getByRole('button', { name: /Archiver les/ })).toHaveCount(0)
  await expect(page.getByTestId('lifecycle-parking-summary')).toContainText('11 joueurs au parking · 0 archivable')
})

test('paramètres : un PATCH par réglage, bornes vérifiées avant envoi', async ({ api, page }) => {
  const calls = mockClanLifecycle(api)
  await openLifecycle(page, '?tab=settings')
  const settings = page.getByTestId('lifecycle-settings')
  await expect(settings.getByTestId('lifecycle-confirmations')).toHaveValue('3')
  await expect(settings.getByTestId('lifecycle-auto-promote')).toHaveAttribute('aria-checked', 'true')
  await expect(settings.getByTestId('lifecycle-auto-archive')).toHaveAttribute('aria-checked', 'false')
  await expect(settings.getByTestId('lifecycle-webhook-current')).toContainText('https://discord.com/api/webhooks/123456789/')

  // Mode : la décision qui engage, enregistrée dès le choix.
  await settings.getByTestId('lifecycle-mode-control').getByRole('button', { name: 'Application' }).click()
  await expect(page.getByTestId('lifecycle-mode-chip')).toHaveText('Mode application')
  await expect(page.getByTestId('lifecycle-mode')).toContainText('appliqués automatiquement')
  expect(calls.settingsPatches).toEqual([{ mode: 'apply' }])

  // Hors bornes : erreur sous le champ, rien n'est envoyé.
  const confirmations = settings.getByTestId('lifecycle-confirmations')
  await confirmations.fill('0')
  await expect(confirmations).toHaveAttribute('aria-invalid', 'true')
  await expect(settings.getByText('Entier entre 1 et 10.')).toBeVisible()
  const applyConfirmations = confirmations.locator('xpath=following-sibling::button')
  await expect(applyConfirmations).toBeDisabled()
  await confirmations.fill('4')
  await applyConfirmations.click()
  await expect(page.getByTestId('lifecycle-toasts')).toContainText('Réglage enregistré.')
  expect(calls.settingsPatches.at(-1)).toEqual({ confirmationsRequired: 4 })
  await expect(settings.getByTestId('lifecycle-confirmations')).toHaveValue('4')

  await settings.getByTestId('lifecycle-auto-archive').click()
  await expect(settings.getByTestId('lifecycle-auto-archive')).toHaveAttribute('aria-checked', 'true')
  expect(calls.settingsPatches.at(-1)).toEqual({ autoArchive: true })

  await settings.getByTestId('lifecycle-webhook-input').fill('https://discord.com/api/webhooks/987654321/secret')
  await settings.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(settings.getByTestId('lifecycle-webhook-current')).toContainText('987654321')
  expect(calls.settingsPatches.at(-1)).toEqual({ webhookUrl: 'https://discord.com/api/webhooks/987654321/secret' })
  expect(calls.settingsPatches).toHaveLength(4)
})

test('santé : dernier passage, coût du parking, derniers passages', async ({ api, page }) => {
  mockClanLifecycle(api)
  await openLifecycle(page)
  await openTab(page, 'Santé')

  const lastRun = page.getByTestId('lifecycle-last-run')
  await expect(lastRun).toContainText('Réussi')
  await expect(lastRun).toContainText('346')
  await expect(lastRun).toContainText('Appels PUBG')
  await expect(page.getByTestId('lifecycle-parking-cost')).toContainText('14')
  const runs = page.getByTestId('lifecycle-runs').locator('tbody tr')
  await expect(runs).toHaveCount(3)
  await expect(runs.nth(1)).toContainText('Coupe-circuit')
  await expect(runs.nth(2)).toContainText('Échec')
})

test('erreur d’une section : message, puis « Réessayer » recharge la liste', async ({ api, page }) => {
  const { control } = mockClanLifecycle(api, { failPending: true })
  await openLifecycle(page)
  await openTab(page, 'Clans en attente')
  const error = page.getByTestId('lifecycle-pending-error')
  await expect(error).toContainText('Impossible de charger cette section.')
  control.failPending = false
  await error.getByRole('button', { name: 'Réessayer' }).click()
  await expect(panel(page).getByTestId('lifecycle-pending-clan')).toHaveCount(2)
})

test('bandeau docké : onglets courts sur une ligne, à la hauteur du rail', async ({ api, page }) => {
  test.skip(isNarrow(page), 'page sans période : rien de docké sous 640 px')
  mockClanLifecycle(api)
  await openLifecycle(page)
  await expect(panel(page).getByTestId('lifecycle-mutation')).toHaveCount(30)
  await dock(page)
  const tabs = page.getByRole('tab')
  await expect(tabs.filter({ hasText: 'En attente' })).toHaveAttribute('aria-label', 'Clans en attente (2)')
  const heights = await tabs.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().height)))
  expect(new Set(heights).size, `hauteurs des onglets : ${heights.join(', ')}`).toBe(1)
  expect(heights[0]).toBeLessThanOrEqual(40)
  // Compteurs et notes restent au repos.
  await expect(page.getByTestId('lifecycle-counters')).toHaveCount(0)
})

test('aucun défilement horizontal, quel que soit l’onglet', async ({ api, page }) => {
  mockClanLifecycle(api)
  await openLifecycle(page)
  for (const label of ['Mutations', 'Clans en attente', 'Clans archivés', 'Parking', 'Paramètres', 'Santé']) {
    await openTab(page, label)
    await expect(panel(page)).toHaveAttribute('aria-label', label)
    await expect(panel(page).locator('[aria-busy="true"]')).toHaveCount(0)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `onglet ${label}`).toBeLessThanOrEqual(1)
  }
})

test('membre sans droits SuperUser : accès refusé, aucune section lue', async ({ api, page }) => {
  mockClanLifecycle(api, { superUser: false })
  await page.goto('/settings/clans/lifecycle')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('clan-lifecycle-forbidden')).toContainText('Accès réservé au SuperUser')
  await expect(page.getByRole('tablist')).toHaveCount(0)
  expect(api.served.filter((call) => call.url.pathname.startsWith('/api/settings/clan-lifecycle/'))).toEqual([])
})
