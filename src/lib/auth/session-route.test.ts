import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `GET /api/auth/session` (PageSpeed du 2026-10-11) : un visiteur sans cookie reçoit un 200 « non connecté », plus un 401
 * qui s'affichait en erreur dans la console de l'accueil et déclenchait une déconnexion inutile. Un cookie présent mais
 * invalide ou expiré garde son 401, que `useAuthSession` purge. Test placé dans `src/lib` : Vitest ne lit que ce dossier.
 */
const getSessionFromRequest = vi.fn()

vi.mock('@/lib/auth-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-session')>()),
  getSessionFromRequest: (request: Request) => getSessionFromRequest(request),
}))
vi.mock('@/lib/auth-service', () => ({ listLinkedMembers: vi.fn(async () => []) }))
vi.mock('@/lib/role-service', () => ({ getMemberPermissionKeys: vi.fn(async () => []) }))
vi.mock('@/lib/auth/owner-features', () => ({ getOwnerFeatureAccessMap: vi.fn(async () => ({})) }))

const { GET } = await import('@/app/api/auth/session/route')

const request = (cookie?: string) =>
  new Request('http://localhost/api/auth/session', cookie ? { headers: { cookie } } : undefined)

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    getSessionFromRequest.mockReset()
    getSessionFromRequest.mockResolvedValue(null)
  })

  it('visiteur sans cookie : 200, non connecté (pas d’erreur en console, rien à purger)', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ authenticated: false })
  })

  it('cookie de session invalide ou expiré : 401, que le client purge', async () => {
    const response = await GET(request('theme=dark; pubg_clan_session=jeton-expire'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ authenticated: false })
  })

  it('un autre cookie seul ne compte pas comme une session expirée', async () => {
    const response = await GET(request('theme=dark'))
    expect(response.status).toBe(200)
  })

  it('session valide : 200, connecté', async () => {
    getSessionFromRequest.mockResolvedValue({ userId: 'u1', email: 'membre@example.com', isSuperUser: false, activeMemberId: null })
    const response = await GET(request('pubg_clan_session=jeton-valide'))
    expect(response.status).toBe(200)
    expect((await response.json()).authenticated).toBe(true)
  })
})
