import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `GET /api/clans/[clanId]/map-stats` — page « Cartes » d'un clan (2026-10-23, docs/TODO/cartes-clan.md) : garde de
 * l'entrée de menu `clan.heatmap-kills`, période et type de partie lus dans l'URL, période précédente de même nature,
 * moyenne des clans mise en cache. Prisma simulé : aucun accès à la base.
 */

type SqlQuery = { sql: string; values: unknown[] }

const mocks = vi.hoisted(() => ({
  clanFindUnique: vi.fn(),
  clanCount: vi.fn(),
  appConfigFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  requireNavPermission: vi.fn(),
  guard: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clan: { findUnique: mocks.clanFindUnique, count: mocks.clanCount },
    appConfig: { findUnique: mocks.appConfigFindUnique },
    $queryRaw: mocks.queryRaw,
  },
}))

vi.mock('@/middleware/auth-permission', () => ({ requireNavPermission: mocks.requireNavPermission }))

import { GET } from '../app/api/clans/[clanId]/map-stats/route'
import { resetClanMapsLeagueCache } from '@/lib/clan-map-stats-service'

const call = (query = '', clanId = '3') =>
  GET(new Request(`http://localhost/api/clans/${clanId}/map-stats${query}`), { params: Promise.resolve({ clanId }) })

const isLeague = (query: SqlQuery) => query.sql.includes('pubgClanId IS NOT NULL')
const isStars = (query: SqlQuery) => query.sql.includes('HAVING')
const dates = (query: SqlQuery) => query.values.filter((value): value is Date => value instanceof Date)

/** Agrégats du clan : 20 parties sur Erangel cette période, 10 la précédente (repérée par sa date de début). */
function clanAggregates(query: SqlQuery) {
  const [start] = dates(query)
  const previous = start !== undefined && start.getTime() < new Date(2026, 9, 1).getTime()
  if (previous) return [{ mapName: 'Baltic_Main', matches: 10n, wins: 0n, top10: 4n, placementSum: 120n, killsSum: 20n, damageSum: 2000 }]
  return [
    { mapName: 'Baltic_Main', matches: 20n, wins: 2n, top10: 12n, placementSum: 160n, killsSum: 80n, damageSum: 8000 },
    { mapName: 'Desert_Main', matches: 4n, wins: 0n, top10: 1n, placementSum: 60n, killsSum: 6n, damageSum: 500 },
  ]
}

describe('GET /api/clans/[clanId]/map-stats', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 23, 12))
    resetClanMapsLeagueCache()
    mocks.guard.mockReset().mockResolvedValue(null)
    mocks.requireNavPermission.mockReset().mockReturnValue(mocks.guard)
    mocks.clanFindUnique.mockReset().mockResolvedValue({ id: 3, name: 'Clan Démo', tag: 'DEMO' })
    mocks.clanCount.mockReset().mockResolvedValue(36)
    // Libellés réglés par le SuperUser (/settings/map-labels) : ils priment sur le dictionnaire PUBG.
    mocks.appConfigFindUnique.mockReset().mockResolvedValue({ value: JSON.stringify({ Baltic_Main: 'Erangel' }) })
    mocks.queryRaw.mockReset().mockImplementation(async (query: SqlQuery) => {
      if (isLeague(query)) return [{ mapName: 'Baltic_Main', top10Rate: 0.45, avgPlacement: 11, killsPerMatch: 3.5 }]
      if (isStars(query)) return [{ mapName: 'Baltic_Main', memberId: 7, displayName: 'Joueur Alpha', matches: 15n, killsSum: 60n }]
      return clanAggregates(query)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renvoie les cartes, le verdict et la méthode, gardée par l’entrée de menu des Cartes', async () => {
    const response = await call('?period=month&matchType=official')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.requireNavPermission).toHaveBeenCalledWith('clan.heatmap-kills')
    expect(mocks.guard).toHaveBeenCalledWith(expect.any(Request), { clanId: 3 })
    expect(body).toMatchObject({
      clan: { id: 3, name: 'Clan Démo', tag: 'DEMO' },
      period: 'month',
      matchType: 'official',
      minSample: 10,
      comparedClans: 36,
      totals: { matches: 24, maps: 2 },
    })

    const erangel = body.maps.find((row: { mapName: string }) => row.mapName === 'Baltic_Main')
    expect(erangel).toMatchObject({ mapLabel: 'Erangel', matches: 20, top10Rate: 0.6, avgPlacement: 8, killsPerMatch: 4, lowSample: false })
    expect(erangel.vsClans.top10Pts).toBeCloseTo(15)
    expect(erangel.top10TrendPts).toBeCloseTo(20)
    expect(erangel.starPlayer).toEqual({ memberId: 7, displayName: 'Joueur Alpha', matches: 15, killsPerMatch: 4 })
    expect(body.maps.find((row: { mapName: string }) => row.mapName === 'Desert_Main')).toMatchObject({ lowSample: true, top10TrendPts: null })
    expect(body.verdict.strongest).toMatchObject({ mapName: 'Baltic_Main' })
    expect(body.verdict.weakest).toBeNull()
    expect(body.verdict.mostPlayed).toMatchObject({ mapName: 'Baltic_Main', matches: 20 })
  })

  it('lit le mois civil et le mois d’avant, filtrés sur le type de partie', async () => {
    await call('?period=month&matchType=casual')

    const clanQueries = mocks.queryRaw.mock.calls.map(([query]) => query as SqlQuery).filter((query) => !isLeague(query) && !isStars(query))
    expect(clanQueries.map(dates)).toEqual([
      [new Date(2026, 9, 1), new Date(2026, 10, 1)],
      [new Date(2026, 8, 1), new Date(2026, 9, 1)],
    ])
    // « Casual » couvre aussi les parties Air Royale (leagueMatchTypeValues).
    expect(clanQueries[0].values).toEqual(expect.arrayContaining(['casual', 'airoyale']))
  })

  it('« Tous » : aucune borne de date ni période précédente', async () => {
    const body = await (await call('?period=all')).json()

    expect(body.period).toBe('all')
    const clanQueries = mocks.queryRaw.mock.calls.map(([query]) => query as SqlQuery).filter((query) => !isLeague(query) && !isStars(query))
    expect(clanQueries).toHaveLength(1)
    expect(dates(clanQueries[0])).toEqual([])
    expect(body.maps[0].top10TrendPts).toBeNull()
  })

  it('valeurs inconnues : mois et parties normales par défaut', async () => {
    const body = await (await call('?period=days-30&matchType=ranked')).json()
    expect(body).toMatchObject({ period: 'month', matchType: 'official' })
  })

  it('garde la moyenne des clans en cache cinq minutes', async () => {
    await call('?period=month')
    await call('?period=month', '4')
    const leagueQueries = mocks.queryRaw.mock.calls.filter(([query]) => isLeague(query as SqlQuery))
    expect(leagueQueries).toHaveLength(1)
    expect(mocks.clanCount).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date(2026, 9, 23, 12, 6))
    await call('?period=month')
    expect(mocks.queryRaw.mock.calls.filter(([query]) => isLeague(query as SqlQuery))).toHaveLength(2)
  })

  it('refuse un identifiant invalide, renvoie le refus de la garde, 404 pour un clan inconnu', async () => {
    expect((await call('', 'x')).status).toBe(400)

    mocks.guard.mockResolvedValueOnce(Response.json({ error: 'Accès refusé' }, { status: 403 }))
    expect((await call()).status).toBe(403)
    expect(mocks.queryRaw).not.toHaveBeenCalled()

    mocks.clanFindUnique.mockResolvedValueOnce(null)
    expect((await call()).status).toBe(404)
  })

  it('500 journalisé quand la lecture échoue', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.queryRaw.mockRejectedValue(new Error('boom'))

    const response = await call()
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Lecture des statistiques par carte impossible' })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
