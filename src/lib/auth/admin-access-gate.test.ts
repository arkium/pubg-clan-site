import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthSessionContext } from '@/lib/auth-session'

// Garde serveur des pages (src/components/settings/AdminAccessGate.tsx, Q21 : option « c-bis ») : elle ne refuse
// qu'une session VALIDE sans les droits ; sans session valide, la page s'affiche et le client comme l'API tranchent.
// Prisma entièrement simulé (la base de .env est la production).
const mocks = vi.hoisted(() => ({
  session: null as AuthSessionContext | null,
  clanMemberFindUnique: vi.fn(),
  hasAnyRole: vi.fn(),
  getOwnerFeatureAccess: vi.fn(),
}))

vi.mock('@/lib/auth-session', () => ({ getServerComponentSession: async () => mocks.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { clanMember: { findUnique: mocks.clanMemberFindUnique } } }))
vi.mock('@/lib/role-service', () => ({ hasAnyRole: mocks.hasAnyRole, PREDEFINED_ROLES: { OWNER: { name: 'Owner' } } }))
vi.mock('@/lib/auth/owner-features', () => ({ getOwnerFeatureAccess: mocks.getOwnerFeatureAccess }))

import AdminAccessGate, { type AdminAccessRequirement } from '@/components/settings/AdminAccessGate'

const CONTENT = 'contenu de la page'

async function render(requirement: AdminAccessRequirement) {
  return (await AdminAccessGate({ requirement, children: CONTENT })) as ReactElement<{ children?: unknown }>
}

function isPage(element: ReactElement<{ children?: unknown }>) {
  return element.props.children === CONTENT
}

function ownerOfClan7(): AuthSessionContext {
  return { sessionId: 's', userId: 2, email: 'o@example.com', activeMemberId: 100, isSuperUser: false }
}

describe('AdminAccessGate', () => {
  beforeEach(() => {
    mocks.session = null
    mocks.clanMemberFindUnique.mockReset().mockResolvedValue({ clanId: 7, isActive: true })
    mocks.hasAnyRole.mockReset().mockResolvedValue(true)
    mocks.getOwnerFeatureAccess.mockReset().mockResolvedValue('owner')
  })

  it('sans session valide, affiche la page : le client et l’API (401) s’en chargent', async () => {
    expect(isPage(await render({ kind: 'platform' }))).toBe(true)
    expect(isPage(await render({ kind: 'clan-owner', clanId: '8' }))).toBe(true)
  })

  it('refuse côté serveur une session valide sans les droits', async () => {
    mocks.session = ownerOfClan7()

    const platform = await render({ kind: 'platform' })
    expect(isPage(platform)).toBe(false)
    expect(platform.type).toBe('main')

    expect(isPage(await render({ kind: 'clan-owner', clanId: '8' }))).toBe(false)

    mocks.getOwnerFeatureAccess.mockResolvedValue('superuser')
    expect(isPage(await render({ kind: 'clan-feature', clanId: '7', feature: 'clan-telemetry-tools' }))).toBe(false)
  })

  it('affiche la page à l’Owner du clan de l’adresse et au SuperUser sans membre actif', async () => {
    mocks.session = ownerOfClan7()
    expect(isPage(await render({ kind: 'clan-feature', clanId: '7', feature: 'clan-members' }))).toBe(true)
    expect(isPage(await render({ kind: 'active-clan-owner' }))).toBe(true)

    mocks.session = { ...ownerOfClan7(), activeMemberId: null, isSuperUser: true }
    expect(isPage(await render({ kind: 'platform' }))).toBe(true)
    expect(isPage(await render({ kind: 'clan-feature', clanId: '42', feature: 'clan-telemetry-tools' }))).toBe(true)
  })
})
