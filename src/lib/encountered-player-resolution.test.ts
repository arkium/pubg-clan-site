import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    player: { findUnique: vi.fn(), upsert: vi.fn() },
    clanMember: { findFirst: vi.fn() },
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
  resetEncounteredPlayerRankingCache,
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
    // Par défaut le compte croisé n'est pas un membre d'un clan suivi : les cas
    // ci-dessous portent sur la résolution via l'API PUBG.
    vi.mocked(prisma.clanMember.findFirst).mockReset().mockResolvedValue(null as never)
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

  it('auto-découvre un compte déjà membre d’un clan suivi, sans appel PUBG', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValue({
      clan: { id: 3, pubgClanId: 'clan.tracked', tag: 'TRK', name: 'Tracked' },
    } as never)
    vi.mocked(prisma.opponentClan.upsert).mockResolvedValue({ id: 'opp-trk' } as never)
    vi.mocked(prisma.player.upsert).mockResolvedValue({ id: 'player-1' } as never)
    vi.mocked(prisma.encounteredPlayer.updateMany).mockResolvedValue({ count: 2 } as never)

    const result = await resolveOneEncounteredPlayerCandidate(candidate)

    expect(result.outcome).toBe('resolved_with_clan')
    expect(result.updatedRowCount).toBe(2)
    expect(mockedFetchPlayerClan).not.toHaveBeenCalled()
    expect(prisma.clanMember.findFirst).toHaveBeenCalledWith({
      where: {
        pubgAccountId: candidate.pubgAccountId,
        isActive: true,
        joinStatus: 'active',
      },
      include: { clan: true },
    })
    if (result.outcome === 'resolved_with_clan') {
      expect(result.pubgClanTag).toBe('TRK')
    }
  })

  // Régression WESTEN88 (2026-09-22) : promu de UNG vers 47R, il restait affiché
  // comme membre de son ancien clan parce que le cache `Player` — repoussé à chaque
  // rencontre — passait avant la vérification du clan suivi.
  it('fait primer le clan suivi sur un cache Player encore frais mais périmé', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue({
      id: 'player-1',
      clanResolvedAt: new Date(),
      opponentClan: { pubgClanId: 'clan.bofs', tag: 'BOFS', name: 'BOFTEAM' },
    } as never)
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValue({
      clan: { id: 12, pubgClanId: 'clan.47r', tag: '47R', name: '47RONIN47' },
    } as never)
    vi.mocked(prisma.opponentClan.upsert).mockResolvedValue({ id: 'opp-47r' } as never)
    vi.mocked(prisma.player.upsert).mockResolvedValue({ id: 'player-1' } as never)
    vi.mocked(prisma.encounteredPlayer.updateMany).mockResolvedValue({ count: 18 } as never)

    const result = await resolveOneEncounteredPlayerCandidate(candidate)

    expect(result.outcome).toBe('resolved_with_clan')
    if (result.outcome === 'resolved_with_clan') {
      expect(result.pubgClanTag).toBe('47R')
    }
    // Le miroir global est réécrit, pas seulement les lignes par clan.
    expect(prisma.player.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ opponentClanId: 'opp-47r' }) })
    )
    expect(prisma.encounteredPlayer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pubgClanTag: '47R', pubgClanId: 'clan.47r' }),
      })
    )
  })

  it("ne court-circuite pas pour un membre garé dans le parking (clan suivi sans pubgClanId)", async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.clanMember.findFirst).mockResolvedValue({
      clan: { id: 1, pubgClanId: null, tag: 'UNG', name: 'Ungrouped' },
    } as never)
    mockedFetchPlayerClan.mockResolvedValue({ id: 'clan.x', tag: 'XYZ', name: 'Clan X' } as never)
    vi.mocked(prisma.opponentClan.upsert).mockResolvedValue({ id: 'opp-x' } as never)
    vi.mocked(prisma.player.upsert).mockResolvedValue({ id: 'player-1' } as never)
    vi.mocked(prisma.encounteredPlayer.updateMany).mockResolvedValue({ count: 1 } as never)

    const result = await resolveOneEncounteredPlayerCandidate(candidate)

    // Le parking ne dit pas « aucun clan PUBG », il dit « le site n'a pas d'avis » :
    // l'API doit trancher, sinon on perd la découverte d'un clan non suivi.
    expect(mockedFetchPlayerClan).toHaveBeenCalled()
    expect(result.outcome).toBe('resolved_with_clan')
    if (result.outcome === 'resolved_with_clan') {
      expect(result.pubgClanTag).toBe('XYZ')
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
  const thresholds = { minEncounters: 2, maxAttempts: 3 }
  const lastSeen = new Date('2026-08-09T00:00:00Z')

  const group = (pubgAccountId: string, clans = 1, encounters = 2, combat = 0) => ({
    pubgAccountId,
    platformShard: 'steam',
    _count: { clanId: clans },
    _sum: { encounterCount: encounters, combatInteractionsCount: combat },
    _max: { lastSeenAt: lastSeen },
  })

  const identity = (pubgAccountId: string) => ({ pubgAccountId, platformShard: 'steam' })

  // Les appels groupBy se distinguent par leur filtre : `OR` = liste restreinte d'identités
  // (palier 1 ou revérification du cache), sans `OR` = classement complet (palier 2).
  const isFullRanking = (args: { where: Record<string, unknown> }) => !('OR' in args.where)

  beforeEach(() => {
    resetEncounteredPlayerRankingCache()
    vi.mocked(prisma.encounteredPlayer.groupBy).mockReset()
    vi.mocked(prisma.encounteredPlayer.findMany).mockReset()
  })

  it('garde l’ordre de priorité et départage les ex æquo par compte', async () => {
    vi.mocked(prisma.encounteredPlayer.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.encounteredPlayer.groupBy).mockResolvedValue([] as never)

    await selectPrioritizedEncounteredPlayerIdentities(5, thresholds)

    expect(prisma.encounteredPlayer.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['pubgAccountId', 'platformShard'],
        orderBy: [
          { _sum: { combatInteractionsCount: 'desc' } },
          { _count: { clanId: 'desc' } },
          { _sum: { encounterCount: 'desc' } },
          { _max: { lastSeenAt: 'desc' } },
          { pubgAccountId: 'asc' },
        ],
      })
    )
  })

  it('palier 1 : si les identités avec combat remplissent le lot, aucun classement complet n’est calculé', async () => {
    vi.mocked(prisma.encounteredPlayer.findMany)
      .mockResolvedValueOnce([identity('acc-a'), identity('acc-b')] as never)
      .mockResolvedValueOnce([
        { pubgAccountId: 'acc-a', platformShard: 'steam', pubgPlayerName: 'Alpha' },
        { pubgAccountId: 'acc-b', platformShard: 'steam', pubgPlayerName: 'Bravo' },
      ] as never)
    vi.mocked(prisma.encounteredPlayer.groupBy).mockResolvedValueOnce([
      group('acc-b', 3, 12, 5),
      group('acc-a', 1, 4, 1),
    ] as never)

    const result = await selectPrioritizedEncounteredPlayerIdentities(2, thresholds)

    expect(result.map((candidate) => candidate.pubgPlayerName)).toEqual(['Bravo', 'Alpha'])
    expect(result[0]).toEqual({
      pubgAccountId: 'acc-b',
      platformShard: 'steam',
      pubgPlayerName: 'Bravo',
      distinctClanCount: 3,
      totalEncounterCount: 12,
      lastSeenAt: lastSeen,
    })
    expect(vi.mocked(prisma.encounteredPlayer.groupBy).mock.calls.some(([args]) => isFullRanking(args as never))).toBe(false)
  })

  it('palier 2 : complète le lot avec le classement en cache, sans doublon ni identité devenue inéligible', async () => {
    vi.mocked(prisma.encounteredPlayer.findMany).mockImplementation((async (args: { where: Record<string, unknown> }) => {
      if ('combatInteractionsCount' in args.where) return [identity('acc-combat')]
      return [
        { pubgAccountId: 'acc-combat', platformShard: 'steam', pubgPlayerName: 'Combat' },
        { pubgAccountId: 'acc-x', platformShard: 'steam', pubgPlayerName: 'X' },
        { pubgAccountId: 'acc-z', platformShard: 'steam', pubgPlayerName: 'Z' },
      ]
    }) as never)
    vi.mocked(prisma.encounteredPlayer.groupBy).mockImplementation((async (args: { where: { OR?: Array<{ pubgAccountId: string }> } }) => {
      if (!args.where.OR) {
        // Classement complet : contient aussi l'identité du palier 1 et une identité résolue depuis.
        return [group('acc-combat', 1, 3, 2), group('acc-x', 9, 40), group('acc-resolved', 8, 30), group('acc-z', 2, 5)]
      }
      const requested = args.where.OR.map((entry) => entry.pubgAccountId)
      if (requested.length === 1 && requested[0] === 'acc-combat') return [group('acc-combat', 1, 3, 2)]
      // Revérification : acc-resolved n'est plus éligible.
      return [group('acc-x', 9, 41), group('acc-z', 2, 5)].filter((entry) => requested.includes(entry.pubgAccountId))
    }) as never)

    const result = await selectPrioritizedEncounteredPlayerIdentities(3, thresholds)

    expect(result.map((candidate) => candidate.pubgAccountId)).toEqual(['acc-combat', 'acc-x', 'acc-z'])
    // Agrégats relus au moment de la sélection, pas ceux du cache.
    expect(result[1].totalEncounterCount).toBe(41)
  })

  it('réutilise le classement en cache au passage suivant au lieu de le recalculer', async () => {
    vi.mocked(prisma.encounteredPlayer.findMany).mockImplementation((async (args: { where: Record<string, unknown> }) =>
      'combatInteractionsCount' in args.where ? [] : [{ pubgAccountId: 'acc-x', platformShard: 'steam', pubgPlayerName: 'X' }]) as never)
    vi.mocked(prisma.encounteredPlayer.groupBy).mockImplementation((async (args: { where: { OR?: unknown[] } }) =>
      args.where.OR ? [group('acc-x', 4, 10)] : [group('acc-x', 4, 10)]) as never)

    await selectPrioritizedEncounteredPlayerIdentities(1, thresholds)
    await selectPrioritizedEncounteredPlayerIdentities(1, thresholds)

    const fullRankings = vi
      .mocked(prisma.encounteredPlayer.groupBy)
      .mock.calls.filter(([args]) => isFullRanking(args as never))
    expect(fullRankings).toHaveLength(1)
  })
})
