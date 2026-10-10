import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthSessionContext } from '@/lib/auth-session'

// Prisma entièrement simulé : la base de .env est la production.
const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  memberIdentityFindUnique: vi.fn(),
}))

vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }))
vi.mock('@/lib/prisma', () => ({ prisma: { memberIdentity: { findUnique: mocks.memberIdentityFindUnique } } }))

import { decideOwnMember, requireOwnMember } from '@/lib/auth/own-member-guard'

function session(overrides: Partial<AuthSessionContext> = {}): AuthSessionContext {
  return { sessionId: 's1', userId: 10, email: 'joueur@example.com', activeMemberId: 100, isSuperUser: false, ...overrides }
}

// Compte 10 : membres 100 (actif) et 101 (autre clan) ; le membre 200 est un coéquipier lié au compte 20.
const IDENTITIES = new Set(['10:100', '10:101', '20:200'])

const request = () => new Request('http://localhost:3000/api/members/100/notifications')

describe('own-member-guard', () => {
  const previousAuthMode = process.env.DISABLE_AUTH_PERMISSIONS

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.memberIdentityFindUnique.mockImplementation(
      async ({ where }: { where: { userId_memberId: { userId: number; memberId: number } } }) => {
        const { userId, memberId } = where.userId_memberId
        return IDENTITIES.has(`${userId}:${memberId}`) ? { id: 1 } : null
      }
    )
  })

  afterEach(() => {
    if (previousAuthMode === undefined) delete process.env.DISABLE_AUTH_PERMISSIONS
    else process.env.DISABLE_AUTH_PERMISSIONS = previousAuthMode
  })

  describe('decideOwnMember', () => {
    it('refuse sans session (401)', async () => {
      expect(await decideOwnMember(null, 100)).toEqual({ allowed: false, status: 401, error: 'Unauthorized' })
    })

    it('ouvre le membre actif du compte', async () => {
      expect(await decideOwnMember(session(), 100)).toEqual({ allowed: true, isSuperUser: false })
    })

    it('ouvre un autre membre lié au même compte, même s’il n’est pas actif', async () => {
      expect(await decideOwnMember(session(), 101)).toEqual({ allowed: true, isSuperUser: false })
    })

    it('refuse un coéquipier, même du même clan (403, pas 401)', async () => {
      expect(await decideOwnMember(session(), 200)).toEqual({ allowed: false, status: 403, error: 'Forbidden' })
    })

    it('ouvre au SuperUser, même sans membre actif et sans lire la base', async () => {
      const decision = await decideOwnMember(session({ userId: 1, activeMemberId: null, isSuperUser: true }), 200)
      expect(decision).toEqual({ allowed: true, isSuperUser: true })
      expect(mocks.memberIdentityFindUnique).not.toHaveBeenCalled()
    })
  })

  describe('requireOwnMember', () => {
    it('jamais ouverte par le mode visiteur', async () => {
      process.env.DISABLE_AUTH_PERMISSIONS = 'true'
      mocks.getSessionFromRequest.mockResolvedValue(null)
      const response = await requireOwnMember(100, request())
      expect(response?.status).toBe(401)
    })

    it('rend null pour le propriétaire, 403 pour un coéquipier', async () => {
      mocks.getSessionFromRequest.mockResolvedValue(session())
      expect(await requireOwnMember(100, request())).toBeNull()
      const refused = await requireOwnMember(200, request())
      expect(refused?.status).toBe(403)
      expect(await refused?.json()).toEqual({ error: 'Forbidden' })
    })
  })
})

/** Routes des données personnelles d'un membre : chaque handler passe par la garde, jamais par celle du clan. */
const PERSONAL_ROUTES = [
  'src/app/api/members/[id]/notifications/route.ts',
  'src/app/api/members/[id]/notifications/[notifId]/route.ts',
  'src/app/api/members/[id]/notification-preferences/route.ts',
]

describe('routes personnelles', () => {
  it.each(PERSONAL_ROUTES)('%s : chaque handler appelle requireOwnMember', (file) => {
    const source = readFileSync(path.resolve(__dirname, '../../..', file), 'utf8')
    const handlers = source.match(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g) ?? []
    expect(handlers.length).toBeGreaterThan(0)
    expect(source.match(/await requireOwnMember\(/g)?.length).toBe(handlers.length)
    expect(source).not.toContain('requireSameClanAsMember')
  })
})
