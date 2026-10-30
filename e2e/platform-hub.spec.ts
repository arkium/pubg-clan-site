import type { AdminInbox } from '@/lib/admin-inbox/build'

import { expect, test } from './support/api'
import { mockMemberSession, withSessionCookie } from './support/session'

/**
 * Accueil Plateforme (/settings) — boîte « À traiter » (src/lib/admin-inbox/) : les files et incidents de tout le site
 * en tête de page, du plus urgent au simple « à relire », chaque ligne menant à sa page. Toutes les API sont simulées.
 */

const INBOX: AdminInbox = {
  generatedAt: '2026-10-19T09:00:00.000Z',
  unavailable: ['télémétrie'],
  items: [
    {
      key: 'pending_clans',
      tone: 'urgent',
      count: 2,
      label: 'Clans en attente de ta décision',
      detail: 'Le plus ancien, [FYB], attend depuis 12 jours.',
      href: '/settings/clans/lifecycle?tab=pending',
    },
    {
      key: 'orphan_join_requests',
      tone: 'todo',
      count: 2,
      label: 'Demandes d’adhésion sans Owner pour y répondre',
      detail: 'papy_0 → [OCD] · Kilo → [XYZ]',
      href: '/clans/17/settings/members?tab=demandes',
      links: [
        { label: '[OCD]', href: '/clans/17/settings/members?tab=demandes' },
        { label: '[XYZ]', href: '/clans/19/settings/members?tab=demandes' },
      ],
    },
    {
      key: 'unacknowledged_moves',
      tone: 'info',
      count: 45,
      label: 'Mouvements automatiques à relire',
      detail: 'Appliqués par le cycle de vie, à marquer comme vus ou à annuler.',
      href: '/settings/clans/lifecycle?tab=mutations',
    },
  ],
}

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

test('la boîte « À traiter » liste les files du plus urgent au simple « à relire »', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  api.on('GET', '/api/settings/inbox', { body: INBOX })
  await page.goto('/settings')

  const inbox = page.getByTestId('admin-inbox')
  await expect(inbox.getByRole('heading', { level: 2, name: 'À traiter' })).toBeVisible()
  await expect(page.getByTestId('admin-inbox-summary')).toHaveText('2 sujets demandent ton attention')

  const items = inbox.getByTestId('admin-inbox-item')
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toHaveAttribute('data-tone', 'urgent')
  await expect(items.nth(0)).toContainText('Le plus ancien, [FYB], attend depuis 12 jours.')
  await expect(items.nth(0).getByRole('link', { name: /Clans en attente de ta décision/ })).toHaveAttribute('href', '/settings/clans/lifecycle?tab=pending')

  // Une ligne qui couvre plusieurs clans offre un lien par clan.
  await expect(items.nth(1).getByRole('link', { name: '[XYZ]', exact: true })).toHaveAttribute('href', '/clans/19/settings/members?tab=demandes')
  await expect(items.nth(2)).toHaveAttribute('data-tone', 'info')

  // Une source illisible est dite, pas comptée à zéro.
  await expect(page.getByTestId('admin-inbox-unavailable')).toHaveText('Non lu cette fois : télémétrie.')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('rien à traiter : un message, pas de liste vide', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  api.on('GET', '/api/settings/inbox', { body: { ...INBOX, items: [], unavailable: [] } })
  await page.goto('/settings')

  await expect(page.getByTestId('admin-inbox-empty')).toContainText('Rien à traiter')
  await expect(page.getByTestId('admin-inbox-summary')).toHaveText('Aucune décision en attente')
  await expect(page.getByTestId('admin-inbox-item')).toHaveCount(0)
})

test('lecture en échec : message et « Réessayer », sans bloquer le reste de l’accueil', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  // Bascule plutôt que compteur : le mode strict du dev double la première lecture.
  let failing = true
  api.on('GET', '/api/settings/inbox', () =>
    failing ? { status: 500, body: { error: 'Internal Server Error' } } : { body: { ...INBOX, unavailable: [] } }
  )
  await page.goto('/settings')

  const error = page.getByTestId('admin-inbox-error')
  await expect(error).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Clans' })).toBeVisible()

  failing = false
  await error.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.getByTestId('admin-inbox-item')).toHaveCount(3)
})

test('synchronisation des parties dégradée : une ligne vers la fraîcheur des parties (docs/TODO/fraicheur-des-parties.md)', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  api.on('GET', '/api/settings/inbox', {
    body: {
      generatedAt: '2026-10-29T20:00:00.000Z',
      unavailable: [],
      items: [
        {
          key: 'match_sync',
          tone: 'urgent',
          count: 2,
          label: 'Synchronisation des parties',
          detail: 'Aucun tour terminé depuis 2 h 10 (et 1 autre)',
          href: '/settings/cron#fraicheur',
        },
      ],
    } satisfies AdminInbox,
  })
  await page.goto('/settings')

  const item = page.getByTestId('admin-inbox').getByTestId('admin-inbox-item').filter({ hasText: 'Synchronisation des parties' })
  await expect(item).toContainText('Aucun tour terminé depuis 2 h 10 (et 1 autre)')
  await expect(item.getByRole('link').first()).toHaveAttribute('href', '/settings/cron#fraicheur')
})
