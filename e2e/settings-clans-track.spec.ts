import { expect, test } from './support/api'
import { mockMemberSession, withSessionCookie } from './support/session'

/**
 * « Ajouter à l’effectif » de /settings/clans (docs/features/cycle-de-vie-clan.md, « Le garde-fou côté action ») : un
 * candidat dont la fiche est une demande /join en attente n'est plus activé en silence. La route répond 409
 * `member_needs_reactivation` (décision du 2026-10-20, docs/TODO/players.md §10) ; la page confirme en modale, puis
 * renvoie l'appel avec `confirmReactivation`. Toutes les API sont simulées : personne n'est ajouté en base.
 */

const PAGE_INFO = { page: 1, pageSize: 20, total: 1, totalPages: 1 }

const OPPONENTS = {
  counters: { trackedClanCount: 1, opponentClanCount: 0, totalEncounters: 0, noClanPlayerCount: 0, lastComputedAt: null },
  trackedClans: {
    rows: [
      {
        id: 1,
        name: 'Clan Démo',
        tag: 'DEMO',
        isSystem: false,
        membersCount: 4,
        lastMatchAt: '2026-10-18T21:00:00.000Z',
        missingMembersCount: 1,
      },
    ],
    pagination: PAGE_INFO,
  },
  opponentClans: { rows: [], pagination: { ...PAGE_INFO, total: 0, totalPages: 0 } },
}

const PENDING_MESSAGE =
  'Balthazar_99 a une demande d’adhésion en attente dans [DEMO] Clan Démo : le suivre l’active sans attendre la décision de l’Owner. Confirme pour le réactiver.'

type TrackBody = { playerId: string; targetClanId?: number; confirmMove?: boolean; confirmReactivation?: boolean }

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

function mockClansPage(api: Parameters<typeof mockMemberSession>[0]) {
  mockMemberSession(api, { superUser: true })
  const tracks: TrackBody[] = []
  api
    .on('GET', '/api/settings/opponents', { body: OPPONENTS })
    .on('GET', '/api/settings/opponents/clans/1/members', {
      body: {
        members: [{ id: 1, displayName: 'Joueur Alpha' }],
        missingCandidates: [{ playerId: 'p-pending', pubgPlayerName: 'Balthazar_99', trackedElsewhere: null }],
      },
    })
    .on('POST', '/api/settings/opponents/track', (_url, request) => {
      const body = request.postDataJSON() as TrackBody
      tracks.push(body)
      if (!body.confirmReactivation) {
        return {
          status: 409,
          body: {
            error: 'member_needs_reactivation',
            message: PENDING_MESSAGE,
            trackingStatus: 'pending',
            currentClan: { id: 1, tag: 'DEMO', name: 'Clan Démo' },
          },
        }
      }
      return { body: { id: 250, clanId: 1 } }
    })
  return tracks
}

async function openCandidates(page: import('@playwright/test').Page) {
  await page.goto('/settings/clans')
  await page.getByRole('button', { name: /Clan Démo/, expanded: false }).click()
  // Tableau et cartes rendent chacun le détail (l'un masqué) : seul le bouton visible compte.
  await expect(page.getByRole('button', { name: 'Ajouter à l’effectif' })).toBeVisible()
}

test('demande en attente : la modale de réactivation reprend l’avertissement, puis l’ajout confirmé part', async ({ api, page }) => {
  const tracks = mockClansPage(api)
  await openCandidates(page)

  await page.getByRole('button', { name: 'Ajouter à l’effectif' }).click()
  const dialog = page.getByRole('dialog', { name: 'Réactiver ce joueur ?' })
  await expect(dialog).toContainText('sans attendre la décision de l’Owner')

  await dialog.getByRole('button', { name: 'Réactiver' }).click()
  await expect(page.getByText('Joueur suivi avec succès !')).toBeVisible()
  expect(tracks).toEqual([
    { playerId: 'p-pending', targetClanId: 1 },
    { playerId: 'p-pending', targetClanId: 1, confirmReactivation: true },
  ])
})

test('annuler : un seul appel, sans confirmation, et rien n’est activé', async ({ api, page }) => {
  const tracks = mockClansPage(api)
  await openCandidates(page)

  await page.getByRole('button', { name: 'Ajouter à l’effectif' }).click()
  await page.getByRole('dialog', { name: 'Réactiver ce joueur ?' }).getByRole('button', { name: 'Annuler' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Joueur suivi avec succès !')).toHaveCount(0)
  expect(tracks).toEqual([{ playerId: 'p-pending', targetClanId: 1 }])
})
