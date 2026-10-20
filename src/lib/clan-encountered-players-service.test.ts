import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Adversaires croisés par un clan (src/lib/clan-encountered-players-service.ts) : résumé et clans rivaux tirés d'un
 * seul passage groupé par clan PUBG, liste bornée à 300 lignes. Le SQL lui-même a été vérifié en lecture seule sur la
 * base le 2026-10-20 (mesures dans le service).
 */

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  clanMemberFindMany: vi.fn(),
  killEventGroupBy: vi.fn(),
  matchAggregate: vi.fn(),
  encounteredFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    clanMember: { findMany: mocks.clanMemberFindMany },
    killEvent: { groupBy: mocks.killEventGroupBy },
    match: { aggregate: mocks.matchAggregate },
    encounteredPlayer: { findMany: mocks.encounteredFindMany },
  },
}))

import { loadClanEncounteredPlayers } from '@/lib/clan-encountered-players-service'

const SEEN = new Date('2026-10-18T20:00:00.000Z')

function group(tag: string | null, values: Partial<Record<string, number>> = {}) {
  return {
    tag,
    name: tag ? `Clan ${tag}` : null,
    players: 0n,
    resolved: 0n,
    teammates: 0n,
    rivalPlayers: 0n,
    opponentEncounters: 0n,
    killedByClan: 0n,
    killedMember: 0n,
    lastSeenAt: SEEN,
    ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, BigInt(value ?? 0)])),
  }
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.clanMemberFindMany.mockResolvedValue([{ id: 11 }])
  mocks.killEventGroupBy.mockResolvedValue([])
  mocks.matchAggregate.mockResolvedValue({ _avg: { botCount: 12 }, _count: { botCount: 4 } })
})

describe('loadClanEncounteredPlayers', () => {
  it('résumé = somme des groupes ; clans rivaux = groupes nommés avec au moins un vrai adversaire, triés', async () => {
    mocks.queryRaw
      // Un passage groupé par clan PUBG (tag nul : sans clan connu).
      .mockResolvedValueOnce([
        group(null, { players: 40, resolved: 5, teammates: 2 }),
        group('SMK', { players: 3, resolved: 3, rivalPlayers: 2, opponentEncounters: 9, killedByClan: 4, killedMember: 1 }),
        group('RVL', { players: 5, resolved: 5, teammates: 1, rivalPlayers: 5, opponentEncounters: 30, killedByClan: 2 }),
        // Coéquipiers seulement : pas un rival.
        group('AMI', { players: 2, resolved: 2, teammates: 2 }),
      ])
      .mockResolvedValueOnce([
        {
          id: 'ce-1',
          pubgAccountId: 'account.a',
          pubgPlayerName: 'Alpha',
          pubgClanTag: 'RVL',
          pubgClanName: 'Clan RVL',
          clanResolvedAt: SEEN,
          encounterCount: 12,
          teammateEncounterCount: 2,
          resolveAttempts: 0,
          firstSeenAt: SEEN,
          lastSeenAt: SEEN,
        },
      ])
      .mockResolvedValueOnce([
        { side: 'byClan', players: 3n, kills: 6n },
        { side: 'byOpponent', players: 2n, kills: 1n },
      ])
    mocks.killEventGroupBy
      .mockResolvedValueOnce([{ victimAccountId: 'account.a', _count: { _all: 2 } }])
      .mockResolvedValueOnce([])

    const data = await loadClanEncounteredPlayers(7, 'all')

    expect(data.summary).toEqual({
      totalPlayers: 50,
      resolvedCount: 15,
      pendingCount: 35,
      distinctClansIdentified: 2,
      teammateCount: 5,
      killedByClanPlayerCount: 3,
      killedByClanTotalKills: 6,
      killedClanMemberPlayerCount: 2,
      killedClanMemberTotalKills: 1,
    })
    expect(data.rivalClans.map((clan) => [clan.tag, clan.playerCount, clan.opponentEncounterCount])).toEqual([
      ['RVL', 5, 30],
      ['SMK', 2, 9],
    ])
    expect(data.topRivalClans).toEqual([
      { tag: 'RVL', encounterCount: 30 },
      { tag: 'SMK', encounterCount: 9 },
    ])
    expect(data.players[0]).toMatchObject({
      id: 'ce-1',
      opponentEncounterCount: 10,
      status: 'resolved_with_clan',
      killedByClanCount: 2,
      killedClanMemberCount: 0,
    })
    expect(data.playersListTruncated).toBe(false)
    expect(data.botStats).toEqual({ avgBotsPerMatch: 12, matchesWithData: 4 })
    // Plus de lecture d'EncounteredPlayer (fin d'EncounteredPlayer).
    expect(mocks.encounteredFindMany).not.toHaveBeenCalled()
    // Kills par compte : seulement pour les lignes affichées.
    expect(mocks.killEventGroupBy.mock.calls[0][0].where.victimAccountId).toEqual({ in: ['account.a'] })
  })

  it('aucun adversaire sur la période : tout à zéro, aucune lecture des kills par compte', async () => {
    mocks.queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const data = await loadClanEncounteredPlayers(7, 'week')

    expect(data.summary.totalPlayers).toBe(0)
    expect(data.rivalClans).toEqual([])
    expect(data.players).toEqual([])
    expect(mocks.killEventGroupBy).not.toHaveBeenCalled()
  })
})
