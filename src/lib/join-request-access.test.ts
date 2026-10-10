import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Demandes de la page d'inscription envoyées sans compte, puis leur acceptation — docs/features/clans.md, « Ajout d'un
 * membre — flux auto-inscription » (2026-10-09). Les routes sont les vraies ; la base, la session, l'API PUBG, l'envoi
 * d'email et la création d'invitation sont simulés : aucun test n'atteint la base de `.env` (la production).
 */

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  searchPlayerByName: vi.fn(),
  fetchPlayerClan: vi.fn(),
  memberFindFirst: vi.fn(),
  memberFindUnique: vi.fn(),
  memberCount: vi.fn(),
  memberCreate: vi.fn(),
  memberUpdate: vi.fn(),
  clanFindFirst: vi.fn(),
  clanFindUnique: vi.fn(),
  clanCreate: vi.fn(),
  clanUpdate: vi.fn(),
  roleFindFirst: vi.fn(),
  memberRoleCreate: vi.fn(),
  identityFindFirst: vi.fn(),
  identityFindUnique: vi.fn(),
  identityCreate: vi.fn(),
  identityUpdate: vi.fn(),
  createMemberInvite: vi.fn(),
  sendEmail: vi.fn(),
  notifyJoinRequest: vi.fn(),
  notifyClanCreationRequest: vi.fn(),
  createNotificationForMember: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanMember: {
      findFirst: mocks.memberFindFirst,
      findUnique: mocks.memberFindUnique,
      count: mocks.memberCount,
      create: mocks.memberCreate,
      update: mocks.memberUpdate,
    },
    clan: { findFirst: mocks.clanFindFirst, findUnique: mocks.clanFindUnique, create: mocks.clanCreate, update: mocks.clanUpdate },
    clanRole: { findFirst: mocks.roleFindFirst },
    clanMemberRole: { create: mocks.memberRoleCreate },
    memberIdentity: {
      findFirst: mocks.identityFindFirst,
      findUnique: mocks.identityFindUnique,
      create: mocks.identityCreate,
      update: mocks.identityUpdate,
    },
  },
}))
vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }))
vi.mock('@/lib/pubg', () => ({ searchPlayerByName: mocks.searchPlayerByName, fetchPlayerClan: mocks.fetchPlayerClan }))
vi.mock('@/lib/role-service', () => ({ initializeDefaultRoles: vi.fn(async () => undefined), PREDEFINED_ROLES: { MEMBER: { name: 'Member' } } }))
vi.mock('@/lib/notification-service', () => ({
  notifyJoinRequest: mocks.notifyJoinRequest,
  notifyClanCreationRequest: mocks.notifyClanCreationRequest,
  createNotificationForMember: mocks.createNotificationForMember,
}))
vi.mock('@/lib/clan-archive', () => ({ reopenRejectedClan: vi.fn(async () => false) }))
vi.mock('@/lib/auth-service', () => ({ createMemberInvite: mocks.createMemberInvite }))
vi.mock('@/lib/email-service', () => ({ sendEmail: mocks.sendEmail }))
// Gardes et journal : hors du sujet (couverts par admin-route-guards et admin-action-log-routes).
vi.mock('@/lib/auth/admin-guards', () => ({ requireClanFeature: vi.fn(async () => null) }))
vi.mock('@/middleware/auth-permission', () => ({ requireSuperUser: vi.fn(async () => null) }))
vi.mock('@/lib/admin-action-log', () => ({ withAdminActionLog: (_template: string, handler: unknown) => handler }))
vi.mock('@/lib/clan-lifecycle/pending-promotions', () => ({ applyPendingPromotionsForClan: vi.fn(async () => []) }))
vi.mock('@/lib/clan-subdomain-service', () => ({ assignClanSubdomainSafely: vi.fn(async () => undefined) }))

import { POST as postJoin } from '@/app/api/join/route'
import { POST as approveMember } from '@/app/api/clans/[clanId]/members/[memberId]/approve/route'
import { POST as rejectMember } from '@/app/api/clans/[clanId]/members/[memberId]/reject/route'
import { POST as approveClan } from '@/app/api/clans/[clanId]/approve/route'
import { JOIN_PENDING_PER_EMAIL_LIMIT } from '@/lib/join-request-access'

const ACTIVATION_URL = 'https://chickendinner.fr/activate?token=abc'

function joinRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/join', { method: 'POST', body: JSON.stringify({ mode: 'join', ...body }) })
}

const postRequest = (url: string) => new Request(url, { method: 'POST' })
const memberParams = Promise.resolve({ clanId: '7', memberId: '41' })

const trackedClan = { id: 7, name: 'La Meute', tag: 'LMT', isActive: true, archivedAt: null, archivedReason: null }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSessionFromRequest.mockResolvedValue(null)
  mocks.searchPlayerByName.mockResolvedValue({ accountId: 'account.demo' })
  mocks.fetchPlayerClan.mockResolvedValue({ id: 'clan.lmt', name: 'La Meute', tag: 'LMT' })
  mocks.memberFindFirst.mockResolvedValue(null)
  mocks.memberCount.mockResolvedValue(0)
  mocks.memberCreate.mockResolvedValue({ id: 41 })
  mocks.clanFindFirst.mockResolvedValue(trackedClan)
  mocks.roleFindFirst.mockResolvedValue({ id: 5 })
  mocks.identityFindFirst.mockResolvedValue(null)
  mocks.identityFindUnique.mockResolvedValue(null)
  mocks.notifyJoinRequest.mockResolvedValue(undefined)
  mocks.notifyClanCreationRequest.mockResolvedValue(undefined)
  mocks.createNotificationForMember.mockResolvedValue(undefined)
  mocks.createMemberInvite.mockResolvedValue({ inviteId: 1, activationUrl: ACTIVATION_URL })
  mocks.sendEmail.mockResolvedValue({ delivered: true })
})

describe('POST /api/join sans compte', () => {
  it('exige une adresse de contact : le lien de création du compte y partira', async () => {
    const res = await postJoin(joinRequest({ pubgPlayerName: 'Balthazar_99' }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.code).toBe('CONTACT_EMAIL_REQUIRED')
    expect(mocks.memberCreate).not.toHaveBeenCalled()
  })

  it('enregistre la demande d’accès avec l’adresse, sans rattacher de compte', async () => {
    const res = await postJoin(joinRequest({ pubgPlayerName: 'Balthazar_99', contactEmail: 'joueur@exemple.fr' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.memberCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ clanId: 7, joinStatus: 'pending', isActive: false, contactEmail: 'joueur@exemple.fr' }),
    })
    expect(mocks.identityCreate).not.toHaveBeenCalled()
    expect(mocks.notifyJoinRequest).toHaveBeenCalledWith(7, 'Balthazar_99', 41)
    expect(data.message).toContain("Quand son Owner l'acceptera")
    expect(data.message).toContain('joueur@exemple.fr')
  })

  it('inscrit un nouveau clan sans compte : le demandeur en sera l’Owner', async () => {
    mocks.clanFindFirst.mockResolvedValue(null)
    mocks.fetchPlayerClan.mockResolvedValue({ id: 'clan.smok', name: 'Smoke Squad', tag: 'SMOK' })
    mocks.clanCreate.mockResolvedValue({ id: 90, name: 'Smoke Squad', tag: 'SMOK' })
    mocks.memberCreate.mockResolvedValue({ id: 42 })

    const res = await postJoin(joinRequest({ pubgPlayerName: 'Smoke_Leader', contactEmail: 'chef@exemple.fr' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.clanCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Smoke Squad', isActive: false }) })
    expect(mocks.memberRoleCreate).toHaveBeenCalledWith({ data: { memberId: 42, roleId: 5, assignedBy: null } })
    expect(mocks.identityCreate).not.toHaveBeenCalled()
    expect(data.message).toContain("compte d'Owner")
  })

  it(`borne à ${JOIN_PENDING_PER_EMAIL_LIMIT} les demandes en attente par adresse`, async () => {
    mocks.memberCount.mockResolvedValue(JOIN_PENDING_PER_EMAIL_LIMIT)

    const res = await postJoin(joinRequest({ pubgPlayerName: 'Balthazar_99', contactEmail: 'joueur@exemple.fr' }))

    expect(res.status).toBe(429)
    expect(mocks.memberCount).toHaveBeenCalledWith({ where: { contactEmail: 'joueur@exemple.fr', joinStatus: 'pending' } })
    expect(mocks.memberCreate).not.toHaveBeenCalled()
  })

  it('joueur déjà enregistré : renvoie vers l’Owner pour une invitation', async () => {
    mocks.memberFindFirst.mockResolvedValue({ id: 9, isActive: true, joinStatus: 'active', clan: { id: 7, name: 'La Meute', tag: 'LMT' } })

    const res = await postJoin(joinRequest({ pubgPlayerName: 'Balthazar_99', contactEmail: 'joueur@exemple.fr' }))
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.code).toBe('PLAYER_ALREADY_MEMBER')
    expect(data.error).toContain("Demandez une invitation à l'Owner du clan")
  })
})

describe('POST /api/join avec un compte', () => {
  it('rattache la demande au compte, sans exiger d’adresse pour un clan déjà suivi', async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: 3, activeMemberId: null })

    const res = await postJoin(joinRequest({ pubgPlayerName: 'Balthazar_99' }))

    expect(res.status).toBe(200)
    expect(mocks.memberCreate.mock.calls[0][0].data).not.toHaveProperty('contactEmail')
    expect(mocks.identityCreate).toHaveBeenCalledWith({ data: { userId: 3, memberId: 41, isPrimary: true } })
  })
})

describe('Acceptation d’une demande d’accès par l’Owner', () => {
  const activatedMember = {
    id: 41,
    displayName: 'Balthazar_99',
    pubgPlayerName: 'Balthazar_99',
    contactEmail: 'joueur@exemple.fr',
    clan: { name: 'La Meute', tag: 'LMT' },
    roles: [],
  }

  beforeEach(() => {
    mocks.memberFindUnique.mockResolvedValue({ id: 41, clanId: 7, isActive: false, roles: [] })
    mocks.memberUpdate.mockResolvedValue(activatedMember)
    mocks.getSessionFromRequest.mockResolvedValue({ userId: 1, activeMemberId: 2 })
  })

  it('demandeur sans compte : crée l’invitation et envoie le lien dans l’email d’acceptation', async () => {
    const res = await approveMember(postRequest('http://localhost/api/clans/7/members/41/approve'), { params: memberParams })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.createMemberInvite).toHaveBeenCalledWith({
      clanId: 7,
      memberId: 41,
      email: 'joueur@exemple.fr',
      invitedByUserId: 1,
      invitedByMemberId: 2,
      sendEmail: false,
    })
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmail.mock.calls[0][0].to).toBe('joueur@exemple.fr')
    expect(mocks.sendEmail.mock.calls[0][0].text).toContain(ACTIVATION_URL)
    expect(data.invitation).toEqual({ status: 'invited' })
    expect(data.message).toContain('Lien de création du compte envoyé à joueur@exemple.fr')
  })

  it('email non parti (SMTP absent) : l’acceptation tient, le message dit de renvoyer l’invitation', async () => {
    mocks.sendEmail.mockResolvedValue({ delivered: false, mode: 'stub' })

    const res = await approveMember(postRequest('http://localhost/api/clans/7/members/41/approve'), { params: memberParams })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.emailSent).toBe(false)
    expect(data.message).toContain("renvoyez l'invitation depuis la liste des membres")
  })

  it('demandeur qui a déjà un compte : aucune invitation', async () => {
    mocks.identityFindUnique.mockResolvedValue({ userId: 3 })

    const res = await approveMember(postRequest('http://localhost/api/clans/7/members/41/approve'), { params: memberParams })
    const data = await res.json()

    expect(mocks.createMemberInvite).not.toHaveBeenCalled()
    expect(data.invitation).toEqual({ status: 'has_account' })
    expect(mocks.sendEmail.mock.calls[0][0].text).not.toContain('/activate')
  })
})

describe('Refus d’une demande d’accès par l’Owner', () => {
  it('prévient le demandeur par email', async () => {
    mocks.memberFindUnique.mockResolvedValue({
      id: 41,
      displayName: 'Balthazar_99',
      clanId: 7,
      isActive: false,
      joinStatus: 'pending',
      contactEmail: 'joueur@exemple.fr',
      pubgPlayerName: 'Balthazar_99',
      clan: { name: 'La Meute', tag: 'LMT' },
    })
    mocks.memberUpdate.mockResolvedValue({ id: 41, displayName: 'Balthazar_99', joinStatus: 'rejected' })

    const res = await rejectMember(postRequest('http://localhost/api/clans/7/members/41/reject'), { params: memberParams })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.sendEmail.mock.calls[0][0].subject).toContain("n'a pas été retenue")
    expect(data.message).toContain('Il est prévenu par email')
  })
})

describe('Validation d’un clan inscrit sans compte par le SuperUser', () => {
  it('crée l’invitation de l’Owner et met le lien dans l’email de validation', async () => {
    mocks.clanFindUnique.mockResolvedValue({
      id: 90,
      name: 'Smoke Squad',
      tag: 'SMOK',
      archivedAt: null,
      members: [{ id: 42, contactEmail: 'chef@exemple.fr', pubgPlayerName: 'Smoke_Leader', roles: [{ role: { name: 'Owner' } }] }],
    })
    mocks.clanUpdate.mockResolvedValue({ id: 90, name: 'Smoke Squad', tag: 'SMOK', isActive: true })
    mocks.memberUpdate.mockResolvedValue({ id: 42 })
    mocks.getSessionFromRequest.mockResolvedValue({ userId: 1, activeMemberId: null })

    const res = await approveClan(postRequest('http://localhost/api/clans/90/approve'), { params: Promise.resolve({ clanId: '90' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.createMemberInvite).toHaveBeenCalledWith(expect.objectContaining({ clanId: 90, memberId: 42, email: 'chef@exemple.fr', sendEmail: false }))
    expect(mocks.sendEmail.mock.calls[0][0].text).toContain(ACTIVATION_URL)
    expect(mocks.sendEmail.mock.calls[0][0].text).toContain('compte d’Owner')
    expect(data.message).toContain('Lien de création du compte envoyé à chef@exemple.fr')
  })
})
