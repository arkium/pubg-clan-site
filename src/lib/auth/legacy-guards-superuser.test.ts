import { beforeEach, describe, expect, it, vi } from 'vitest'

// Gardes historiques de src/middleware/auth-permission.ts : le SuperUser passe en premier, même sans membre
// actif (docs/TODO/administration.md M12), et traverse `hidden` (Q18). Prisma entièrement simulé.
const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  userAccountFindUnique: vi.fn(),
  clanMemberFindUnique: vi.fn(),
  getNavItemRole: vi.fn(),
  hasPermission: vi.fn(),
  hasAnyRole: vi.fn(),
}))

vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userAccount: { findUnique: mocks.userAccountFindUnique },
    clanMember: { findUnique: mocks.clanMemberFindUnique },
  },
}))
vi.mock('@/lib/nav-permissions-service', () => ({ getNavItemRole: mocks.getNavItemRole }))
vi.mock('@/lib/role-service', () => ({ hasPermission: mocks.hasPermission, hasAnyRole: mocks.hasAnyRole }))

import { requireNavPermission, requirePermission, requireRole } from '@/middleware/auth-permission'

const request = () => new Request('http://localhost:3000/api/clans/7/whatever')

function asSuperUserWithoutMember() {
  mocks.getSessionFromRequest.mockResolvedValue({ sessionId: 's', userId: 1, email: 'su@example.com', activeMemberId: null, isSuperUser: true })
  mocks.userAccountFindUnique.mockResolvedValue({ isSuperUser: true })
}

function asMemberOfClan7() {
  mocks.getSessionFromRequest.mockResolvedValue({ sessionId: 's', userId: 2, email: 'm@example.com', activeMemberId: 100, isSuperUser: false })
  mocks.userAccountFindUnique.mockResolvedValue({ isSuperUser: false })
  mocks.clanMemberFindUnique.mockResolvedValue({ clanId: 7, isActive: true })
}

describe('gardes historiques et SuperUser', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.hasPermission.mockResolvedValue(false)
    mocks.hasAnyRole.mockResolvedValue(false)
    delete process.env.DISABLE_AUTH_PERMISSIONS
  })

  it('requirePermission et requireRole acceptent le SuperUser sans membre actif', async () => {
    asSuperUserWithoutMember()

    expect(await requirePermission('manage_settings')(request(), { clanId: 7 })).toBeNull()
    expect(await requireRole(['Owner'])(request(), { clanId: 7 })).toBeNull()
  })

  it('requirePermission refuse toujours une session sans membre actif qui n’est pas SuperUser', async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null)
    mocks.userAccountFindUnique.mockResolvedValue(null)

    expect((await requirePermission('manage_settings')(request(), { clanId: 7 }))?.status).toBe(401)
  })

  it('requireNavPermission laisse le SuperUser sans membre actif sur une clé superuser', async () => {
    asSuperUserWithoutMember()
    mocks.getNavItemRole.mockResolvedValue('superuser')

    expect(await requireNavPermission('clan.heatmap-kills')(request(), { clanId: 7 })).toBeNull()
  })

  it('une clé masquée (hidden) reste ouverte au SuperUser et fermée aux autres', async () => {
    mocks.getNavItemRole.mockResolvedValue('hidden')

    asSuperUserWithoutMember()
    expect(await requireNavPermission('clan.challenges')(request(), { clanId: 7 })).toBeNull()

    asMemberOfClan7()
    expect((await requireNavPermission('clan.challenges')(request(), { clanId: 7 }))?.status).toBe(403)
  })
})
