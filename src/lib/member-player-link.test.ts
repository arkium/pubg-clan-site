import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Rattachement ClanMember → Player (src/lib/member-player-link.ts). */

const mocks = vi.hoisted(() => ({
  clanMemberFindUnique: vi.fn(),
  clanMemberUpdateMany: vi.fn(),
  playerFindUnique: vi.fn(),
  playerCreate: vi.fn(),
  playerUpsert: vi.fn(),
  playerUpdate: vi.fn(),
  encounteredPlayerUpdateMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanMember: { findUnique: mocks.clanMemberFindUnique, updateMany: mocks.clanMemberUpdateMany },
    player: {
      findUnique: mocks.playerFindUnique,
      create: mocks.playerCreate,
      upsert: mocks.playerUpsert,
      update: mocks.playerUpdate,
    },
    encounteredPlayer: { updateMany: mocks.encounteredPlayerUpdateMany },
  },
}))

import { ensurePlayerLinkForMember, linkMemberToPlayer } from '@/lib/member-player-link'

const MEMBER = { playerId: null, pubgAccountId: 'account.abc', platformShard: 'steam', pubgPlayerName: 'Balthazar_99' }
const KEY = { pubgAccountId_platformShard: { pubgAccountId: 'account.abc', platformShard: 'steam' } }

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.clanMemberUpdateMany.mockResolvedValue({ count: 1 })
})

describe('linkMemberToPlayer', () => {
  it('relie la fiche à la ligne Player existante, sans toucher au clan PUBG du joueur', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue(MEMBER)
    mocks.playerFindUnique.mockResolvedValue({ id: 'player-1' })

    await expect(linkMemberToPlayer(41)).resolves.toBe('player-1')

    expect(mocks.playerFindUnique).toHaveBeenCalledWith({ where: KEY, select: { id: true } })
    expect(mocks.clanMemberUpdateMany).toHaveBeenCalledWith({ where: { id: 41, playerId: null }, data: { playerId: 'player-1' } })
    // Le miroir adversaire (clan PUBG, EncounteredPlayer) n'est jamais réécrit : la demande n'est pas décidée.
    expect(mocks.playerUpsert).not.toHaveBeenCalled()
    expect(mocks.playerUpdate).not.toHaveBeenCalled()
    expect(mocks.encounteredPlayerUpdateMany).not.toHaveBeenCalled()
  })

  it('crée la ligne Player manquante, sans clan', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue(MEMBER)
    mocks.playerFindUnique.mockResolvedValue(null)
    mocks.playerCreate.mockResolvedValue({ id: 'player-new' })

    await expect(linkMemberToPlayer(41)).resolves.toBe('player-new')

    expect(mocks.playerCreate).toHaveBeenCalledWith({
      data: { pubgAccountId: 'account.abc', platformShard: 'steam', pubgPlayerName: 'Balthazar_99' },
      select: { id: true },
    })
  })

  it('course : une ligne créée entre-temps par un autre écrivain est relue', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue(MEMBER)
    mocks.playerFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'player-raced' })
    mocks.playerCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
    )

    await expect(linkMemberToPlayer(41)).resolves.toBe('player-raced')
    expect(mocks.clanMemberUpdateMany).toHaveBeenCalledWith({ where: { id: 41, playerId: null }, data: { playerId: 'player-raced' } })
  })

  it('lien déjà posé ou compte PUBG inconnu : aucune écriture', async () => {
    mocks.clanMemberFindUnique.mockResolvedValueOnce({ ...MEMBER, playerId: 'player-old' })
    await expect(linkMemberToPlayer(41)).resolves.toBe('player-old')

    mocks.clanMemberFindUnique.mockResolvedValueOnce({ ...MEMBER, pubgAccountId: null })
    await expect(linkMemberToPlayer(41)).resolves.toBeNull()

    expect(mocks.playerFindUnique).not.toHaveBeenCalled()
    expect(mocks.clanMemberUpdateMany).not.toHaveBeenCalled()
  })
})

describe('ensurePlayerLinkForMember', () => {
  it('n’échoue jamais : une erreur est journalisée, la route appelante continue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.clanMemberFindUnique.mockRejectedValue(new Error('DB down'))

    await expect(ensurePlayerLinkForMember(41)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
