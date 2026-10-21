import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    player: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    clanEncounter: { groupBy: vi.fn() },
    clanMember: { findFirst: vi.fn() },
    opponentClan: { upsert: vi.fn() },
    encounteredPlayer: { updateMany: vi.fn() },
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
    vi.mocked(prisma.player.updateMany).mockResolvedValue({ count: 1 } as never)

    const result = await resolveOneEncounteredPlayerCandidate(candidate)

    expect(result.outcome).toBe('failed')
    expect(result.updatedRowCount).toBe(4)
    expect(prisma.encounteredPlayer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pubgAccountId: candidate.pubgAccountId, platformShard: candidate.platformShard },
        data: { resolveAttempts: { increment: 1 } },
      })
    )
    // Fin d'EncounteredPlayer, étape 2 : l'identité globale compte aussi l'échec.
    expect(prisma.player.updateMany).toHaveBeenCalledWith({
      where: { pubgAccountId: candidate.pubgAccountId, platformShard: candidate.platformShard },
      data: { resolveAttempts: { increment: 1 } },
    })
  })

  it("l'échec reste un échec même si l'écriture sur Player échoue", async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue(null as never)
    mockedFetchPlayerClan.mockRejectedValue(new Error('PUBG API down'))
    vi.mocked(prisma.encounteredPlayer.updateMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(prisma.player.updateMany).mockRejectedValue(new Error('Unknown column'))

    await expect(resolveOneEncounteredPlayerCandidate(candidate)).resolves.toMatchObject({ outcome: 'failed', updatedRowCount: 2 })
  })
})

describe('selectPrioritizedEncounteredPlayerIdentities', () => {
  const thresholds = { minEncounters: 2, maxAttempts: 3 }
  const lastSeen = new Date('2026-10-21T20:00:00Z')

  const player = (id: string, pubgPlayerName: string, encounterCount: number) => ({
    id,
    pubgAccountId: `account.${id}`,
    platformShard: 'steam',
    pubgPlayerName,
    encounterCount,
    lastSeenAt: lastSeen,
  })

  beforeEach(() => {
    vi.mocked(prisma.player.findMany).mockReset()
    vi.mocked(prisma.clanEncounter.groupBy).mockReset()
  })

  it('lit Player : éligibilité au total tous clans, ordre du cron, la base s’arrête au lot', async () => {
    vi.mocked(prisma.player.findMany).mockResolvedValue([] as never)

    await selectPrioritizedEncounteredPlayerIdentities(5, thresholds)

    expect(prisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clanResolvedAt: null, encounterCount: { gte: 2 }, resolveAttempts: { lt: 3 } },
        orderBy: [
          { combatInteractionsCount: 'desc' },
          { encounterCount: 'desc' },
          { resolveAttempts: 'desc' },
          { id: 'desc' },
        ],
        take: 5,
      })
    )
  })

  it('aucun candidat : pas de lecture des clans', async () => {
    vi.mocked(prisma.player.findMany).mockResolvedValue([] as never)

    await expect(selectPrioritizedEncounteredPlayerIdentities(5, thresholds)).resolves.toEqual([])
    expect(prisma.clanEncounter.groupBy).not.toHaveBeenCalled()
  })

  it('garde l’ordre de la base et compte les clans suivis qui ont croisé chaque joueur', async () => {
    vi.mocked(prisma.player.findMany).mockResolvedValue([player('b', 'Bravo', 12), player('a', 'Alpha', 4)] as never)
    vi.mocked(prisma.clanEncounter.groupBy).mockResolvedValue([
      { playerId: 'a', _count: { _all: 1 } },
      { playerId: 'b', _count: { _all: 3 } },
    ] as never)

    const result = await selectPrioritizedEncounteredPlayerIdentities(2, thresholds)

    expect(prisma.clanEncounter.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['playerId'], where: { playerId: { in: ['b', 'a'] } } })
    )
    expect(result).toEqual([
      {
        pubgAccountId: 'account.b',
        platformShard: 'steam',
        pubgPlayerName: 'Bravo',
        distinctClanCount: 3,
        totalEncounterCount: 12,
        lastSeenAt: lastSeen,
      },
      {
        pubgAccountId: 'account.a',
        platformShard: 'steam',
        pubgPlayerName: 'Alpha',
        distinctClanCount: 1,
        totalEncounterCount: 4,
        lastSeenAt: lastSeen,
      },
    ])
  })
})
