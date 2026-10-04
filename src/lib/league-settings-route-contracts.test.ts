import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Routes des réglages de la ligue (/api/settings/league et /preview) : SuperUser seulement, validation stricte,
 * enregistrement dans `AppConfig`, aperçu en lecture seule. Prisma, la session et la garde SuperUser sont simulés —
 * aucun accès à la base (convention CLAUDE.md, piège n° 9 : les tests de route vivent dans src/lib).
 */

const mocks = vi.hoisted(() => ({
  requireSuperUser: vi.fn(),
  getSession: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  queryRaw: vi.fn(),
  clanFindMany: vi.fn(),
}))

vi.mock('@/middleware/auth-permission', () => ({ requireSuperUser: mocks.requireSuperUser }))
vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSession }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    appConfig: { findUnique: mocks.findUnique, upsert: mocks.upsert },
    $queryRaw: mocks.queryRaw,
    clan: { findMany: mocks.clanFindMany },
  },
}))

import { POST as preview } from '@/app/api/settings/league/preview/route'
import { GET, PUT } from '@/app/api/settings/league/route'
import { DEFAULT_LEAGUE_SETTINGS } from './clan-league'
import { invalidateLeagueSettingsCache } from './league-settings-service'

const request = (method: string, body?: unknown) =>
  new Request('http://localhost/api/settings/league', { method, body: body === undefined ? undefined : JSON.stringify(body) })
const settings = () => JSON.parse(JSON.stringify(DEFAULT_LEAGUE_SETTINGS)) as typeof DEFAULT_LEAGUE_SETTINGS

beforeEach(() => {
  vi.clearAllMocks()
  invalidateLeagueSettingsCache()
  mocks.requireSuperUser.mockResolvedValue(null)
  mocks.getSession.mockResolvedValue({ email: 'admin@example.com', isSuperUser: true, userId: 1 })
  mocks.findUnique.mockResolvedValue(null)
  mocks.upsert.mockResolvedValue({})
  mocks.queryRaw.mockResolvedValue([])
  mocks.clanFindMany.mockResolvedValue([])
})

describe('GET /api/settings/league', () => {
  it('refuse sans SuperUser : la réponse de la garde est renvoyée telle quelle', async () => {
    mocks.requireSuperUser.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))
    const response = await GET(request('GET'))
    expect(response.status).toBe(403)
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  it('sans réglage enregistré : valeurs par défaut, bornes', async () => {
    const body = await (await GET(request('GET'))).json()
    expect(body).toMatchObject({ isDefault: true, updatedAt: null, settings: DEFAULT_LEAGUE_SETTINGS, defaults: DEFAULT_LEAGUE_SETTINGS })
    expect(body.bounds.zoneEnd).toEqual({ min: 4, max: 30, integer: true })
  })

  it('réglage enregistré : relu, champ abîmé remplacé par sa valeur par défaut', async () => {
    mocks.findUnique.mockResolvedValue({ value: JSON.stringify({ settings: { ...settings(), placementWeight: 170, zoneEnd: 99 }, updatedAt: '2026-10-04T10:00:00.000Z', updatedBy: 'admin@example.com' }) })
    const body = await (await GET(request('GET'))).json()
    expect(body).toMatchObject({ isDefault: false, updatedBy: 'admin@example.com' })
    expect(body.settings.placementWeight).toBe(170)
    expect(body.settings.zoneEnd).toBe(8)
  })
})

describe('PUT /api/settings/league', () => {
  it('réglages invalides : 400 avec les champs fautifs, rien d’enregistré', async () => {
    const response = await PUT(request('PUT', { settings: { ...settings(), zoneEnd: 2 } }))
    expect(response.status).toBe(400)
    expect((await response.json()).errors.map((error: { field: string }) => error.field)).toEqual(['zoneEnd'])
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('réglages valides : enregistrés dans AppConfig avec l’auteur, relus sans passer par la base', async () => {
    const response = await PUT(request('PUT', { settings: { ...settings(), placementWeight: 170 } }))
    expect(response.status).toBe(200)
    const call = mocks.upsert.mock.calls[0][0]
    expect(call.where).toEqual({ key: 'league_settings' })
    const stored = JSON.parse(call.create.value)
    expect(stored).toMatchObject({ updatedBy: 'admin@example.com', settings: { placementWeight: 170 } })
    expect(await response.json()).toMatchObject({ isDefault: false, settings: { placementWeight: 170 } })
    await GET(request('GET'))
    expect(mocks.findUnique).not.toHaveBeenCalled() // cache mis à jour par l'enregistrement
  })

  it('refuse sans SuperUser, même avec des réglages valides', async () => {
    mocks.requireSuperUser.mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await PUT(request('PUT', { settings: settings() }))).status).toBe(401)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})

describe('POST /api/settings/league/preview', () => {
  it('lecture seule : Ranked lit `competitive`, rien n’est enregistré', async () => {
    const response = await preview(request('POST', { settings: { ...settings(), placementWeight: 170 }, period: 'month', matchType: 'competitive' }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ period: 'month', matchType: 'competitive', draft: { minMatches: 15 }, current: { minMatches: 15 } })
    expect(mocks.queryRaw.mock.calls[0][0].values[0]).toBe('competitive')
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('brouillon invalide : 400', async () => {
    const response = await preview(request('POST', { settings: { ...settings(), placementPoints: [] } }))
    expect(response.status).toBe(400)
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })
})
