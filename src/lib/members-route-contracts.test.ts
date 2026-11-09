import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `POST /api/members` (ajout d'un joueur par un Owner ou le SuperUser) : un joueur suivi sans clan, rangé dans le
 * clan technique « non groupé », rejoint le clan qui l'ajoute — mouvement et trace du journal dans la même
 * transaction. Un joueur actif d'un autre clan suivi ne le rejoint que si PUBG le place déjà dans ce clan (décision du
 * 2026-11-09) ; sinon, refus. Prisma, la session, PUBG et les services d'écriture annexes sont simulés (CLAUDE.md,
 * piège n° 9).
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
  changeUpdateMany: vi.fn(),
  roleDeleteMany: vi.fn(),
  roleCount: vi.fn(),
  transaction: vi.fn(),
  fireAlert: vi.fn(),
  ensureLink: vi.fn(),
  syncIdentity: vi.fn(),
  initRoles: vi.fn(),
  assignRole: vi.fn(),
}))

vi.mock('@/lib/admin-action-log', () => ({ withAdminActionLog: (_template: string, handler: unknown) => handler }))
vi.mock('@/lib/admin-alerts/send', () => ({ fireAdminAlert: mocks.fireAlert }))
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
    clanMemberRole: { count: mocks.roleCount },
    $transaction: mocks.transaction,
  },
}))

import { POST as addMember } from '@/app/api/members/route'

const OWNER = { userId: 10, isSuperUser: false, activeMemberId: 1 }
const add = (body: Record<string, unknown>) =>
  addMember(new Request('http://localhost/api/members', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), undefined as never)

/** Joueur déjà suivi, actif, dans le clan technique 201 [UNG]. */
const ungroupedMember = {
  id: 55,
  clanId: 201,
  isActive: true,
  joinStatus: 'active',
  clan: { id: 201, name: 'Ungrouped', tag: 'UNG', isSystem: true, pubgClanId: null },
  roles: [],
}

/** Joueur actif du clan suivi 25 [SRTY], avec son rôle Membre de ce clan. */
const serenityMember = {
  id: 56,
  clanId: 25,
  isActive: true,
  joinStatus: 'active',
  clan: { id: 25, name: 'SERENITY321', tag: 'SRTY', isSystem: false, pubgClanId: 'clan.srty' },
  roles: [{ role: { name: 'Member', clanId: 25 } }],
}

/** PUBG place le joueur dans le clan de l'Owner, 16 [FUN]. */
const pubgInOwnerClan = { pubgClan: { id: 'clan.fun', name: 'FunsNRoses' }, clan: { id: 16, name: 'FunsNRoses', tag: 'FUN' } }

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.getSession.mockResolvedValue(OWNER)
  mocks.requireClanFeature.mockResolvedValue(null)
  mocks.searchPlayer.mockResolvedValue({ accountId: 'account.abc', playerName: 'NouveauFUN' })
  // Aucun clan PUBG : un Owner peut l'ajouter à son clan.
  mocks.findTrackedClan.mockResolvedValue(null)
  mocks.memberUpdate.mockImplementation(async ({ where, data }: { where: { id: number }; data: { clanId: number } }) => ({
    id: where.id,
    displayName: 'NouveauFUN',
    clanId: data.clanId,
    clan: { id: data.clanId, tag: 'FUN', name: 'FunsNRoses' },
  }))
  mocks.memberCreate.mockImplementation(async ({ data }: { data: { clanId: number } }) => ({ id: 99, clanId: data.clanId, clan: { id: data.clanId, tag: 'FUN' } }))
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) =>
    work({
      clanMember: { update: mocks.memberUpdate },
      clanMemberRole: { deleteMany: mocks.roleDeleteMany },
      playerClanChange: { create: mocks.changeCreate, updateMany: mocks.changeUpdateMany },
    })
  )
})

describe('POST /api/members — joueur suivi sans clan (« non groupé »)', () => {
  it('l’aperçu l’accepte quand PUBG le place dans le clan de l’Owner, et le signale, sans rien écrire', async () => {
    mocks.memberFindFirst.mockResolvedValue(ungroupedMember)
    mocks.findTrackedClan.mockResolvedValue(pubgInOwnerClan)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'preview' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ mode: 'preview', fromUngrouped: true, player: { pubgPlayerName: 'NouveauFUN' } })
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
    expect(mocks.changeCreate).not.toHaveBeenCalled()
  })

  it('l’ajout le déplace dans le clan de l’Owner, avec sa trace dans le journal, dans une transaction', async () => {
    mocks.memberFindFirst.mockResolvedValue(ungroupedMember)
    mocks.findTrackedClan.mockResolvedValue(pubgInOwnerClan)
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
    // Rôles du clan technique retirés (les permissions réunissent tous les rôles), série d'observations close.
    expect(mocks.roleDeleteMany).toHaveBeenCalledWith({ where: { memberId: { in: [55] } } })
    expect(mocks.changeUpdateMany).toHaveBeenCalledWith({ where: { clanMemberId: 55, status: 'observed' }, data: { status: 'ignored' } })
    expect(mocks.syncIdentity).toHaveBeenCalledWith(55)
    expect(mocks.assignRole).toHaveBeenCalledWith(55, 16)
    expect(mocks.memberCreate).not.toHaveBeenCalled()
    expect(mocks.fireAlert).not.toHaveBeenCalled()
  })

  it('refusé (409) tant que PUBG ne le place dans aucun clan : la nuit le renverrait au parking', async () => {
    mocks.memberFindFirst.mockResolvedValue(ungroupedMember)
    mocks.findTrackedClan.mockResolvedValue(null)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'preview' })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe(
      'Ce joueur est suivi sans clan (« non groupé ») et PUBG ne le place dans aucun clan : reviens quand il aura rejoint ton clan dans le jeu.'
    )
    expect(mocks.transaction).not.toHaveBeenCalled()
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

describe('POST /api/members — joueur encore rattaché à un autre clan suivi', () => {
  it('l’aperçu annonce le clan qu’il quitte quand PUBG le place déjà dans celui de l’Owner, sans rien écrire', async () => {
    mocks.memberFindFirst.mockResolvedValue(serenityMember)
    mocks.findTrackedClan.mockResolvedValue(pubgInOwnerClan)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'preview' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      mode: 'preview',
      fromUngrouped: false,
      fromClan: { id: 25, name: 'SERENITY321', tag: 'SRTY' },
      clan: { id: 16, tag: 'FUN' },
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })

  it('l’ajout le transfère : rôles de l’ancien clan retirés, observations closes, trace `owner_transfer`, alerte d’information', async () => {
    mocks.memberFindFirst.mockResolvedValue(serenityMember)
    mocks.findTrackedClan.mockResolvedValue(pubgInOwnerClan)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'create' })
    expect(response.status).toBe(201)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.memberUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 56 }, data: expect.objectContaining({ clanId: 16, isActive: true }) }))
    expect(mocks.roleDeleteMany).toHaveBeenCalledWith({ where: { memberId: { in: [56] } } })
    expect(mocks.changeUpdateMany).toHaveBeenCalledWith({ where: { clanMemberId: 56, status: 'observed' }, data: { status: 'ignored' } })
    expect(mocks.changeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clanMemberId: 56,
        previousClanId: 25,
        previousPubgClanId: 'clan.srty',
        previousPubgClanTag: 'SRTY',
        newClanId: 16,
        newPubgClanId: 'clan.fun',
        source: 'owner_transfer',
        status: 'applied',
        triggeredByUserId: 10,
      }),
    })
    expect(mocks.syncIdentity).toHaveBeenCalledWith(56)
    expect(mocks.assignRole).toHaveBeenCalledWith(56, 16)
    // Les deux clans sont recalculés : l'ancien perd le joueur, le nouveau le gagne.
    expect(mocks.syncStats).toHaveBeenCalledWith(16)
    expect(mocks.syncStats).toHaveBeenCalledWith(25)

    expect(mocks.fireAlert).toHaveBeenCalledTimes(1)
    const [event, buildEmbed] = mocks.fireAlert.mock.calls[0] as [string, () => { title: string; description: string }]
    expect(event).toBe('owner_transfer')
    const embed = buildEmbed()
    expect(embed.title).toContain('[FUN] FunsNRoses')
    expect(embed.description).toContain('**NouveauFUN** passe de [SRTY] SERENITY321 à [FUN] FunsNRoses')
  })

  it('refusé (409) tant que PUBG ne le place dans aucun clan : la nuit le renverrait sinon', async () => {
    mocks.memberFindFirst.mockResolvedValue(serenityMember)
    mocks.findTrackedClan.mockResolvedValue(null)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'preview' })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe(
      'Ce joueur est encore membre du clan « SERENITY321 » sur le site et PUBG ne le place dans aucun clan : reviens quand il aura rejoint ton clan dans le jeu.'
    )
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })

  it('refusé (403) si PUBG le place encore dans son ancien clan', async () => {
    mocks.memberFindFirst.mockResolvedValue(serenityMember)
    mocks.findTrackedClan.mockResolvedValue({ pubgClan: { id: 'clan.srty', name: 'SERENITY321' }, clan: { id: 25, name: 'SERENITY321', tag: 'SRTY' } })
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'create' })
    expect(response.status).toBe(403)
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })

  it('Owner de son clan actuel : transféré, il redevient simple Membre ; l’alerte signale l’ancien clan resté sans Owner', async () => {
    mocks.memberFindFirst.mockResolvedValue({ ...serenityMember, roles: [{ role: { name: 'Owner', clanId: 25 } }] })
    mocks.findTrackedClan.mockResolvedValue(pubgInOwnerClan)
    mocks.roleCount.mockResolvedValue(0)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'create' })
    expect(response.status).toBe(201)
    expect(mocks.roleDeleteMany).toHaveBeenCalledWith({ where: { memberId: { in: [56] } } })
    expect(mocks.assignRole).toHaveBeenCalledWith(56, 16)
    expect(mocks.roleCount).toHaveBeenCalledWith({
      where: { role: { clanId: 25, name: 'Owner' }, member: { clanId: 25, isActive: true } },
    })
    const [, buildEmbed] = mocks.fireAlert.mock.calls[0] as [string, () => { description: string }]
    expect(buildEmbed().description).toContain('Il était Owner de [SRTY] SERENITY321, qui n’a plus aucun Owner')
  })

  it('un rôle Owner laissé par un clan précédent ne compte pas : pas de mention d’Owner dans l’alerte', async () => {
    mocks.memberFindFirst.mockResolvedValue({ ...serenityMember, roles: [{ role: { name: 'Owner', clanId: 7 } }] })
    mocks.findTrackedClan.mockResolvedValue(pubgInOwnerClan)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'create' })
    expect(response.status).toBe(201)
    expect(mocks.roleDeleteMany).toHaveBeenCalledWith({ where: { memberId: { in: [56] } } })
    expect(mocks.roleCount).not.toHaveBeenCalled()
    const [, buildEmbed] = mocks.fireAlert.mock.calls[0] as [string, () => { description: string }]
    expect(buildEmbed().description).not.toContain('Owner de')
  })

  it('par le SuperUser : trace `manual_transfer`, sans alerte', async () => {
    mocks.getSession.mockResolvedValue({ userId: 1, isSuperUser: true })
    mocks.ensureTrackedClan.mockResolvedValue(pubgInOwnerClan)
    mocks.memberFindFirst.mockResolvedValue(serenityMember)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'create' })
    expect(response.status).toBe(201)
    expect(mocks.changeCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ source: 'manual_transfer', triggeredByUserId: 1 }) })
    expect(mocks.fireAlert).not.toHaveBeenCalled()
  })
})

describe('POST /api/members — autres cas inchangés', () => {
  it('un membre actif du clan qui l’ajoute reste refusé (409), sans écriture', async () => {
    mocks.memberFindFirst.mockResolvedValue({ ...serenityMember, clanId: 16, clan: { ...serenityMember.clan, id: 16, name: 'FunsNRoses' } })
    mocks.findTrackedClan.mockResolvedValue(pubgInOwnerClan)
    const response = await add({ pubgPlayerName: 'NouveauFUN', clanId: 16, mode: 'create' })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('Ce joueur est déjà membre actif du clan "FunsNRoses".')
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
