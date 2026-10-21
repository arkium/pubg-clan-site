import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { persistKillEventsForMatch } from './kill-event-persistence'

type OldKill = {
  clanId: number
  killerMemberId: number | null
  victimMemberId: number | null
  killerAccountId: string | null
  victimAccountId: string | null
}

function fakeClient(options: {
  clanIds: number[]
  members: Array<{ id: number; clanId: number; pubgAccountId: string; pubgPlayerName: string }>
  oldKills?: OldKill[]
}) {
  const transaction = {
    killEvent: {
      findMany: vi.fn().mockResolvedValue(options.oldKills ?? []),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    encounteredPlayer: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    player: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  }
  const client = {
    squadMatch: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'match-1',
        createdAt: new Date('2026-10-20T20:00:00Z'),
        members: options.clanIds.map((clanId) => ({ member: { clanId } })),
      }),
    },
    clanMember: { findMany: vi.fn().mockResolvedValue(options.members) },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
  }
  return { client: client as unknown as PrismaClient, transaction }
}

function kill(killerKey: string, victimKey: string) {
  return { killerKey, victimKey, weaponName: 'WeapM416_C', distance: 4200, headshot: false, timestampSeconds: 600 }
}

describe('persistKillEventsForMatch — compteurs de combat', () => {
  it('applique le solde (anciens kills retirés, nouveaux ajoutés) par clan et sur Player, sans écrire un solde nul', async () => {
    const { client, transaction } = fakeClient({
      clanIds: [1],
      members: [{ id: 10, clanId: 1, pubgAccountId: 'account.member1', pubgPlayerName: 'Member1' }],
      oldKills: [
        { clanId: 1, killerMemberId: 10, victimMemberId: null, killerAccountId: 'account.member1', victimAccountId: 'account.foe' },
        { clanId: 1, killerMemberId: 10, victimMemberId: null, killerAccountId: 'account.member1', victimAccountId: 'account.gone' },
      ],
    })

    const written = await persistKillEventsForMatch('match-1', [
      kill('account.member1', 'account.foe'),
      kill('account.rival', 'account.member1'),
      kill('account.member1', 'ai.bot42'),
    ], client)

    expect(written).toBe(3)
    expect(transaction.encounteredPlayer.updateMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { clanId: 1, pubgAccountId: 'account.gone' }, data: { combatInteractionsCount: { increment: -1 } } },
      { where: { clanId: 1, pubgAccountId: 'account.rival' }, data: { combatInteractionsCount: { increment: 1 } } },
    ])
    expect(transaction.player.updateMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { pubgAccountId: 'account.gone' }, data: { combatInteractionsCount: { increment: -1 } } },
      { where: { pubgAccountId: 'account.rival' }, data: { combatInteractionsCount: { increment: 1 } } },
    ])
  })

  it("additionne sur Player les interactions d'un même adversaire avec plusieurs clans suivis", async () => {
    const { client, transaction } = fakeClient({
      clanIds: [1, 2],
      members: [
        { id: 10, clanId: 1, pubgAccountId: 'account.member1', pubgPlayerName: 'Member1' },
        { id: 20, clanId: 2, pubgAccountId: 'account.member2', pubgPlayerName: 'Member2' },
      ],
    })

    await persistKillEventsForMatch('match-1', [
      kill('account.member1', 'account.foe'),
      kill('account.foe', 'account.member2'),
    ], client)

    expect(transaction.encounteredPlayer.updateMany).toHaveBeenCalledWith({
      where: { clanId: 1, pubgAccountId: 'account.foe' },
      data: { combatInteractionsCount: { increment: 1 } },
    })
    expect(transaction.encounteredPlayer.updateMany).toHaveBeenCalledWith({
      where: { clanId: 2, pubgAccountId: 'account.foe' },
      data: { combatInteractionsCount: { increment: 1 } },
    })
    expect(transaction.player.updateMany).toHaveBeenCalledTimes(1)
    expect(transaction.player.updateMany).toHaveBeenCalledWith({
      where: { pubgAccountId: 'account.foe' },
      data: { combatInteractionsCount: { increment: 2 } },
    })
  })
})
