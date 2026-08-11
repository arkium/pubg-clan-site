import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    player: { findUnique: vi.fn(), upsert: vi.fn() },
    opponentClan: { upsert: vi.fn() },
    encounteredPlayer: { updateMany: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock('@/lib/pubg', () => ({
  fetchPlayerClan: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { fetchPlayerClan } from '@/lib/pubg'
import {
  resolveOneEncounteredPlayerCandidate,
  selectPrioritizedEncounteredPlayerIdentities,
} from '@/lib/encountered-player-resolution'

const mockedFetchPlayerClan = vi.mocked(fetchPlayerClan)
const candidate = { pubgAccountId: 'acc-1', platformShard: 'steam', pubgPlayerName: 'Praetes' }

describe('resolveOneEncounteredPlayerCandidate', () => {
  beforeEach(() => {
    vi.mocked(prisma.player.findUnique).mockReset()
    vi.mocked(prisma.player.upsert).mockReset()
    vi.mocked(prisma.opponentClan.upsert).mockReset()
    vi.mocked(prisma.encounteredPlayer.updateMany).mockReset()
    mockedFetchPlayerClan.mockReset()
  })

  it('propage un cache-hit récent à toutes les lignes du compte (cross-clan), sans appel PUBG', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue({
      id: 'player-1',
      clanResolvedAt: new Date(),
      opponentClan: { pubgClanId: 'clan-9', tag: 'SVN', name: 'The Seven' },
    } as never)
    vi.mocked(prisma.encounteredPlayer.updateMany).mockResolvedValue({ count: 3 } as never)

    const result = await resolveOneEncounteredPlayerCandidate(candidate)

    expect(result.outcome).toBe('cache_hit')
    expect(result.updatedRowCount).toBe(3)
    expect(mockedFetchPlayerClan).not.toHaveBeenCalled()
    expect(prisma.encounteredPlayer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pubgAccountId: candidate.pubgAccountId, platformShard: candidate.platformShard },
      })
    )
  })

  it('résout un joueur sans clan (clanResolvedAt renseigné, pubgClanTag null) et propage sur toutes les lignes', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue(null as never)
    mockedFetchPlayerClan.mockResolvedValue(null)
    vi.mocked(prisma.player.upsert).mockResolvedValue({ id: 'player-1' } as never)
    vi.mocked(prisma.encounteredPlayer.updateMany).mockResolvedValue({ count: 2 } as never)

    const result = await resolveOneEncounteredPlayerCandidate(candidate)

    expect(result.outcome).toBe('resolved_without_clan')
    expect(result.updatedRowCount).toBe(2)
    expect(prisma.opponentClan.upsert).not.toHaveBeenCalled()
    expect(prisma.encounteredPlayer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pubgClanTag: null, pubgClanId: null }),
      })
    )
  })

  it('résout un joueur avec clan trouvé', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue(null as never)
    mockedFetchPlayerClan.mockResolvedValue({ id: 'clan-9', tag: 'SVN', name: 'The Seven' } as never)
    vi.mocked(prisma.opponentClan.upsert).mockResolvedValue({ id: 'opp-1' } as never)
    vi.mocked(prisma.player.upsert).mockResolvedValue({ id: 'player-1' } as never)
    vi.mocked(prisma.encounteredPlayer.updateMany).mockResolvedValue({ count: 1 } as never)

    const result = await resolveOneEncounteredPlayerCandidate(candidate)

    expect(result.outcome).toBe('resolved_with_clan')
    if (result.outcome === 'resolved_with_clan') {
      expect(result.pubgClanTag).toBe('SVN')
    }
  })

  it("en cas d'échec PUBG, incrémente resolveAttempts sur toutes les lignes du compte (échec partagé cross-clan)", async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue(null as never)
    mockedFetchPlayerClan.mockRejectedValue(new Error('PUBG API down'))
    vi.mocked(prisma.encounteredPlayer.updateMany).mockResolvedValue({ count: 4 } as never)

    const result = await resolveOneEncounteredPlayerCandidate(candidate)

    expect(result.outcome).toBe('failed')
    expect(result.updatedRowCount).toBe(4)
    expect(prisma.encounteredPlayer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pubgAccountId: candidate.pubgAccountId, platformShard: candidate.platformShard },
        data: { resolveAttempts: { increment: 1 } },
      })
    )
  })
})

describe('selectPrioritizedEncounteredPlayerIdentities', () => {
  beforeEach(() => {
    vi.mocked(prisma.encounteredPlayer.groupBy).mockReset()
    vi.mocked(prisma.encounteredPlayer.findMany).mockReset()
  })

  it('demande le tri combatInteractionsCount DESC, distinctClanCount DESC, etc. à la base', async () => {
    vi.mocked(prisma.encounteredPlayer.groupBy).mockResolvedValue([] as never)

    await selectPrioritizedEncounteredPlayerIdentities(5, { minEncounters: 2, maxAttempts: 3 })

    expect(prisma.encounteredPlayer.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['pubgAccountId', 'platformShard'],
        orderBy: [
          { _sum: { combatInteractionsCount: 'desc' } },
          { _count: { clanId: 'desc' } },
          { _sum: { encounterCount: 'desc' } },
          { _max: { lastSeenAt: 'desc' } },
        ],
        take: 5,
      })
    )
  })

  it("récupère et associe le bon nom aux résultats", async () => {
    const lastSeenA = new Date('2026-08-09T00:00:00Z')

    vi.mocked(prisma.encounteredPlayer.groupBy).mockResolvedValue([
      {
        pubgAccountId: 'acc-multi',
        platformShard: 'steam',
        _count: { clanId: 3 },
        _sum: { encounterCount: 12, combatInteractionsCount: 5 },
        _max: { lastSeenAt: lastSeenA },
      },
    ] as never)

    vi.mocked(prisma.encounteredPlayer.findMany).mockResolvedValue([
      { pubgAccountId: 'acc-multi', platformShard: 'steam', pubgPlayerName: 'Praetes' },
    ] as never)

    const result = await selectPrioritizedEncounteredPlayerIdentities(10, {
      minEncounters: 2,
      maxAttempts: 3,
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      pubgAccountId: 'acc-multi',
      platformShard: 'steam',
      pubgPlayerName: 'Praetes',
      distinctClanCount: 3,
      totalEncounterCount: 12,
      lastSeenAt: lastSeenA,
    })
  })
})
