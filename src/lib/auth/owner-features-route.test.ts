import { beforeEach, describe, expect, it, vi } from 'vitest'

// Écran de délégation aux Owners (docs/TODO/administration.md, lot 3b) : contrat de la route. Garde et réglage
// simulés (leurs comportements sont testés à part) : rien n'est écrit.
const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  getOwnerFeatureAccessMap: vi.fn(),
  setOwnerFeatureAccess: vi.fn(),
}))

vi.mock('@/lib/auth/admin-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }))
vi.mock('@/lib/auth/owner-features', () => ({
  getOwnerFeatureAccessMap: mocks.getOwnerFeatureAccessMap,
  setOwnerFeatureAccess: mocks.setOwnerFeatureAccess,
}))

import { GET, PUT } from '@/app/api/settings/owner-features/route'
import { parseOwnerFeatureAccess } from '@/lib/auth/owner-feature-catalog'

function put(body: unknown) {
  return PUT(
    new Request('http://localhost:3000/api/settings/owner-features', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

describe('route de délégation aux Owners', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.requirePlatformAdmin.mockResolvedValue(null)
    mocks.getOwnerFeatureAccessMap.mockResolvedValue(parseOwnerFeatureAccess(null))
    mocks.setOwnerFeatureAccess.mockResolvedValue({})
  })

  it('décrit chaque fonctionnalité, son réglage et son verrou', async () => {
    const payload = await (await GET(new Request('http://localhost:3000/api/settings/owner-features'))).json()
    const tools = payload.features.find((feature: { key: string }) => feature.key === 'clan-telemetry-tools')
    expect(tools).toMatchObject({ access: 'superuser', defaultAccess: 'superuser', lockedReason: expect.any(String) })
    expect(payload.features.find((feature: { key: string }) => feature.key === 'clan-members')).toMatchObject({
      access: 'owner',
      lockedReason: null,
    })
  })

  it('enregistre un réglage valide', async () => {
    const response = await put({ feature: 'clan-competition', access: 'superuser' })
    expect(response.status).toBe(200)
    expect(mocks.setOwnerFeatureAccess).toHaveBeenCalledWith('clan-competition', 'superuser')
  })

  it('refuse d’ouvrir une fonctionnalité verrouillée (409) et une saisie invalide (400)', async () => {
    expect((await put({ feature: 'clan-telemetry-tools', access: 'owner' })).status).toBe(409)
    expect((await put({ feature: 'inconnue', access: 'owner' })).status).toBe(400)
    expect((await put({ feature: 'clan-members', access: 'admin' })).status).toBe(400)
    expect(mocks.setOwnerFeatureAccess).not.toHaveBeenCalled()
  })

  it('propage le refus de la garde', async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await put({ feature: 'clan-members', access: 'owner' })).status).toBe(403)
    expect(mocks.setOwnerFeatureAccess).not.toHaveBeenCalled()
  })
})
