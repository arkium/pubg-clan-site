import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lecture publique des tournois : réservée aux connectés, mais ouverte à tout visiteur quand
 * DISABLE_AUTH_PERMISSIONS=true (mode visiteur). La gestion des tournois passe par d'autres routes,
 * réservées au owner du clan et au superuser.
 */

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  listTournamentOverviews: vi.fn(),
}))

vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }))
vi.mock('@/lib/tournament-overview', () => ({ listTournamentOverviews: mocks.listTournamentOverviews }))

import { GET } from '../app/api/tournaments/route'

const request = () => new Request('http://localhost/api/tournaments')

describe('GET /api/tournaments', () => {
  const previous = process.env.DISABLE_AUTH_PERMISSIONS

  beforeEach(() => {
    mocks.getSessionFromRequest.mockReset().mockResolvedValue(null)
    mocks.listTournamentOverviews.mockReset().mockResolvedValue([])
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.DISABLE_AUTH_PERMISSIONS
    else process.env.DISABLE_AUTH_PERMISSIONS = previous
  })

  it('refuse un visiteur sans session hors mode visiteur', async () => {
    process.env.DISABLE_AUTH_PERMISSIONS = 'false'
    const response = await GET(request())
    expect(response.status).toBe(401)
    expect(mocks.listTournamentOverviews).not.toHaveBeenCalled()
  })

  it('ouvre la liste à un visiteur sans session en mode visiteur', async () => {
    process.env.DISABLE_AUTH_PERMISSIONS = 'true'
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ tournaments: [] })
  })

  it('sert un utilisateur connecté dans tous les cas', async () => {
    process.env.DISABLE_AUTH_PERMISSIONS = 'false'
    mocks.getSessionFromRequest.mockResolvedValue({ userId: 1 })
    const response = await GET(request())
    expect(response.status).toBe(200)
  })
})
