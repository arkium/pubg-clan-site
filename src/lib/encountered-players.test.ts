import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanMember: { findMany: vi.fn() },
    opponentClan: { upsert: vi.fn() },
    encounteredPlayer: { upsert: vi.fn() },
    player: { upsert: vi.fn() },
    clanEncounter: { upsert: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import type { ResolvedPubgMatch } from '@/lib/pubg'
import { captureEncounteredPlayers } from './encountered-players'

function participant(playerId: string, playerName: string) {
  return { playerId, playerName } as ResolvedPubgMatch['rosters'][number]['participants'][number]
}

const match = {
  rosters: [
    { id: 'r1', participants: [participant('account.member1', 'Member1'), participant('account.random', 'Random')] },
    { id: 'r2', participants: [participant('account.foe', 'Foe'), participant('ai.bot1', 'Bot')] },
  ],
} as unknown as ResolvedPubgMatch

describe('captureEncounteredPlayers — compteurs de Player', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.clanMember.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.player.upsert).mockImplementation(
      (async (args: { where: { pubgAccountId_platformShard: { pubgAccountId: string } } }) => ({
        id: `player-${args.where.pubgAccountId_platformShard.pubgAccountId}`,
      })) as never
    )
  })

  it('compte une rencontre par partie sur Player, comme sur ClanEncounter', async () => {
    await captureEncounteredPlayers(1, match, 'steam', new Set(['account.member1']))

    const playerCalls = vi.mocked(prisma.player.upsert).mock.calls.map(([args]) => args)
    expect(playerCalls.map((args) => args.where.pubgAccountId_platformShard.pubgAccountId).sort()).toEqual([
      'account.foe',
      'account.random',
    ])
    for (const args of playerCalls) {
      expect(args.update).toMatchObject({ encounterCount: { increment: 1 } })
      expect(args.create).toMatchObject({ encounterCount: 1 })
    }
    expect(prisma.clanEncounter.upsert).toHaveBeenCalledTimes(2)
  })
})
