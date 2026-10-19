import { buildClanOnboarding, type ClanOnboardingFacts } from '@/lib/clan-onboarding/build'

import { expect, test } from './support/api'
import { mockMemberSession, withSessionCookie } from './support/session'

/**
 * Mise en route d'un clan (/settings/clans/[clanId]/mise-en-route, SuperUser) — docs/features/inscription-clan.md : sept
 * étapes, prochaine étape en tête, deux actions directes qui appellent les routes existantes (`cron-control`,
 * `telemetry/recoveries`) puis relisent la checklist. Réponses construites par le vrai calcul
 * (`src/lib/clan-onboarding/build.ts`) sur des faits fictifs ; toutes les API sont simulées.
 */

const CLAN = 431
const NOW = new Date('2026-10-19T12:00:00.000Z')

function facts(stage: 'fresh' | 'synced' | 'queued'): ClanOnboardingFacts {
  return {
    clan: {
      id: CLAN,
      name: 'Les Ratz',
      tag: 'RATZ',
      pubgClanId: 'clan.ratz',
      isActive: true,
      archivedAt: null,
      archivedReason: null,
      subdomain: 'ratz',
      createdAt: new Date('2026-10-19T08:00:00.000Z'),
    },
    owners: [{ playerName: 'Vvila', active: true, hasAccount: false, invite: { expiresAt: new Date('2026-10-21T08:00:00.000Z') } }],
    activeMembers: 4,
    pendingJoinRequests: 1,
    detectedCandidates: 3,
    matches:
      stage === 'fresh'
        ? { individual: 0, squads: 0, officialSquads: 0, lastSquadAt: null }
        : { individual: 120, squads: 30, officialSquads: 25, lastSquadAt: new Date('2026-10-18T21:00:00.000Z') },
    lastMatchSync: stage === 'fresh' ? null : { status: 'success', startedAt: new Date('2026-10-19T11:00:00.000Z') },
    telemetry: stage === 'fresh' ? null : stage === 'synced' ? { toQueue: 30, urgent: 6, inQueue: 0, completionRate: 0 } : { toQueue: 0, urgent: 0, inQueue: 30, completionRate: 0 },
    statsReady: false,
  }
}

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

test('checklist : synchroniser les matchs, puis mettre la télémétrie en file', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  let stage: 'fresh' | 'synced' | 'queued' = 'fresh'
  const posted: Array<{ path: string; body: unknown }> = []
  api
    .on('GET', `/api/settings/clans/${CLAN}/onboarding`, () => ({ body: buildClanOnboarding(facts(stage), NOW) }))
    .on('POST', `/api/clans/${CLAN}/cron-control`, (url, request) => {
      posted.push({ path: url.pathname, body: request.postDataJSON() })
      stage = 'synced'
      return { body: { ok: true, action: 'sync_matches', message: 'Synchronisation des matchs terminee: 120 match(s) importé(s).' } }
    })
    .on('POST', `/api/clans/${CLAN}/telemetry/recoveries`, (url, request) => {
      const body = request.postDataJSON() as { action: string }
      posted.push({ path: url.pathname, body })
      stage = 'queued'
      // Urgences d'abord (6), puis le reste de l'arriéré (24).
      return { body: { ok: true, data: { queuedCount: body.action === 'enqueue_urgent' ? 6 : 24, alreadyQueuedCount: 0 } } }
    })
  await page.goto(`/settings/clans/${CLAN}/mise-en-route`)

  await expect(page.getByRole('heading', { level: 1, name: 'Mise en route' })).toBeVisible()
  await expect(page.getByText('2/7 étapes faites')).toBeVisible()
  await expect(page.getByTestId('onboarding-next')).toContainText('Prochaine étape : Parties importées')

  const steps = page.getByTestId('onboarding-steps')
  const step = (key: string) => steps.locator(`[data-key="${key}"]`)
  await expect(step('owner')).toHaveAttribute('data-status', 'waiting')
  await expect(step('owner')).toContainText('Facultatif')
  await expect(step('members').getByRole('link', { name: 'Candidats détectés (3)' })).toHaveAttribute('href', '/settings/clans')
  await expect(step('telemetry')).toHaveAttribute('data-status', 'blocked')

  await step('matches').getByTestId('onboarding-action-sync_matches').click()
  await expect(step('matches')).toContainText('120 match(s) importé(s)')
  await expect(step('matches')).toHaveAttribute('data-status', 'done')
  await expect(step('telemetry')).toContainText('30 parties à mettre en file, dont 6 qui expirent sous 7 jours.')
  await expect(page.getByTestId('onboarding-next')).toContainText('Prochaine étape : Télémétrie analysée')

  await step('telemetry').getByTestId('onboarding-action-enqueue_telemetry').click()
  await expect(step('telemetry')).toContainText('30 partie(s) mise(s) en file.')
  await expect(step('telemetry')).toHaveAttribute('data-status', 'waiting')
  await expect(page.getByTestId('onboarding-next')).toContainText('Rien à faire de ton côté')

  expect(posted).toEqual([
    { path: `/api/clans/${CLAN}/cron-control`, body: { action: 'sync_matches' } },
    { path: `/api/clans/${CLAN}/telemetry/recoveries`, body: { action: 'enqueue_urgent' } },
    { path: `/api/clans/${CLAN}/telemetry/recoveries`, body: { action: 'enqueue_backlog' } },
  ])

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('une action refusée s’affiche sous son étape, sans relire la checklist', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  api
    .on('GET', `/api/settings/clans/${CLAN}/onboarding`, { body: buildClanOnboarding(facts('fresh'), NOW) })
    .on('POST', `/api/clans/${CLAN}/cron-control`, { status: 500, body: { error: 'PUBG API indisponible' } })
  await page.goto(`/settings/clans/${CLAN}/mise-en-route`)

  const matches = page.getByTestId('onboarding-steps').locator('[data-key="matches"]')
  await matches.getByTestId('onboarding-action-sync_matches').click()
  await expect(matches).toContainText('PUBG API indisponible')
  await expect(matches).toHaveAttribute('data-status', 'todo')
})
