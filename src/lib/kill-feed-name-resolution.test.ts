import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  playerFindMany: vi.fn(),
  encounteredFindMany: vi.fn(),
  lookupFindMany: vi.fn(),
  lookupUpsert: vi.fn(),
  lookupDeleteMany: vi.fn(),
  fetchPlayerIdentity: vi.fn(),
  syncOpponentIdentityForMember: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    player: { findMany: mocks.playerFindMany },
    encounteredPlayer: { findMany: mocks.encounteredFindMany },
    killFeedAccountLookup: { findMany: mocks.lookupFindMany, upsert: mocks.lookupUpsert, deleteMany: mocks.lookupDeleteMany },
  },
}))
vi.mock('@/lib/pubg', () => ({ fetchPlayerIdentity: mocks.fetchPlayerIdentity }))
vi.mock('@/lib/player-clan-identity', () => ({ syncOpponentIdentityForMember: mocks.syncOpponentIdentityForMember }))

import { resetKillFeedDiscoveryCache, resolveKillFeedAccount, selectUnnamedKillFeedAccounts } from '@/lib/kill-feed-name-resolution'

const account = (id: string) => ({ pubgAccountId: id, platformShard: 'steam' })

beforeEach(() => {
  resetKillFeedDiscoveryCache()
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.playerFindMany.mockResolvedValue([])
  mocks.encounteredFindMany.mockResolvedValue([])
  mocks.lookupFindMany.mockResolvedValue([])
  mocks.lookupUpsert.mockResolvedValue({})
  mocks.lookupDeleteMany.mockResolvedValue({ count: 0 })
})

describe('selectUnnamedKillFeedAccounts', () => {
  it('découvre une fois, puis sert le lot depuis la liste en cache (pas de nouveau balayage de KillEvent)', async () => {
    mocks.queryRaw.mockResolvedValue([account('a'), account('b'), account('c')])
    expect(await selectUnnamedKillFeedAccounts(2)).toEqual([account('a'), account('b')])
    expect(await selectUnnamedKillFeedAccounts(2)).toEqual([account('c')])
    expect(await selectUnnamedKillFeedAccounts(2)).toEqual([])
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1)
  })

  it('écarte un compte nommé entre-temps (Player ou joueur croisé) ou abandonné', async () => {
    mocks.queryRaw.mockResolvedValue([account('a'), account('b'), account('c'), account('d')])
    mocks.playerFindMany.mockResolvedValue([account('a')])
    mocks.encounteredFindMany.mockResolvedValue([account('b')])
    mocks.lookupFindMany.mockResolvedValue([account('c')])
    expect(await selectUnnamedKillFeedAccounts(5)).toEqual([account('d')])
  })

  it('redécouvre après l’échéance de 6 h', async () => {
    mocks.queryRaw.mockResolvedValue([])
    await selectUnnamedKillFeedAccounts(5, 0)
    await selectUnnamedKillFeedAccounts(5, 60 * 60 * 1000)
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1)
    await selectUnnamedKillFeedAccounts(5, 7 * 60 * 60 * 1000)
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2)
  })

  it('lot vide : aucune requête', async () => {
    expect(await selectUnnamedKillFeedAccounts(0)).toEqual([])
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })
})

describe('resolveKillFeedAccount', () => {
  it('nom et clan en un appel, enregistrés comme un joueur croisé ; la ligne d’échec éventuelle disparaît', async () => {
    mocks.fetchPlayerIdentity.mockResolvedValue({ name: 'Fantôme', clan: { id: 'clan.x', tag: 'GHO', name: 'Ghosts' } })
    expect(await resolveKillFeedAccount(account('a'))).toEqual({ outcome: 'resolved_with_clan', name: 'Fantôme' })
    expect(mocks.syncOpponentIdentityForMember).toHaveBeenCalledWith({
      pubgAccountId: 'a',
      platformShard: 'steam',
      pubgPlayerName: 'Fantôme',
      clan: { pubgClanId: 'clan.x', tag: 'GHO', name: 'Ghosts' },
    })
    expect(mocks.lookupDeleteMany).toHaveBeenCalledWith({ where: account('a') })
  })

  it('compte inconnu de l’API (404 ou sans nom) : marqué introuvable, plus jamais redemandé', async () => {
    mocks.fetchPlayerIdentity.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
    expect(await resolveKillFeedAccount(account('a'))).toEqual({ outcome: 'not_found' })
    expect(mocks.lookupUpsert.mock.calls[0][0].create).toMatchObject({ pubgAccountId: 'a', notFound: true, attempts: 1 })

    mocks.fetchPlayerIdentity.mockResolvedValueOnce({ name: null, clan: null })
    expect(await resolveKillFeedAccount(account('b'))).toEqual({ outcome: 'not_found' })
    expect(mocks.syncOpponentIdentityForMember).not.toHaveBeenCalled()
  })

  it('autre échec (quota, réseau) : une tentative de plus, pas « introuvable »', async () => {
    mocks.fetchPlayerIdentity.mockRejectedValue(Object.assign(new Error('Too Many Requests'), { status: 429 }))
    const result = await resolveKillFeedAccount(account('a'))
    expect(result.outcome).toBe('failed')
    expect(mocks.lookupUpsert.mock.calls[0][0].create).toMatchObject({ notFound: false, attempts: 1 })
    expect(mocks.lookupUpsert.mock.calls[0][0].update).toMatchObject({ notFound: false, attempts: { increment: 1 } })
  })
})
