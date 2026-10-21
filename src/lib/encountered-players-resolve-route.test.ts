import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contrat de `POST /api/settings/encountered-players/[id]/resolve` (bouton « Résoudre » du Triage) : depuis la fin
 * d'EncounteredPlayer, étape 3, `id` désigne une ligne `Player` et le statut est celui de l'identité.
 *
 * Convention du dépôt : les tests vivent dans `src/lib/` et importent les handlers depuis `src/app/`.
 */

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  requireSuperUser: vi.fn(),
  getSessionFromRequest: vi.fn(),
  resolveOne: vi.fn(),
  playerFindUnique: vi.fn(),
  playerFindFirst: vi.fn(),
  playerUpdateMany: vi.fn(),
  encounteredPlayerUpdateMany: vi.fn(),
  runCreate: vi.fn(),
  runUpdate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    player: { findUnique: mocks.playerFindUnique, findFirst: mocks.playerFindFirst, updateMany: mocks.playerUpdateMany },
    encounteredPlayer: { updateMany: mocks.encounteredPlayerUpdateMany },
    encounteredPlayerResolutionRun: { create: mocks.runCreate, update: mocks.runUpdate },
  },
}))
vi.mock('@/middleware/auth-permission', () => ({ requireSuperUser: mocks.requireSuperUser }))
vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }))
vi.mock('@/lib/admin-action-log', () => ({ withAdminActionLog: (_template: string, handler: unknown) => handler }))
vi.mock('@/lib/encountered-player-resolution', () => ({ resolveOneEncounteredPlayerCandidate: mocks.resolveOne }))

import { POST as resolveRoute } from '@/app/api/settings/encountered-players/[id]/resolve/route'

const candidate = {
  pubgAccountId: 'account.kromb',
  platformShard: 'steam',
  pubgPlayerName: 'Kromb',
  encounterCount: 4,
  resolveAttempts: 0,
  clanResolvedAt: null,
  opponentClanId: null,
}

let userId = 0

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireSuperUser.mockResolvedValue(null)
  // Un utilisateur par test : le quota de résolutions manuelles est tenu en mémoire par utilisateur.
  userId += 1
  mocks.getSessionFromRequest.mockResolvedValue({ userId })
  mocks.playerFindUnique.mockResolvedValue(null)
  mocks.playerFindFirst.mockResolvedValue(null)
  mocks.runCreate.mockResolvedValue({ id: 'run-1', startedAt: new Date() })
  mocks.runUpdate.mockResolvedValue({})
  mocks.resolveOne.mockResolvedValue({ outcome: 'resolved_with_clan', pubgClanId: 'clan.1', pubgClanTag: 'KRM', pubgClanName: 'Kromb Squad', updatedRowCount: 2 })
})

// Le verrou et le délai de 60 s sont tenus par identité : un compte différent par appel.
let accountSeq = 0
function withFreshAccount(overrides: Record<string, unknown> = {}) {
  accountSeq += 1
  return { ...candidate, pubgAccountId: `account.${accountSeq}`, ...overrides }
}

function post(id: string, query = '') {
  return resolveRoute(new Request(`http://localhost/api/settings/encountered-players/${id}/resolve${query}`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  })
}

describe('POST /api/settings/encountered-players/[id]/resolve', () => {
  it('résout l’identité Player désignée et répond { data: { outcome, clanTag } }', async () => {
    const player = withFreshAccount()
    mocks.playerFindUnique.mockResolvedValue(player)

    const response = await post('player-1')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.playerFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'player-1' } }))
    expect(mocks.resolveOne).toHaveBeenCalledWith(
      { pubgAccountId: player.pubgAccountId, platformShard: 'steam', pubgPlayerName: 'Kromb' },
      { source: 'manual' }
    )
    expect(body.data).toEqual({ outcome: 'resolved_with_clan', viaCache: false, clanTag: 'KRM', clanName: 'Kromb Squad' })
  })

  it('accepte aussi un compte PUBG', async () => {
    mocks.playerFindFirst.mockResolvedValue(withFreshAccount())

    const response = await post('account.kromb')

    expect(response.status).toBe(200)
    expect(mocks.playerFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { pubgAccountId: 'account.kromb' } }))
  })

  it('404 pour un joueur inconnu, sans appel PUBG', async () => {
    const response = await post('inconnu')

    expect(response.status).toBe(404)
    expect(mocks.resolveOne).not.toHaveBeenCalled()
  })

  it('400 pour une identité déjà résolue, quel que soit le clan qui l’a croisée', async () => {
    mocks.playerFindUnique.mockResolvedValue(withFreshAccount({ clanResolvedAt: new Date(), opponentClanId: 'oc-1' }))

    const response = await post('player-1')

    expect(response.status).toBe(400)
    expect(mocks.resolveOne).not.toHaveBeenCalled()
  })

  it('un échec définitif exige « Réessayer », qui remet les essais à zéro sur les deux tables', async () => {
    const player = withFreshAccount({ resolveAttempts: 3 })
    mocks.playerFindUnique.mockResolvedValue(player)

    expect((await post('player-1')).status).toBe(400)

    const response = await post('player-1', '?force=retry')
    const identity = { pubgAccountId: player.pubgAccountId, platformShard: 'steam' }
    expect(response.status).toBe(200)
    expect(mocks.playerUpdateMany).toHaveBeenCalledWith({ where: identity, data: { resolveAttempts: 0 } })
    expect(mocks.encounteredPlayerUpdateMany).toHaveBeenCalledWith({ where: identity, data: { resolveAttempts: 0 } })
    expect(mocks.resolveOne).toHaveBeenCalledTimes(1)
  })

  it('un appel PUBG sans réponse répond 200 avec outcome « failed »', async () => {
    mocks.playerFindUnique.mockResolvedValue(withFreshAccount())
    mocks.resolveOne.mockResolvedValue({ outcome: 'failed', error: new Error('PUBG down'), updatedRowCount: 1 })

    const response = await post('player-1')

    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({ outcome: 'failed' })
  })
})
