import type { PlayersDirectoryResult, PlayersDirectoryRow } from '@/lib/players-directory'

import { expect, test } from './support/api'
import { mockMemberSession, withSessionCookie } from './support/session'

/**
 * Annuaire des joueurs — page SuperUser /settings/players (docs/TODO/players.md). « Suivre » passe par
 * `POST /api/settings/opponents/track`, qui refuse (409) de réactiver sans confirmation un membre archivé, parti ou en
 * attente (décision du 2026-10-20) : la page demande la confirmation quand l'état affiché le montre, et sinon reprend
 * l'explication de la route. Toutes les API sont simulées : personne n'est suivi en base.
 */

const DEMO = { id: 1, tag: 'DEMO', name: 'Clan Démo', isSystem: false, platformShard: 'steam' }
const PARKING = { id: 9, tag: 'UNG', name: 'Sans clan', isSystem: true, platformShard: 'steam' }

function row(playerId: string, name: string, tracking: PlayersDirectoryRow['tracking']): PlayersDirectoryRow {
  return {
    playerId,
    pubgAccountId: `account.${playerId}`,
    platformShard: 'steam',
    pubgPlayerName: name,
    isFavorite: false,
    firstSeenAt: '2026-09-01T18:00:00.000Z',
    lastSeenAt: '2026-10-18T21:00:00.000Z',
    lookupUrl: `https://pubg.op.gg/user/${name}`,
    pubgClan: { state: 'unknown' },
    encounters: { total: 12, asTeammate: 2, asOpponent: 10, distinctClanCount: 1, byClan: [] },
    tracking,
    recentChange: null,
  }
}

const ROWS = [
  row('p-archived', 'Revenant', {
    status: 'archived',
    reason: 'ungrouped_inactive',
    member: { id: 41, displayName: 'Revenant', clan: { id: 9, tag: 'UNG', name: 'Sans clan', isSystem: true } },
  }),
  row('p-free', 'Inconnu_Libre', { status: 'untracked', reason: null, member: null }),
]

const DIRECTORY: PlayersDirectoryResult = {
  rows: ROWS,
  pagination: { page: 1, pageSize: 50, total: ROWS.length, totalPages: 1 },
  sort: { by: 'lastSeenAt', order: 'desc', fallback: null },
  counters: { totalPlayers: 2, trackedPlayers: 0, untrackedPlayers: 1, soloPlayers: 0 },
  trackableClans: [DEMO, PARKING],
  unlinkedMembers: [],
}

type TrackBody = { playerId: string; targetClanId?: number; confirmMove?: boolean; confirmReactivation?: boolean }

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

function mockDirectory(api: Parameters<typeof mockMemberSession>[0]) {
  mockMemberSession(api, { superUser: true })
  const tracks: TrackBody[] = []
  api
    .on('GET', '/api/settings/players', { body: DIRECTORY })
    .on('POST', '/api/settings/opponents/track', (_url, request) => {
      const body = request.postDataJSON() as TrackBody
      tracks.push(body)
      // L'annuaire croit « Inconnu_Libre » libre ; la route retrouve une ancienne fiche par son pseudo.
      if (body.playerId === 'p-free' && !body.confirmReactivation) {
        return {
          status: 409,
          body: {
            error: 'member_needs_reactivation',
            message: 'Inconnu_Libre n’est plus suivi dans [OLD] Ancien clan. Confirme pour le réactiver.',
            trackingStatus: 'stopped',
            currentClan: { id: 5, tag: 'OLD', name: 'Ancien clan' },
          },
        }
      }
      return { body: { id: 41, clanId: body.targetClanId } }
    })
  return tracks
}

async function pickTarget(page: import('@playwright/test').Page, menu: RegExp, clan: string) {
  await page.getByRole('button', { name: menu }).click()
  await page.getByRole('menuitemradio', { name: clan }).click()
}

test('membre archivé : confirmation avant l’appel, puis réactivation confirmée envoyée à la route', async ({ api, page }) => {
  const tracks = mockDirectory(api)
  await page.goto('/settings/players')

  await pickTarget(page, /^Réactiver dans Revenant/, '[DEMO] Clan Démo')
  const dialog = page.getByRole('dialog', { name: 'Réactiver ce joueur ?' })
  await expect(dialog).toContainText('Revenant est actuellement')
  expect(tracks).toEqual([])

  await dialog.getByRole('button', { name: 'Réactiver' }).click()
  await expect(page.getByText('Revenant est désormais suivi dans [DEMO] Clan Démo.')).toBeVisible()
  expect(tracks).toEqual([{ playerId: 'p-archived', targetClanId: 1, confirmReactivation: true }])
})

test('état affiché périmé : le 409 de la route ouvre la confirmation avec son explication', async ({ api, page }) => {
  const tracks = mockDirectory(api)
  await page.goto('/settings/players')

  await pickTarget(page, /^Suivre dans Inconnu_Libre/, '[DEMO] Clan Démo')
  const dialog = page.getByRole('dialog', { name: 'Réactiver ce joueur ?' })
  await expect(dialog).toContainText('Inconnu_Libre n’est plus suivi dans [OLD] Ancien clan.')
  await expect(dialog).toContainText('Le réactiver dans [DEMO] Clan Démo ?')

  await dialog.getByRole('button', { name: 'Réactiver' }).click()
  await expect(page.getByText('Inconnu_Libre est désormais suivi dans [DEMO] Clan Démo.')).toBeVisible()
  expect(tracks).toEqual([
    { playerId: 'p-free', targetClanId: 1 },
    { playerId: 'p-free', targetClanId: 1, confirmReactivation: true },
  ])
})

test('annuler la réactivation : aucun appel', async ({ api, page }) => {
  const tracks = mockDirectory(api)
  await page.goto('/settings/players')

  await pickTarget(page, /^Réactiver dans Revenant/, '[DEMO] Clan Démo')
  await page.getByRole('dialog', { name: 'Réactiver ce joueur ?' }).getByRole('button', { name: 'Annuler' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(tracks).toEqual([])
})
