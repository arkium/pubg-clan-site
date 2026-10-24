import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `GET /api/coach/quota` (docs/TODO/chatbot-ia.md §7.1). Prisma et la session sont simulés — aucun accès à la base
 * (CLAUDE.md, piège n° 9 : les tests de route vivent dans src/lib et importent le handler depuis src/app).
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getToken: vi.fn(),
  appConfigFindMany: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
  aggregate: vi.fn(),
}))

vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSession, getSessionTokenFromRequest: mocks.getToken }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    appConfig: { findMany: mocks.appConfigFindMany },
    coachUsage: { count: mocks.count, findFirst: mocks.findFirst, aggregate: mocks.aggregate },
  },
}))

import { GET } from '@/app/api/coach/quota/route'
import { resetCoachSettingsCache } from '@/lib/coach/coach-config'

const request = () => new Request('http://localhost/api/coach/quota')
const session = (overrides: Record<string, unknown> = {}) => ({
  sessionId: 's1',
  userId: 10,
  email: 'joueur@example.com',
  activeMemberId: 100,
  isSuperUser: false,
  ...overrides,
})

describe('GET /api/coach/quota', () => {
  const previousKey = process.env.GEMINI_API_KEY

  beforeEach(() => {
    resetCoachSettingsCache()
    for (const mock of Object.values(mocks)) mock.mockReset()
    process.env.GEMINI_API_KEY = 'cle-fictive'
    mocks.appConfigFindMany.mockResolvedValue([{ key: 'coach_enabled', value: 'true' }])
    mocks.count.mockResolvedValue(5)
    mocks.findFirst.mockResolvedValue(null)
    mocks.aggregate.mockResolvedValue({ _sum: { costMicroUsd: 0 } })
  })

  afterEach(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  })

  it('répond 200 « non connecté » à un visiteur sans cookie, 401 à un jeton périmé', async () => {
    mocks.getSession.mockResolvedValue(null)
    mocks.getToken.mockReturnValue(null)
    const visitor = await GET(request())
    expect(visitor.status).toBe(200)
    expect(await visitor.json()).toEqual({ authenticated: false })

    mocks.getToken.mockReturnValue('jeton-perime')
    expect((await GET(request())).status).toBe(401)
    expect(mocks.count).not.toHaveBeenCalled()
  })

  it('renvoie le restant de l’heure et l’état du mois au membre connecté', async () => {
    mocks.getSession.mockResolvedValue(session())
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      authenticated: true,
      allowed: true,
      reason: null,
      unlimited: false,
      remainingHour: 15,
      hourlyLimit: 20,
      monthPercent: 0,
      globalPercent: 0,
    })
  })

  it('dit au membre que le Coach est en pause quand il est fermé, et laisse passer le SuperUser', async () => {
    mocks.appConfigFindMany.mockResolvedValue([])
    mocks.getSession.mockResolvedValue(session())
    expect(await (await GET(request())).json()).toMatchObject({ allowed: false, reason: 'coach_paused' })

    resetCoachSettingsCache()
    mocks.getSession.mockResolvedValue(session({ isSuperUser: true }))
    expect(await (await GET(request())).json()).toMatchObject({ allowed: true, unlimited: true, remainingHour: null })
  })

  it('ferme tout sans clé d’API', async () => {
    delete process.env.GEMINI_API_KEY
    mocks.getSession.mockResolvedValue(session({ isSuperUser: true }))
    expect(await (await GET(request())).json()).toMatchObject({ allowed: false, reason: 'coach_paused' })
  })

  it('répond 500 sans fuite si la base tombe', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getSession.mockResolvedValue(session())
    mocks.count.mockRejectedValue(new Error('down'))
    const response = await GET(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal Server Error' })
    silence.mockRestore()
  })
})
