import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Routes de la page Joueurs (`/api/players/ranking`, `/api/players/compare` — docs/features/joueurs.md) : session ou mode
 * visiteur, sinon 401 ; paramètres lus et ramenés aux valeurs connues ; au moins deux éléments à comparer. Le service est
 * simulé (aucun accès à la base, CLAUDE.md piège n° 9).
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  authDisabled: vi.fn(),
  ranking: vi.fn(),
  comparison: vi.fn(),
}))

vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSession }))
vi.mock('@/lib/auth-mode', () => ({ isAuthDisabled: mocks.authDisabled }))
vi.mock('@/lib/players-ranking-service', () => ({ getPlayersRanking: mocks.ranking, getPlayersComparison: mocks.comparison }))

import { GET as compare } from '@/app/api/players/compare/route'
import { GET as ranking } from '@/app/api/players/ranking/route'

const request = (path: string) => new Request(`http://localhost${path}`)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.getSession.mockResolvedValue(null)
  mocks.authDisabled.mockReturnValue(false)
  mocks.ranking.mockResolvedValue({ period: 'month', mode: 'all', ranked: [] })
  mocks.comparison.mockResolvedValue({ slots: [], duels: [] })
})

describe('GET /api/players/ranking', () => {
  it('sans session hors mode visiteur : 401, aucune lecture', async () => {
    const response = await ranking(request('/api/players/ranking'))
    expect(response.status).toBe(401)
    expect(mocks.ranking).not.toHaveBeenCalled()
  })

  it('mode visiteur : ouvert ; période et mode par défaut (semaine, tous)', async () => {
    mocks.authDisabled.mockReturnValue(true)
    const response = await ranking(request('/api/players/ranking?period=year&mode=trio'))
    expect(response.status).toBe(200)
    expect(mocks.ranking).toHaveBeenCalledWith('week', 'all')
  })

  it('membre connecté : période et mode demandés', async () => {
    mocks.getSession.mockResolvedValue({ userId: 1 })
    await ranking(request('/api/players/ranking?period=week&mode=duo'))
    expect(mocks.ranking).toHaveBeenCalledWith('week', 'duo')
  })

  it('erreur du service : 500 sans détail', async () => {
    mocks.getSession.mockResolvedValue({ userId: 1 })
    mocks.ranking.mockRejectedValue(new Error('SQL'))
    const response = await ranking(request('/api/players/ranking'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to fetch players ranking' })
  })
})

describe('GET /api/players/compare', () => {
  it('sans session hors mode visiteur : 401', async () => {
    const response = await compare(request('/api/players/compare?ids=1,2'))
    expect(response.status).toBe(401)
  })

  it('moins de deux éléments valides : 400, aucune lecture', async () => {
    mocks.getSession.mockResolvedValue({ userId: 1 })
    const response = await compare(request('/api/players/compare?ids=1,1,abc'))
    expect(response.status).toBe(400)
    expect(mocks.comparison).not.toHaveBeenCalled()
  })

  it('joueurs et moyenne de clan, trois au plus, période et mode', async () => {
    mocks.authDisabled.mockReturnValue(true)
    const response = await compare(request('/api/players/compare?ids=12,clan-5,34,56&period=all&mode=squad'))
    expect(response.status).toBe(200)
    expect(mocks.comparison).toHaveBeenCalledWith(
      [
        { kind: 'player', memberId: 12 },
        { kind: 'clan', clanId: 5 },
        { kind: 'player', memberId: 34 },
      ],
      'all',
      'squad'
    )
  })
})
