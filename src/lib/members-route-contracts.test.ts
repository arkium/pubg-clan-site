import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `POST /api/members` (ajout d'un joueur par un Owner ou le SuperUser) : un joueur suivi sans clan, rangé dans le
 * clan technique « non groupé », rejoint le clan qui l'ajoute — mouvement et trace du journal dans la même
 * transaction ; un joueur actif d'un vrai clan reste refusé. Prisma, la session, PUBG et les services d'écriture
 * annexes sont simulés (CLAUDE.md, piège n° 9).
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireClanFeature: vi.fn(),
  searchPlayer: vi.fn(),
  findTrackedClan: vi.fn(),
  ensureTrackedClan: vi.fn(),
  ungroupedClan: vi.fn(),
  syncStats: vi.fn(),
  memberFindFirst: vi.fn(),
  memberUpdate: vi.fn(),
  memberCreate: vi.fn(),
  changeCreate: vi.fn(),
  transaction: vi.fn(),
  ensureLink: vi.fn(),
  syncIdentity: vi.fn(),
  initRoles: vi.fn(),
  assignRole: vi.fn(),
}))

vi.mock('@/lib/admin-action-log', () => ({ withAdminActionLog: (_template: string, handler: unknown) => handler }))
vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSession }))
vi.mock('@/lib/auth/admin-guards', () => ({ requireClanFeature: mocks.requireClanFeature, getActiveMemberClanId: vi.fn() }))
vi.mock('@/lib/pubg', () => ({ searchPlayerByName: mocks.searchPlayer }))
vi.mock('@/lib/clan-service', () => ({
  findTrackedClanForPlayer: mocks.findTrackedClan,
  ensureTrackedClanForPlayer: mocks.ensureTrackedClan,
  getOrCreateUngroupedClan: mocks.ungroupedClan,
  syncTrackedClanStats: mocks.syncStats,
}))
vi.mock('@/lib/role-service', () => ({ initializeDefaultRoles: mocks.initRoles, assignDefaultMemberRole: mocks.assignRole }))
vi.mock('@/lib/member-player-link', () => ({ ensurePlayerLinkForMember: mocks.ensureLink }))
vi.mock('@/lib/player-clan-identity', () => ({ syncOpponentIdentityForMemberId: mocks.syncIdentity }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanMember: { findFirst: mocks.memberFindFirst, update: mocks.memberUpdate, create: mocks.memberCreate },
    playerClanChange: { create: mocks.changeCreate },
    $transaction: mocks.transaction,
  },
}))

import { POST as addMember } from '@/app/api/members/route'

const OWNER = { userId: 10, isSuperUser: false, activeMemberId: 1 }
const add = (body: Record<string, unknown>) =>
  addMember(new Request('http://localhost/api/members', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), undefined as never)

/** Joueur déjà suivi, actif, dans le clan technique 201 [UNG]. */
const ungroupedMember = { id: 55, clanId: 201, isActive: true, joinStatus: 'active', clan: { id: 201, name: 'Ungrouped', tag: 'UNG', isSystem: true } }

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.getSession.mockResolvedValue(OWNER)
  mocks.requireClanFeature.mockResolvedValue(null)
  mocks.searchPlayer.mockResolvedValue({ accountId: 'account.abc', playerName: 'NouveauFUN' })
  // Aucun clan PUBG : un Owner peut l'ajouter à son clan.
  mocks.findTrackedClan.mockResolvedValue(null)
  mocks.memberUpdate.mockImplementation(async ({ data }: { data: { clanId: number } }) => ({ id: 55, clanId: data.clanId, clan: { id: data.clanId, tag: 'FUN', name: 'FunsNRoses' } }))
  mocks.memberCreate.mockImplementation(async ({ data }: { data: { clanId: number } }) => ({ id: 99, clanId: data.clanId, clan: { id: data.clanId, tag: 'FUN' } }))
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({ clanMember: { update: mocks.memberUpdate }, playerClanChange: { create: mocks.changeCreate } }))
})

describe('POST /api/members — joueur suivi sans clan (« non groupé »)', () => {
  it('l’aperçu l’accepte et le signale, sans rien écrire', async () => {
    mocks.memberFindFirst.mockResolvedValue(ungroupedMember)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'preview' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ mode: 'preview', fromUngrouped: true, player: { pubgPlayerName: 'NouveauFUN' } })
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
    expect(mocks.changeCreate).not.toHaveBeenCalled()
  })

  it('l’ajout le déplace dans le clan de l’Owner, avec sa trace dans le journal, dans une transaction', async () => {
    mocks.memberFindFirst.mockResolvedValue(ungroupedMember)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'create' })
    expect(response.status).toBe(201)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.memberUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 55 }, data: expect.objectContaining({ clanId: 16, isActive: true, joinStatus: 'active' }) }))
    expect(mocks.changeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clanMemberId: 55,
        previousClanId: 201,
        previousPubgClanTag: 'UNG',
        newClanId: 16,
        source: 'ungrouped_promotion',
        status: 'applied',
        triggeredByUserId: 10,
      }),
    })
    expect(mocks.syncIdentity).toHaveBeenCalledWith(55)
    expect(mocks.assignRole).toHaveBeenCalledWith(55, 16)
    expect(mocks.memberCreate).not.toHaveBeenCalled()
  })

  it('reste refusé si son clan PUBG n’est pas celui de l’Owner (même règle qu’un nouveau joueur)', async () => {
    mocks.memberFindFirst.mockResolvedValue(ungroupedMember)
    mocks.findTrackedClan.mockResolvedValue({ pubgClan: { id: 'clan.other', name: 'Autres' }, clan: { id: 77, name: 'Autres', tag: 'AUT' } })
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'create' })
    expect(response.status).toBe(403)
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })

  it('un SuperUser sans clan cible : le joueur est déjà au clan technique, refus explicite « non groupé »', async () => {
    mocks.getSession.mockResolvedValue({ userId: 1, isSuperUser: true })
    mocks.ensureTrackedClan.mockResolvedValue(null)
    mocks.ungroupedClan.mockResolvedValue({ id: 201 })
    mocks.memberFindFirst.mockResolvedValue(ungroupedMember)
    const response = await add({ pubgPlayerName: 'NouveauFUN', mode: 'create' })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('non groupé')
  })
})

describe('POST /api/members — autres cas inchangés', () => {
  it('un membre actif d’un vrai clan reste refusé (409), sans écriture', async () => {
    mocks.memberFindFirst.mockResolvedValue({ id: 56, clanId: 25, isActive: true, joinStatus: 'active', clan: { id: 25, name: 'SERENITY321', tag: 'SRTY', isSystem: false } })
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'create' })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('Ce joueur est déjà membre actif du clan "SERENITY321".')
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })

  it('un nouveau joueur est créé dans le clan de l’Owner, sans trace de déplacement', async () => {
    mocks.memberFindFirst.mockResolvedValue(null)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'create' })
    expect(response.status).toBe(201)
    expect(mocks.memberCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clanId: 16 }) }))
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.changeCreate).not.toHaveBeenCalled()
    expect(mocks.syncIdentity).not.toHaveBeenCalled()
  })

  it('un membre parti du clan technique est réactivé dans le clan de l’Owner (chemin existant)', async () => {
    mocks.memberFindFirst.mockResolvedValue({ ...ungroupedMember, isActive: false, joinStatus: 'left' })
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'create' })
    expect(response.status).toBe(201)
    expect(mocks.memberUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 55 }, data: expect.objectContaining({ clanId: 16 }) }))
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
