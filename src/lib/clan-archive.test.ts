import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Arrêt de suivi d'un clan — src/lib/clan-archive.ts et clan-archive-state.ts.
 * Matrice de tests : docs/TODO/clan-archive.md §5. Les routes sont couvertes par
 * clan-archive-route-contracts.test.ts.
 */

// Les mocks Prisma listent les modèles un par un : tout modèle utilisé par le code testé
// doit apparaître ici, sinon l'appel renvoie `undefined` loin de la cause réelle.
const mocks = vi.hoisted(() => ({
  clanFindUnique: vi.fn(),
  clanUpdateMany: vi.fn(),
  memberFindMany: vi.fn(),
  memberCount: vi.fn(),
  txClanUpdateMany: vi.fn(),
  txMemberUpdateMany: vi.fn(),
  txChangeCreate: vi.fn(),
  transaction: vi.fn(),
  getOrCreateUngroupedClan: vi.fn(),
  syncOpponentIdentityForMemberId: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clan: { findUnique: mocks.clanFindUnique, updateMany: mocks.clanUpdateMany },
    clanMember: { findMany: mocks.memberFindMany, count: mocks.memberCount },
    $transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/clan-service', () => ({ getOrCreateUngroupedClan: mocks.getOrCreateUngroupedClan }))

// Garde de non-régression : l'archivage ne doit pas réécrire le miroir adversaire.
vi.mock('@/lib/player-clan-identity', () => ({
  syncOpponentIdentityForMemberId: mocks.syncOpponentIdentityForMemberId,
}))

import {
  ClanFollowActionSchema,
  ClanFollowError,
  archiveClan,
  getClanFollowSummary,
  reactivateClan,
  reopenRejectedClan,
} from '@/lib/clan-archive'
import {
  ARCHIVED_CLAN_WHERE,
  PENDING_CLAN_WHERE,
  decideJoinTarget,
  formatClanLabel,
  getClanFollowState,
} from '@/lib/clan-archive-state'

const NOW = new Date('2026-09-25T20:00:00.000Z')
const ACTIVE_CLAN = {
  id: 7,
  name: 'Smoke',
  tag: 'SMK',
  pubgClanId: 'clan.smk',
  isActive: true,
  isSystem: false,
  archivedAt: null,
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.clanFindUnique.mockResolvedValue(ACTIVE_CLAN)
  mocks.memberFindMany.mockResolvedValue([])
  mocks.txClanUpdateMany.mockResolvedValue({ count: 1 })
  mocks.txMemberUpdateMany.mockResolvedValue({ count: 0 })
  mocks.txChangeCreate.mockResolvedValue({ id: 'chg' })
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      clan: { updateMany: mocks.txClanUpdateMany },
      clanMember: { updateMany: mocks.txMemberUpdateMany },
      playerClanChange: { create: mocks.txChangeCreate },
    })
  )
  mocks.getOrCreateUngroupedClan.mockImplementation(async (shard: string) =>
    shard === 'kakao' ? { id: 202, tag: 'UNG' } : { id: 201, tag: 'UNG' }
  )
})

async function expectFollowError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  )
  expect(error).toBeInstanceOf(ClanFollowError)
  expect(error).toMatchObject({ code, status })
}

describe('états de suivi', () => {
  it('distingue actif, en attente et archivé', () => {
    expect(getClanFollowState({ isActive: true, archivedAt: null })).toBe('active')
    expect(getClanFollowState({ isActive: false, archivedAt: null })).toBe('pending')
    expect(getClanFollowState({ isActive: false, archivedAt: NOW })).toBe('archived')
  })

  it('la liste d’attente exclut les archivés, et inversement', () => {
    expect(PENDING_CLAN_WHERE).toEqual({ isActive: false, isSystem: false, archivedAt: null })
    expect(ARCHIVED_CLAN_WHERE).toEqual({ isActive: false, archivedAt: { not: null } })
  })

  it('formate un libellé de clan', () => {
    expect(formatClanLabel({ name: 'Smoke', tag: 'SMK' })).toBe('[SMK] Smoke')
    expect(formatClanLabel({ name: 'Sans tag', tag: '' })).toBe('Sans tag')
  })
})

describe('demandes /join sur un clan connu', () => {
  it.each([
    [{ archivedAt: null, archivedReason: null }, 'open'],
    [{ archivedAt: NOW, archivedReason: 'rejected' }, 'reopen_rejected'],
    [{ archivedAt: NOW, archivedReason: 'unfollowed' }, 'unfollowed'],
    [{ archivedAt: NOW, archivedReason: null }, 'unfollowed'],
  ] as const)('%o → %s', (clan, decision) => {
    expect(decideJoinTarget(clan)).toBe(decision)
  })

  it('rouvre un clan refusé, et seulement un clan refusé', async () => {
    mocks.clanUpdateMany.mockResolvedValue({ count: 1 })

    await expect(reopenRejectedClan(9)).resolves.toBe(true)
    expect(mocks.clanUpdateMany).toHaveBeenCalledWith({
      where: { id: 9, isActive: false, archivedReason: 'rejected' },
      data: { archivedAt: null, archivedReason: null },
    })

    mocks.clanUpdateMany.mockResolvedValue({ count: 0 })
    await expect(reopenRejectedClan(9)).resolves.toBe(false)
  })
})

describe('ClanFollowActionSchema', () => {
  it('accepte archive (avec ou sans sort des membres) et reactivate', () => {
    expect(ClanFollowActionSchema.safeParse({ action: 'archive' }).success).toBe(true)
    expect(ClanFollowActionSchema.safeParse({ action: 'archive', membersDisposition: 'ungrouped' }).success).toBe(true)
    expect(ClanFollowActionSchema.safeParse({ action: 'reactivate' }).success).toBe(true)
  })

  it('refuse une action ou un sort des membres inconnus', () => {
    expect(ClanFollowActionSchema.safeParse({ action: 'delete' }).success).toBe(false)
    expect(ClanFollowActionSchema.safeParse({ action: 'archive', membersDisposition: 'kick' }).success).toBe(false)
    expect(ClanFollowActionSchema.safeParse(null).success).toBe(false)
  })
})

describe('getClanFollowSummary', () => {
  it('décrit l’état du clan et compte ses membres actifs', async () => {
    mocks.clanFindUnique.mockResolvedValue({ ...ACTIVE_CLAN, platformShard: 'steam', archivedReason: null })
    mocks.memberCount.mockResolvedValue(12)

    const summary = await getClanFollowSummary(7)

    expect(summary).toMatchObject({ clan: { id: 7, state: 'active', archivedAt: null }, activeMembers: 12 })
    expect(mocks.memberCount).toHaveBeenCalledWith({ where: { clanId: 7, isActive: true } })
  })

  it('renvoie null pour un clan inconnu', async () => {
    mocks.clanFindUnique.mockResolvedValue(null)
    await expect(getClanFollowSummary(404)).resolves.toBeNull()
  })
})

describe('archiveClan — refus', () => {
  it('clan inconnu → 404', async () => {
    mocks.clanFindUnique.mockResolvedValue(null)
    await expectFollowError(archiveClan(404, undefined, { triggeredByUserId: 1 }), 'clan_not_found', 404)
  })

  it('clan technique → 400, rien n’est écrit', async () => {
    mocks.clanFindUnique.mockResolvedValue({ ...ACTIVE_CLAN, isSystem: true })
    await expectFollowError(archiveClan(7, 'ungrouped', { triggeredByUserId: 1 }), 'system_clan', 400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('clan en attente de validation → 409 : il se refuse, il ne s’archive pas', async () => {
    mocks.clanFindUnique.mockResolvedValue({ ...ACTIVE_CLAN, isActive: false })
    await expectFollowError(archiveClan(7, undefined, { triggeredByUserId: 1 }), 'clan_pending', 409)
  })

  it('clan avec membres actifs sans sort choisi → 400, rien n’est écrit', async () => {
    mocks.memberFindMany.mockResolvedValue([{ id: 11, pubgAccountId: 'account.a', platformShard: 'steam' }])
    await expectFollowError(archiveClan(7, undefined, { triggeredByUserId: 1 }), 'disposition_required', 400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})

describe('archiveClan — écritures', () => {
  it('archive un clan vide sans autre question', async () => {
    const result = await archiveClan(7, undefined, { triggeredByUserId: 1, now: NOW })

    expect(result).toEqual({
      outcome: 'archived',
      clan: { id: 7, name: 'Smoke', tag: 'SMK' },
      membersMoved: 0,
      membersDeactivated: 0,
    })
    expect(mocks.txClanUpdateMany).toHaveBeenCalledWith({
      where: { id: 7, isActive: true, archivedAt: null },
      data: { isActive: false, archivedAt: NOW, archivedReason: 'unfollowed' },
    })
    expect(mocks.txMemberUpdateMany).not.toHaveBeenCalled()
    expect(mocks.txChangeCreate).not.toHaveBeenCalled()
    expect(mocks.getOrCreateUngroupedClan).not.toHaveBeenCalled()
  })

  it('ungrouped : chaque membre part vers le parking de SON shard, un mouvement journalisé chacun', async () => {
    mocks.memberFindMany.mockResolvedValue([
      { id: 11, pubgAccountId: 'account.a', platformShard: 'steam' },
      { id: 12, pubgAccountId: 'account.b', platformShard: 'kakao' },
      { id: 13, pubgAccountId: 'account.c', platformShard: 'steam' },
    ])

    const result = await archiveClan(7, 'ungrouped', { triggeredByUserId: 42, now: NOW })

    expect(result.membersMoved).toBe(3)
    expect(mocks.getOrCreateUngroupedClan.mock.calls.map(([shard]) => shard).sort()).toEqual(['kakao', 'steam'])
    expect(mocks.txMemberUpdateMany).toHaveBeenCalledWith({ where: { id: { in: [11, 13] } }, data: { clanId: 201 } })
    expect(mocks.txMemberUpdateMany).toHaveBeenCalledWith({ where: { id: { in: [12] } }, data: { clanId: 202 } })
    expect(mocks.txChangeCreate).toHaveBeenCalledTimes(3)
    expect(mocks.txChangeCreate.mock.calls.map(([args]) => args.data)).toContainEqual(
      expect.objectContaining({
        clanMemberId: 12,
        previousClanId: 7,
        previousPubgClanId: 'clan.smk',
        previousPubgClanTag: 'SMK',
        newClanId: 202,
        source: 'manual_demotion',
        status: 'applied',
        triggeredByUserId: 42,
      })
    )
  })

  it('deactivate : fiches désactivées avec le motif clan_unfollowed, sans mouvement ni parking', async () => {
    mocks.memberFindMany.mockResolvedValue([
      { id: 11, pubgAccountId: 'account.a', platformShard: 'steam' },
      { id: 12, pubgAccountId: 'account.b', platformShard: 'steam' },
    ])

    const result = await archiveClan(7, 'deactivate', { triggeredByUserId: 1, now: NOW })

    expect(result.membersDeactivated).toBe(2)
    expect(mocks.txMemberUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [11, 12] } },
      data: { isActive: false, archivedAt: NOW, archivedReason: 'clan_unfollowed' },
    })
    expect(mocks.txChangeCreate).not.toHaveBeenCalled()
    expect(mocks.getOrCreateUngroupedClan).not.toHaveBeenCalled()
  })

  it('idempotent : un clan déjà archivé n’est pas réécrit', async () => {
    mocks.clanFindUnique.mockResolvedValue({ ...ACTIVE_CLAN, isActive: false, archivedAt: NOW })

    const result = await archiveClan(7, 'ungrouped', { triggeredByUserId: 1 })

    expect(result.outcome).toBe('already_archived')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('état changé entre lecture et écriture (double clic) → 409, aucun membre touché', async () => {
    mocks.memberFindMany.mockResolvedValue([{ id: 11, pubgAccountId: 'account.a', platformShard: 'steam' }])
    mocks.txClanUpdateMany.mockResolvedValue({ count: 0 })

    await expectFollowError(archiveClan(7, 'deactivate', { triggeredByUserId: 1 }), 'state_changed', 409)
    expect(mocks.txMemberUpdateMany).not.toHaveBeenCalled()
  })

  it('ne réécrit pas le miroir adversaire : le clan PUBG des joueurs n’a pas changé', async () => {
    mocks.memberFindMany.mockResolvedValue([{ id: 11, pubgAccountId: 'account.a', platformShard: 'steam' }])

    await archiveClan(7, 'ungrouped', { triggeredByUserId: 1 })

    expect(mocks.syncOpponentIdentityForMemberId).not.toHaveBeenCalled()
  })
})

describe('reactivateClan', () => {
  it('remet un clan archivé en service et efface la trace d’archivage', async () => {
    mocks.clanFindUnique.mockResolvedValue({ ...ACTIVE_CLAN, isActive: false, archivedAt: NOW })
    mocks.clanUpdateMany.mockResolvedValue({ count: 1 })

    const result = await reactivateClan(7)

    expect(result).toEqual({ outcome: 'reactivated', clan: { id: 7, name: 'Smoke', tag: 'SMK' } })
    expect(mocks.clanUpdateMany).toHaveBeenCalledWith({
      where: { id: 7, isActive: false, archivedAt: { not: null } },
      data: { isActive: true, archivedAt: null, archivedReason: null },
    })
  })

  it('idempotent sur un clan déjà actif', async () => {
    await expect(reactivateClan(7)).resolves.toMatchObject({ outcome: 'already_active' })
    expect(mocks.clanUpdateMany).not.toHaveBeenCalled()
  })

  it('refuse (409) un clan en attente : il se valide, il ne se réactive pas', async () => {
    mocks.clanFindUnique.mockResolvedValue({ ...ACTIVE_CLAN, isActive: false, archivedAt: null })
    await expectFollowError(reactivateClan(7), 'clan_pending', 409)
  })

  it('clan inconnu → 404 ; état changé → 409', async () => {
    mocks.clanFindUnique.mockResolvedValue(null)
    await expectFollowError(reactivateClan(404), 'clan_not_found', 404)

    mocks.clanFindUnique.mockResolvedValue({ ...ACTIVE_CLAN, isActive: false, archivedAt: NOW })
    mocks.clanUpdateMany.mockResolvedValue({ count: 0 })
    await expectFollowError(reactivateClan(7), 'state_changed', 409)
  })
})
