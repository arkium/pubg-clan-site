import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthSessionContext } from '@/lib/auth-session'

// Prisma entièrement simulé : la base de .env est la production.
const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  clanMemberFindUnique: vi.fn(),
  hasAnyRole: vi.fn(),
  getOwnerFeatureAccess: vi.fn(),
}))

vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }))
vi.mock('@/lib/prisma', () => ({ prisma: { clanMember: { findUnique: mocks.clanMemberFindUnique } } }))
vi.mock('@/lib/role-service', () => ({
  hasAnyRole: mocks.hasAnyRole,
  PREDEFINED_ROLES: { OWNER: { name: 'Owner' } },
}))
vi.mock('@/lib/auth/owner-features', () => ({ getOwnerFeatureAccess: mocks.getOwnerFeatureAccess }))

import {
  decideClanAccess,
  decideClanFeature,
  decidePlatformAdmin,
  getActiveMemberClanId,
  requireClanAccess,
  requireClanFeature,
  requirePlatformAdmin,
} from '@/lib/auth/admin-guards'

function session(overrides: Partial<AuthSessionContext> = {}): AuthSessionContext {
  return { sessionId: 's1', userId: 10, email: 'joueur@example.com', activeMemberId: 100, isSuperUser: false, ...overrides }
}

const superUserWithoutMember = session({ userId: 1, activeMemberId: null, isSuperUser: true })
// Membre 100 : clan 7 ; membre 200 : clan 8 ; membre 300 : clan 7 mais inactif
const MEMBERS: Record<number, { clanId: number; isActive: boolean }> = {
  100: { clanId: 7, isActive: true },
  200: { clanId: 8, isActive: true },
  300: { clanId: 7, isActive: false },
}

const request = () => new Request('http://localhost:3000/api/clans/7/whatever')

describe('admin-guards', () => {
  const previousAuthMode = process.env.DISABLE_AUTH_PERMISSIONS

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.clanMemberFindUnique.mockImplementation(async ({ where }: { where: { id: number } }) => MEMBERS[where.id] ?? null)
    mocks.hasAnyRole.mockResolvedValue(false)
    mocks.getOwnerFeatureAccess.mockResolvedValue('owner')
  })

  afterEach(() => {
    if (previousAuthMode === undefined) delete process.env.DISABLE_AUTH_PERMISSIONS
    else process.env.DISABLE_AUTH_PERMISSIONS = previousAuthMode
  })

  describe('decidePlatformAdmin', () => {
    it('refuse sans session (401), refuse un Owner (403), accepte le SuperUser sans membre actif', () => {
      expect(decidePlatformAdmin(null)).toMatchObject({ allowed: false, status: 401 })
      expect(decidePlatformAdmin(session())).toMatchObject({ allowed: false, status: 403 })
      expect(decidePlatformAdmin(superUserWithoutMember)).toMatchObject({ allowed: true, isSuperUser: true })
    })
  })

  describe('decideClanAccess', () => {
    it('accepte le SuperUser sur n’importe quel clan, sans membre actif et sans lire la base', async () => {
      expect(await decideClanAccess(superUserWithoutMember, 42, 'owner')).toMatchObject({ allowed: true })
      expect(mocks.clanMemberFindUnique).not.toHaveBeenCalled()
    })

    it('refuse l’Owner d’un autre clan', async () => {
      mocks.hasAnyRole.mockResolvedValue(true)
      expect(await decideClanAccess(session({ activeMemberId: 200 }), 7, 'owner')).toMatchObject({
        allowed: false,
        status: 403,
      })
    })

    it('refuse un membre inactif et une session sans membre actif (403, jamais 401)', async () => {
      mocks.hasAnyRole.mockResolvedValue(true)
      expect(await decideClanAccess(session({ activeMemberId: 300 }), 7, 'owner')).toMatchObject({ status: 403 })
      expect(await decideClanAccess(session({ activeMemberId: null }), 7, 'member')).toMatchObject({ status: 403 })
    })

    it('distingue Owner et membre du clan de l’adresse', async () => {
      expect(await decideClanAccess(session(), 7, 'member')).toMatchObject({ allowed: true, actorMemberId: 100 })
      expect(await decideClanAccess(session(), 7, 'owner')).toMatchObject({ allowed: false, status: 403 })

      mocks.hasAnyRole.mockResolvedValue(true)
      expect(await decideClanAccess(session(), 7, 'owner')).toMatchObject({ allowed: true })
      expect(mocks.hasAnyRole).toHaveBeenCalledWith(100, ['Owner'])
    })
  })

  describe('decideClanFeature', () => {
    it('ouvre une fonctionnalité à l’Owner du clan seulement quand le réglage le permet', async () => {
      mocks.hasAnyRole.mockResolvedValue(true)

      mocks.getOwnerFeatureAccess.mockResolvedValue('superuser')
      expect(await decideClanFeature(session(), 7, 'clan-competition')).toMatchObject({ status: 403 })

      mocks.getOwnerFeatureAccess.mockResolvedValue('owner')
      expect(await decideClanFeature(session(), 7, 'clan-members')).toMatchObject({ allowed: true })
      expect(await decideClanFeature(session({ activeMemberId: 200 }), 7, 'clan-members')).toMatchObject({
        status: 403,
      })
    })

    it('accepte toujours le SuperUser, même sur une fonctionnalité fermée aux Owners', async () => {
      mocks.getOwnerFeatureAccess.mockResolvedValue('superuser')
      expect(await decideClanFeature(superUserWithoutMember, 7, 'clan-competition')).toMatchObject({
        allowed: true,
      })
    })
  })

  describe('gardes de route', () => {
    it('ne sont jamais ouvertes par le mode visiteur', async () => {
      process.env.DISABLE_AUTH_PERMISSIONS = 'true'
      mocks.getSessionFromRequest.mockResolvedValue(null)

      expect((await requirePlatformAdmin(request()))?.status).toBe(401)
      expect((await requireClanAccess(request(), 7, 'member'))?.status).toBe(401)
      expect((await requireClanFeature(request(), 7, 'clan-members'))?.status).toBe(401)
    })

    it('renvoient null quand l’accès est accordé', async () => {
      mocks.getSessionFromRequest.mockResolvedValue(superUserWithoutMember)

      expect(await requirePlatformAdmin(request())).toBeNull()
      expect(await requireClanAccess(request(), 7, 'owner')).toBeNull()
      expect(await requireClanFeature(request(), 7, 'clan-competition')).toBeNull()
    })

    it('renvoient 403 à une session valide refusée', async () => {
      mocks.getSessionFromRequest.mockResolvedValue(session())
      const response = await requirePlatformAdmin(request())
      expect(response?.status).toBe(403)
      expect(await response?.json()).toEqual({ error: 'Forbidden' })
    })
  })

  it('getActiveMemberClanId : clan du membre actif, null s’il est inactif ou absent', async () => {
    expect(await getActiveMemberClanId(session())).toBe(7)
    expect(await getActiveMemberClanId(session({ activeMemberId: 300 }))).toBeNull()
    expect(await getActiveMemberClanId(session({ activeMemberId: null }))).toBeNull()
    expect(await getActiveMemberClanId(null)).toBeNull()
  })
})
