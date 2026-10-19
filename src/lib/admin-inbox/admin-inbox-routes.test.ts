import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contrats des routes de lecture du SuperUser ajoutées le 2026-10-19 : boîte « À traiter » (`GET /api/settings/inbox`)
 * et mise en route d'un clan (`GET /api/settings/clans/[id]/onboarding`). Garde Plateforme, erreurs propres ; le
 * contenu est couvert par admin-inbox.test.ts et clan-onboarding.test.ts.
 */

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  getAdminInbox: vi.fn(),
  getClanOnboarding: vi.fn(),
}))

vi.mock('@/lib/auth/admin-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }))
vi.mock('@/lib/admin-inbox/service', () => ({ getAdminInbox: mocks.getAdminInbox }))
vi.mock('@/lib/clan-onboarding/service', () => ({ getClanOnboarding: mocks.getClanOnboarding }))

import { GET as getOnboarding } from '@/app/api/settings/clans/[id]/onboarding/route'
import { GET as getInbox } from '@/app/api/settings/inbox/route'

const request = (path: string) => new Request(`http://localhost${path}`)
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePlatformAdmin.mockResolvedValue(null)
})

describe('GET /api/settings/inbox', () => {
  it('renvoie la boîte au SuperUser', async () => {
    mocks.getAdminInbox.mockResolvedValue({ items: [], unavailable: [], generatedAt: '2026-10-19T09:00:00.000Z' })

    const response = await getInbox(request('/api/settings/inbox'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [], unavailable: [], generatedAt: '2026-10-19T09:00:00.000Z' })
  })

  it.each([401, 403])('propage le refus de la garde (%i) sans rien lire', async (status) => {
    mocks.requirePlatformAdmin.mockResolvedValue(Response.json({ error: 'refus' }, { status }))

    expect((await getInbox(request('/api/settings/inbox'))).status).toBe(status)
    expect(mocks.getAdminInbox).not.toHaveBeenCalled()
  })

  it('500 sans détail si la lecture échoue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getAdminInbox.mockRejectedValue(new Error('base indisponible'))

    const response = await getInbox(request('/api/settings/inbox'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal Server Error' })
  })
})

describe('GET /api/settings/clans/[id]/onboarding', () => {
  it('renvoie la checklist du clan', async () => {
    mocks.getClanOnboarding.mockResolvedValue({ clan: { id: 7 }, steps: [], done: 0, total: 7, nextTodo: null })

    const response = await getOnboarding(request('/api/settings/clans/7/onboarding'), params('7'))

    expect(response.status).toBe(200)
    expect(mocks.getClanOnboarding).toHaveBeenCalledWith(7)
  })

  it('400 sur un identifiant invalide, 404 sur un clan inconnu ou technique', async () => {
    expect((await getOnboarding(request('/api/settings/clans/abc/onboarding'), params('abc'))).status).toBe(400)

    mocks.getClanOnboarding.mockResolvedValue(null)
    expect((await getOnboarding(request('/api/settings/clans/99/onboarding'), params('99'))).status).toBe(404)
  })

  it('propage le refus de la garde sans rien lire', async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))

    expect((await getOnboarding(request('/api/settings/clans/7/onboarding'), params('7'))).status).toBe(403)
    expect(mocks.getClanOnboarding).not.toHaveBeenCalled()
  })
})
