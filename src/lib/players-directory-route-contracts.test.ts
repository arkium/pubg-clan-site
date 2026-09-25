import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contrats des routes de l'annuaire des joueurs (docs/TODO/players.md §9.B) :
 * `GET /api/settings/players`, `PATCH /api/settings/players/[id]/favorite` et
 * `POST /api/settings/opponents/track`, que l'annuaire appelle pour « Suivre ».
 *
 * Convention du dépôt : les tests vivent dans `src/lib/` et importent les handlers depuis
 * `src/app/` (vitest.config.ts ne collecte que `src/lib`). Le 409 et le transfert confirmé
 * de `track` sont déjà couverts par player-clan-identity.test.ts.
 */

vi.mock('server-only', () => ({}))

// Les mocks Prisma listent les modèles un par un : tout modèle utilisé par les routes
// testées doit apparaître ici (piège documenté dans CLAUDE.md).
const mocks = vi.hoisted(() => ({
  requireSuperUser: vi.fn(),
  getSessionFromRequest: vi.fn(),
  syncOpponentIdentityForMemberId: vi.fn(),
  clanMemberFindMany: vi.fn(),
  clanMemberFindFirst: vi.fn(),
  clanMemberUpdate: vi.fn(),
  clanMemberCreate: vi.fn(),
  playerFindMany: vi.fn(),
  playerFindUnique: vi.fn(),
  playerCount: vi.fn(),
  playerUpdate: vi.fn(),
  clanFindMany: vi.fn(),
  clanFindUnique: vi.fn(),
  clanEncounterFindMany: vi.fn(),
  clanEncounterGroupBy: vi.fn(),
  playerClanChangeFindMany: vi.fn(),
  playerClanChangeCreate: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    clanMember: {
      findMany: mocks.clanMemberFindMany,
      findFirst: mocks.clanMemberFindFirst,
      update: mocks.clanMemberUpdate,
      create: mocks.clanMemberCreate,
    },
    player: {
      findMany: mocks.playerFindMany,
      findUnique: mocks.playerFindUnique,
      count: mocks.playerCount,
      update: mocks.playerUpdate,
    },
    clan: { findMany: mocks.clanFindMany, findUnique: mocks.clanFindUnique },
    clanEncounter: { findMany: mocks.clanEncounterFindMany, groupBy: mocks.clanEncounterGroupBy },
    playerClanChange: { findMany: mocks.playerClanChangeFindMany, create: mocks.playerClanChangeCreate },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireSuperUser: mocks.requireSuperUser,
}))

vi.mock('@/lib/auth-session', () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}))

vi.mock('@/lib/player-clan-identity', () => ({
  syncOpponentIdentityForMemberId: mocks.syncOpponentIdentityForMemberId,
}))

import { GET as getPlayersRoute } from '@/app/api/settings/players/route'
import { PATCH as patchFavoriteRoute } from '@/app/api/settings/players/[id]/favorite/route'
import { POST as postTrackRoute } from '@/app/api/settings/opponents/track/route'

const ACCOUNT = 'account.4f0c2b7d9e1a4c55b3d2e8f6a7b9c0d1'

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireSuperUser.mockResolvedValue(null)
  mocks.getSessionFromRequest.mockResolvedValue({ userId: 1 })
  mocks.syncOpponentIdentityForMemberId.mockResolvedValue(undefined)
})

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = () => Response.json({ error: 'Forbidden' }, { status: 403 })

describe('GET /api/settings/players', () => {
  beforeEach(() => {
    mocks.clanMemberFindMany.mockResolvedValue([])
    mocks.playerFindMany.mockResolvedValue([])
    mocks.playerCount.mockResolvedValue(0)
    mocks.clanFindMany.mockResolvedValue([{ id: 7, tag: 'SMK', name: 'Smoke', isSystem: false, platformShard: 'steam' }])
    mocks.clanEncounterFindMany.mockResolvedValue([])
    mocks.playerClanChangeFindMany.mockResolvedValue([])
  })

  it.each([
    ['sans session', unauthorized, 401],
    ['compte non SuperUser', forbidden, 403],
  ])('%s → %i, sans lecture en base', async (_label, response, status) => {
    mocks.requireSuperUser.mockResolvedValue(response())

    const result = await getPlayersRoute(new Request('http://localhost/api/settings/players'))

    expect(result.status).toBe(status)
    expect(mocks.clanMemberFindMany).not.toHaveBeenCalled()
    expect(mocks.playerFindMany).not.toHaveBeenCalled()
  })

  it('applique les valeurs par défaut aux paramètres invalides', async () => {
    const result = await getPlayersRoute(
      new Request('http://localhost/api/settings/players?status=bogus&pageSize=999&sortBy=kills')
    )
    const body = await result.json()

    expect(result.status).toBe(200)
    expect(mocks.playerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 100, orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }] })
    )
    expect(body.pagination).toEqual({ page: 1, pageSize: 100, total: 0, totalPages: 1 })
    expect(body.trackableClans).toHaveLength(1)
  })

  it('ne calcule les compteurs que sur demande', async () => {
    const without = await (await getPlayersRoute(new Request('http://localhost/api/settings/players'))).json()
    expect(without.counters).toBeNull()

    mocks.playerCount.mockResolvedValue(10)
    const withCounters = await (
      await getPlayersRoute(new Request('http://localhost/api/settings/players?counters=1'))
    ).json()
    expect(withCounters.counters).toEqual({ totalPlayers: 10, trackedPlayers: 0, untrackedPlayers: 10, soloPlayers: 10 })
  })

  it('répond 500 sans détail interne quand la base échoue', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.clanMemberFindMany.mockRejectedValue(new Error('connection lost'))

    const result = await getPlayersRoute(new Request('http://localhost/api/settings/players'))

    expect(result.status).toBe(500)
    expect(await result.json()).toEqual({ error: 'Internal Server Error' })
    error.mockRestore()
  })
})

describe('PATCH /api/settings/players/[id]/favorite', () => {
  function favoriteRequest(body: string) {
    return new Request('http://localhost/api/settings/players/p1/favorite', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }) as never
  }
  const params = { params: Promise.resolve({ id: 'p1' }) }

  it('bascule le favori', async () => {
    mocks.playerUpdate.mockResolvedValue({ id: 'p1', isFavorite: true })

    const result = await patchFavoriteRoute(favoriteRequest(JSON.stringify({ isFavorite: true })), params)

    expect(result.status).toBe(200)
    expect(mocks.playerUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { isFavorite: true } })
  })

  it('répond 404 pour un joueur inconnu (P2025)', async () => {
    mocks.playerUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: 'test' })
    )

    const result = await patchFavoriteRoute(favoriteRequest(JSON.stringify({ isFavorite: true })), params)

    expect(result.status).toBe(404)
  })

  it.each([
    ['isFavorite non booléen', JSON.stringify({ isFavorite: 'yes' })],
    ['corps JSON invalide', '{not json'],
  ])('%s → 400', async (_label, body) => {
    const result = await patchFavoriteRoute(favoriteRequest(body), params)

    expect(result.status).toBe(400)
    expect(mocks.playerUpdate).not.toHaveBeenCalled()
  })

  it.each([
    ['sans session', unauthorized, 401],
    ['compte non SuperUser', forbidden, 403],
  ])('%s → %i', async (_label, response, status) => {
    mocks.requireSuperUser.mockResolvedValue(response())

    const result = await patchFavoriteRoute(favoriteRequest(JSON.stringify({ isFavorite: true })), params)

    expect(result.status).toBe(status)
    expect(mocks.playerUpdate).not.toHaveBeenCalled()
  })
})

describe('POST /api/settings/opponents/track — comportements utilisés par l annuaire', () => {
  function trackRequest(body: unknown) {
    return new Request('http://localhost/api/settings/opponents/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  }

  beforeEach(() => {
    mocks.playerFindUnique.mockResolvedValue({
      id: 'player-1',
      pubgAccountId: ACCOUNT,
      pubgPlayerName: 'ShadowSniper',
      platformShard: 'steam',
    })
    mocks.clanFindUnique.mockResolvedValue({ pubgClanId: 'clan.smk', tag: 'SMK' })
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        clanMember: { update: mocks.clanMemberUpdate },
        clan: { findUnique: mocks.clanFindUnique },
        playerClanChange: { create: mocks.playerClanChangeCreate },
      })
    )
  })

  it.each([
    ['sans session', unauthorized, 401],
    ['compte non SuperUser', forbidden, 403],
  ])('%s → %i, sans écriture', async (_label, response, status) => {
    mocks.requireSuperUser.mockResolvedValue(response())

    const result = await postTrackRoute(trackRequest({ playerId: 'player-1', targetClanId: 7 }))

    expect(result.status).toBe(status)
    expect(mocks.clanMemberCreate).not.toHaveBeenCalled()
  })

  it('400 sans playerId, 404 pour un joueur inconnu', async () => {
    expect((await postTrackRoute(trackRequest({ targetClanId: 7 }))).status).toBe(400)

    mocks.playerFindUnique.mockResolvedValue(null)
    expect((await postTrackRoute(trackRequest({ playerId: 'nope', targetClanId: 7 }))).status).toBe(404)
  })

  it('crée un membre actif pour un joueur libre — sans ligne de journal (comportement actuel)', async () => {
    mocks.clanMemberFindFirst.mockResolvedValue(null)
    mocks.clanMemberCreate.mockResolvedValue({ id: 500 })

    const result = await postTrackRoute(trackRequest({ playerId: 'player-1', targetClanId: 7 }))

    expect(result.status).toBe(200)
    expect(mocks.clanMemberCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pubgAccountId: ACCOUNT,
        platformShard: 'steam',
        isActive: true,
        joinStatus: 'active',
        clanId: 7,
        playerId: 'player-1',
      }),
    })
    // Question ouverte (players.md §10) : l'entrée dans le périmètre n'est pas journalisée.
    expect(mocks.playerClanChangeCreate).not.toHaveBeenCalled()
    expect(mocks.syncOpponentIdentityForMemberId).toHaveBeenCalledWith(500)
  })

  it('refuse (400) un joueur déjà actif dans le clan cible', async () => {
    mocks.clanMemberFindFirst.mockResolvedValue({ id: 191, clanId: 7, isActive: true, joinStatus: 'active' })

    const result = await postTrackRoute(trackRequest({ playerId: 'player-1', targetClanId: 7 }))

    expect(result.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('réactive un membre archivé SANS confirmation et trace le mouvement (comportement actuel)', async () => {
    mocks.clanMemberFindFirst.mockResolvedValue({
      id: 191,
      clanId: 1,
      isActive: false,
      joinStatus: 'active',
      archivedReason: 'ungrouped_inactive',
    })
    mocks.clanMemberUpdate.mockResolvedValue({ id: 191, clanId: 7 })

    const result = await postTrackRoute(trackRequest({ playerId: 'player-1', targetClanId: 7 }))

    // Pas de 409 : la route ne protège que les membres ACTIFS d'un autre clan. L'annuaire
    // demande donc confirmation côté interface (players.md §10).
    expect(result.status).toBe(200)
    expect(mocks.clanMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: true, joinStatus: 'active', clanId: 7 }) })
    )
    expect(mocks.playerClanChangeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ previousClanId: 1, newClanId: 7, source: 'manual_transfer' }),
      })
    )
  })

  it('convertit une demande /join en attente en membre actif, sans confirmation (comportement actuel)', async () => {
    mocks.clanMemberFindFirst.mockResolvedValue({ id: 250, clanId: 9, isActive: false, joinStatus: 'pending' })
    mocks.clanMemberUpdate.mockResolvedValue({ id: 250, clanId: 7 })

    const result = await postTrackRoute(trackRequest({ playerId: 'player-1', targetClanId: 7 }))

    expect(result.status).toBe(200)
    expect(mocks.clanMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 250 }, data: expect.objectContaining({ joinStatus: 'active' }) })
    )
  })

  it('retrouve aussi une fiche par pseudo seul — risque de collision après un changement de pseudo', async () => {
    mocks.clanMemberFindFirst.mockResolvedValue(null)
    mocks.clanMemberCreate.mockResolvedValue({ id: 501 })

    await postTrackRoute(trackRequest({ playerId: 'player-1', targetClanId: 7 }))

    expect(mocks.clanMemberFindFirst).toHaveBeenCalledWith({
      where: {
        platformShard: 'steam',
        OR: [{ pubgAccountId: ACCOUNT }, { playerId: 'player-1' }, { pubgPlayerName: 'ShadowSniper' }],
      },
    })
  })
})
