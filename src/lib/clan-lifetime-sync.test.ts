import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Synchronisation de la carrière (toutes les 4 heures, docs/TODO/synchro-parties-30-min.md) : en priorité basse dans
 * la file PUBG, et rattrapage des parties que seule la réponse `seasons/lifetime` référence. Prisma et PUBG simulés.
 */

const mocks = vi.hoisted(() => ({
  clanFindUnique: vi.fn(),
  memberFindMany: vi.fn(),
  memberUpdate: vi.fn(),
  lifetimeUpsert: vi.fn(),
  fetchLifetimeStats: vi.fn(),
  searchPlayerByName: vi.fn(),
  importMatchesForMember: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clan: { findUnique: mocks.clanFindUnique },
    clanMember: { findMany: mocks.memberFindMany, update: mocks.memberUpdate },
    memberLifetimeStats: { upsert: mocks.lifetimeUpsert },
  },
}))
vi.mock('@/lib/pubg', () => ({
  fetchLifetimeStats: mocks.fetchLifetimeStats,
  searchPlayerByName: mocks.searchPlayerByName,
  fetchClanMembers: vi.fn(),
  fetchPlayerClan: vi.fn(),
  fetchPubgClanById: vi.fn(),
}))
vi.mock('@/lib/matches-sync-service', () => ({ importMatchesForMember: mocks.importMatchesForMember }))
vi.mock('@/lib/clan-subdomain-service', () => ({ assignClanSubdomainSafely: vi.fn() }))
vi.mock('@/lib/stats-calculator', () => ({ recalculateStatsForClan: vi.fn() }))

import { syncClanLifetimeStats } from './clan-service'

const stats = (recentMatchIds: string[]) => ({
  combat: {},
  victory: {},
  support: {},
  vehicle: {},
  movement: {},
  other: {},
  byMode: { squad: null, duo: null, solo: null },
  recentMatchIds,
})

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.clanFindUnique.mockResolvedValue({ id: 7 })
  mocks.memberFindMany.mockResolvedValue([
    { id: 1, displayName: 'Alpha', pubgPlayerName: 'alpha', pubgAccountId: 'account.1', platformShard: 'steam' },
    { id: 2, displayName: 'Bravo', pubgPlayerName: 'bravo', pubgAccountId: 'account.2', platformShard: 'steam' },
  ])
  mocks.lifetimeUpsert.mockResolvedValue({})
  mocks.fetchLifetimeStats.mockImplementation(async (accountId: string) => stats(accountId === 'account.1' ? ['m1', 'm2'] : []))
  mocks.importMatchesForMember.mockImplementation(async ({ matchIds }: { matchIds: string[] }) => ({ importedCount: matchIds.length ? 1 : 0, errors: [] }))
})

describe('syncClanLifetimeStats', () => {
  it('lit la carrière en priorité basse : la synchronisation des parties passe devant', async () => {
    await syncClanLifetimeStats(7)
    expect(mocks.fetchLifetimeStats).toHaveBeenCalledWith('account.1', 'steam', { clanId: 7, memberId: 1, source: 'clan-lifetime-sync', priority: 'low' })
  })

  it('rattrape les parties référencées par la carrière, membre par membre, sans faire échouer la carrière', async () => {
    mocks.importMatchesForMember.mockImplementationOnce(async () => {
      throw new Error('base indisponible')
    })

    const result = await syncClanLifetimeStats(7)

    expect(mocks.importMatchesForMember).toHaveBeenCalledWith({
      clanId: 7,
      member: { id: 1, displayName: 'Alpha', platformShard: 'steam', pubgAccountId: 'account.1' },
      matchIds: ['m1', 'm2'],
    })
    expect(mocks.importMatchesForMember).toHaveBeenCalledTimes(2)
    // L'échec du rattrapage n'efface pas la carrière lue.
    expect(result).toMatchObject({ refreshedCount: 2, skippedCount: 0, importedMatches: 0 })
    expect(result.errors).toEqual(['Member 1: rattrapage des parties — base indisponible'])
  })

  it('compte les parties rattrapées', async () => {
    const result = await syncClanLifetimeStats(7)
    expect(result).toMatchObject({ refreshedCount: 2, importedMatches: 1, errors: [] })
  })
})
