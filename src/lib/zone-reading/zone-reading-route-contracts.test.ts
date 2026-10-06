import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contrats des routes de la Lecture de zone (docs/features/lecture-de-zone.md), Prisma simulé : analyse publique et en
 * cache, départ de série visiteur / membre, étapes servies une à une et notées par le serveur, classement du clan.
 */

const mocks = vi.hoisted(() => ({
  matchGroupBy: vi.fn(),
  matchFindMany: vi.fn(),
  seriesDeleteMany: vi.fn(),
  seriesCreate: vi.fn(),
  seriesFindUnique: vi.fn(),
  seriesUpdateMany: vi.fn(),
  seriesAggregate: vi.fn(),
  seriesGroupBy: vi.fn(),
  memberFindMany: vi.fn(),
  session: vi.fn(),
  locations: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    zoneReadingMatch: { groupBy: mocks.matchGroupBy, findMany: mocks.matchFindMany },
    zoneReadingSeries: {
      deleteMany: mocks.seriesDeleteMany,
      create: mocks.seriesCreate,
      findUnique: mocks.seriesFindUnique,
      updateMany: mocks.seriesUpdateMany,
      aggregate: mocks.seriesAggregate,
      groupBy: mocks.seriesGroupBy,
    },
    clanMember: { findMany: mocks.memberFindMany },
  },
}))
vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.session }))
vi.mock('@/lib/map-location-service', () => ({ getMapLocations: mocks.locations }))

import { GET as getAnalysis } from '@/app/api/zone-reading/route'
import { GET as getLeaderboard } from '@/app/api/zone-reading/leaderboard/route'
import { POST as postGuess } from '@/app/api/zone-reading/series/[seriesId]/guess/route'
import { POST as postSeries } from '@/app/api/zone-reading/series/route'
import type {
  ZoneReadingAnalysis,
  ZoneReadingGuessResult,
  ZoneReadingLeaderboard,
  ZoneReadingSeriesStart,
} from '@/lib/zone-reading/zone-reading-api'
import { resetZoneReadingCache, type ZoneReadingStoredRound } from '@/lib/zone-reading/zone-reading-service'

/** Ligne `ZoneReadingMatch` en centimètres : ligne est-ouest à y = 4 km, cinq cercles, zone finale en (4,2 ; 4,2 km). */
function matchRow(index: number) {
  return {
    squadMatchId: `sm-${index}`,
    matchDate: new Date(Date.UTC(2026, 6, 4 + (index % 60))),
    teamMode: 'squad',
    lineStartX: 0,
    lineStartY: 400000,
    lineEndX: 819200,
    lineEndY: 400000,
    circles: [
      { x: 400000, y: 460000, r: 190000 },
      { x: 400000, y: 440000, r: 100000 },
      { x: 410000, y: 430000, r: 60000 },
      { x: 415000, y: 425000, r: 38000 },
      { x: 420000, y: 420000, r: 24000 },
    ],
    finalX: 420000 + (index % 7) * 100,
    finalY: 420000,
  }
}

function storedRound(index: number): ZoneReadingStoredRound {
  return {
    squadMatchId: `sm-${index}`,
    matchDate: '2026-09-12T20:00:00.000Z',
    mode: 'squad',
    withPlane: index % 2 === 0,
    line: { start: { x: 0, y: 4000 }, end: { x: 8192, y: 4000 } },
    circles: [
      { x: 4000, y: 4600, r: 1900 },
      { x: 4000, y: 4400, r: 1000 },
      { x: 4100, y: 4300, r: 600 },
      { x: 4150, y: 4250, r: 380 },
    ],
    final: { x: 4200, y: 4200 },
    guesses: [],
  }
}

const analysis = (query = '') => getAnalysis(new Request(`http://localhost/api/zone-reading${query}`))
const startSeries = (body: unknown) =>
  postSeries(new Request('http://localhost/api/zone-reading/series', { method: 'POST', body: JSON.stringify(body) }))
const guess = (body: unknown, seriesId = 'serie-1') =>
  postGuess(new Request(`http://localhost/api/zone-reading/series/${seriesId}/guess`, { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ seriesId }),
  })

beforeEach(() => {
  resetZoneReadingCache()
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.session.mockResolvedValue(null)
  mocks.locations.mockResolvedValue({ Baltic_Main: [{ id: 'p', name: 'Pochinki', mapName: 'Baltic_Main', xPct: 51, yPct: 51, radiusPct: 4, enabled: true }] })
  mocks.matchGroupBy.mockResolvedValue([
    { mapName: 'Savage_Main', _count: { _all: 40 } },
    { mapName: 'Baltic_Main', _count: { _all: 320 } },
  ])
  mocks.matchFindMany.mockImplementation(async (args: { where: { mapName?: string; squadMatchId?: { in: string[] } } }) => {
    if (args.where.squadMatchId) return args.where.squadMatchId.in.map((id) => matchRow(Number(id.slice(3))))
    const count = args.where.mapName === 'Baltic_Main' ? 320 : 40
    return Array.from({ length: count }, (_, index) => matchRow(index))
  })
  mocks.seriesCreate.mockResolvedValue({ id: 'serie-1' })
  mocks.seriesDeleteMany.mockResolvedValue({ count: 0 })
  mocks.seriesUpdateMany.mockResolvedValue({ count: 1 })
})

describe('GET /api/zone-reading', () => {
  it('analyse de la carte la plus jouée, publique, filtrée sur les parties publiques et classées', async () => {
    const response = await analysis('?mode=duo&period=days-30')
    expect(response.status).toBe(200)
    const body = (await response.json()) as ZoneReadingAnalysis
    expect(body.mapName).toBe('Baltic_Main')
    expect(body.mapOptions.map((option) => option.mapName)).toEqual(['Baltic_Main', 'Savage_Main'])
    expect(body).toMatchObject({ mode: 'duo', period: 'days-30', ready: true, matchCount: 320, threshold: 300, mapSizeMeters: 8192 })
    expect(body.stats?.crossesFirstShare).toBe(1)
    expect(body.axes).toHaveLength(320)
    expect(body.defaultAxis).not.toBeNull()
    expect(body.cellLabels).toHaveLength(64)
    expect(body.since).toBe('2026-07-04T00:00:00.000Z')

    const where = mocks.matchGroupBy.mock.calls[0][0].where
    expect(where.teamMode).toBe('duo')
    expect(where.squadMatch).toEqual({ is: { matchType: { in: ['official', 'competitive'] } } })
    expect(where.matchDate.gte).toBeInstanceOf(Date)
  })

  it('sous le seuil : le compteur, ni chiffres ni axes', async () => {
    const body = (await (await analysis('?map=Savage_Main')).json()) as ZoneReadingAnalysis
    expect(body).toMatchObject({ mapName: 'Savage_Main', ready: false, stats: null, matchCount: 40, defaultAxis: null })
    expect(body.axes).toEqual([])
  })

  it('carte inconnue : la plus jouée ; deuxième appel servi par le cache', async () => {
    await analysis('?map=Inconnue_Main')
    const body = (await (await analysis('?map=Inconnue_Main')).json()) as ZoneReadingAnalysis
    expect(body.mapName).toBe('Baltic_Main')
    expect(mocks.matchGroupBy).toHaveBeenCalledTimes(1)
  })

  it('aucune partie : réponse vide, sans erreur', async () => {
    mocks.matchGroupBy.mockResolvedValue([])
    const body = (await (await analysis()).json()) as ZoneReadingAnalysis
    expect(body).toMatchObject({ mapName: null, mapOptions: [], ready: false })
  })
})

describe('POST /api/zone-reading/series', () => {
  it('visiteur : dix parties complètes, une sur deux sans avion, rien n’est écrit', async () => {
    const response = await startSeries({ map: 'Baltic_Main', mode: 'squad', period: 'all', clanId: 3 })
    expect(response.status).toBe(200)
    const body = (await response.json()) as ZoneReadingSeriesStart
    expect(body).toMatchObject({ seriesId: null, recorded: false, mapName: 'Baltic_Main', mapSizeMeters: 8192, source: 'clan' })
    expect(body.rounds).toHaveLength(10)
    expect(body.rounds.map((round) => round.withPlane)).toEqual([true, false, true, false, true, false, true, false, true, false])
    expect(body.rounds[1]).toHaveProperty('final')
    expect(body.rounds[0].circles).toHaveLength(4)
    expect(mocks.seriesCreate).not.toHaveBeenCalled()
    // Parties du clan d'abord : filtre sur les membres du clan.
    expect(mocks.matchFindMany.mock.calls[0][0].where.squadMatch.is.members).toEqual({ some: { member: { is: { clanId: 3 } } } })
    expect(mocks.matchFindMany.mock.calls[0][0].where.circleCount).toEqual({ gte: 5 })
  })

  it('membre : série enregistrée, seuls la ligne (une partie sur deux) et le cercle 1 sont envoyés', async () => {
    mocks.session.mockResolvedValue({ activeMemberId: 11 })
    const response = await startSeries({ map: 'Baltic_Main', mode: 'squad', period: 'days-90' })
    expect(response.status).toBe(201)
    const body = (await response.json()) as ZoneReadingSeriesStart
    expect(body).toMatchObject({ seriesId: 'serie-1', recorded: true, source: 'site' })
    expect(body.rounds[0].circles).toHaveLength(1)
    expect(body.rounds[0].line).not.toBeNull()
    expect(body.rounds[1].line).toBeNull()
    expect(body.rounds[1]).not.toHaveProperty('final')
    expect(mocks.seriesDeleteMany).toHaveBeenCalledWith({ where: { memberId: 11, status: 'started' } })
    const stored = mocks.seriesCreate.mock.calls[0][0].data
    expect(stored).toMatchObject({ memberId: 11, mapName: 'Baltic_Main', status: 'started', progress: 0 })
    expect(stored.rounds[0]).toMatchObject({ final: { y: 4200 }, guesses: [], withPlane: true })
    expect(stored.rounds[0].circles).toHaveLength(4)
  })

  it('pas assez de parties : 409 et un message', async () => {
    mocks.matchFindMany.mockResolvedValue([{ squadMatchId: 'sm-1' }])
    const response = await startSeries({ map: 'Baltic_Main' })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'not_enough_matches' })
  })

  it('carte absente : 400', async () => {
    expect((await startSeries({})).status).toBe(400)
  })
})

describe('POST /api/zone-reading/series/:id/guess', () => {
  const series = (progress: number, overrides: Record<string, unknown> = {}) => ({
    id: 'serie-1',
    memberId: 11,
    mapName: 'Baltic_Main',
    status: 'started',
    progress,
    rounds: Array.from({ length: 10 }, (_, index) => {
      const round = storedRound(index)
      const done = Math.max(0, Math.min(4, progress - index * 4))
      return { ...round, guesses: Array.from({ length: done }, () => ({ x: 4200, y: 4200 })) }
    }),
    startedAt: new Date(),
    ...overrides,
  })

  beforeEach(() => {
    mocks.session.mockResolvedValue({ activeMemberId: 11 })
  })

  it('cercle suivant après la position du cercle 1, verrou optimiste sur la progression', async () => {
    mocks.seriesFindUnique.mockResolvedValue(series(0))
    const response = await guess({ round: 0, step: 1, x: 4200, y: 4600 })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind: 'circle', round: 0, step: 2, circle: { x: 4000, y: 4400, r: 1000 } })
    const update = mocks.seriesUpdateMany.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'serie-1', status: 'started', progress: 0 })
    expect(update.data.progress).toBe(1)
    expect(update.data.rounds[0].guesses).toEqual([{ x: 4200, y: 4600 }])
  })

  it('après le cercle 4 : zone finale et écarts calculés par le serveur', async () => {
    mocks.seriesFindUnique.mockResolvedValue(series(3))
    const body = (await (await guess({ round: 0, step: 4, x: 4200, y: 4200 })).json()) as ZoneReadingGuessResult
    expect(body.kind).toBe('reveal')
    if (body.kind !== 'reveal') return
    expect(body.reveal.final).toEqual({ x: 4200, y: 4200 })
    expect(body.reveal.score.you).toBe(0)
    expect(body.finish).toBeNull()
  })

  it('dixième partie : bilan, record comparé au meilleur précédent, série terminée', async () => {
    mocks.seriesFindUnique.mockResolvedValue(series(39))
    mocks.seriesAggregate.mockResolvedValue({ _min: { meanError: 150 }, _count: { _all: 4 } })
    const body = (await (await guess({ round: 9, step: 4, x: 4200, y: 4200 })).json()) as ZoneReadingGuessResult
    if (body.kind !== 'reveal') throw new Error('révélation attendue')
    expect(body.finish).toMatchObject({ previousBest: 150, isRecord: true, seriesCount: 5 })
    expect(body.finish?.score.meanError).toBe(0)
    expect(body.finish?.score.withPlane.rounds).toBe(5)
    expect(mocks.seriesUpdateMany.mock.calls[0][0].data).toMatchObject({ status: 'finished', meanError: 0, progress: 40 })
  })

  it('refus : visiteur 401, autre joueur 403, étape inattendue 409, série terminée 409, position invalide 400', async () => {
    mocks.session.mockResolvedValue(null)
    expect((await guess({ round: 0, step: 1, x: 1, y: 1 })).status).toBe(401)

    mocks.session.mockResolvedValue({ activeMemberId: 12 })
    mocks.seriesFindUnique.mockResolvedValue(series(0))
    expect((await guess({ round: 0, step: 1, x: 1, y: 1 })).status).toBe(403)

    mocks.session.mockResolvedValue({ activeMemberId: 11 })
    const outOfOrder = await guess({ round: 0, step: 2, x: 1, y: 1 })
    expect(outOfOrder.status).toBe(409)
    expect(await outOfOrder.json()).toMatchObject({ code: 'out_of_order' })

    expect((await guess({ round: 0, step: 1, x: -5, y: 1 })).status).toBe(400)

    mocks.seriesFindUnique.mockResolvedValue(series(0, { status: 'finished' }))
    expect((await guess({ round: 0, step: 1, x: 1, y: 1 })).status).toBe(409)

    mocks.seriesFindUnique.mockResolvedValue(series(0, { startedAt: new Date(Date.now() - 3 * 60 * 60_000) }))
    expect(await (await guess({ round: 0, step: 1, x: 1, y: 1 })).json()).toMatchObject({ code: 'expired' })

    mocks.seriesFindUnique.mockResolvedValue(null)
    expect((await guess({ round: 0, step: 1, x: 1, y: 1 })).status).toBe(404)
  })

  it('deux envois simultanés de la même étape : le second reçoit 409', async () => {
    mocks.seriesFindUnique.mockResolvedValue(series(0))
    mocks.seriesUpdateMany.mockResolvedValue({ count: 0 })
    expect((await guess({ round: 0, step: 1, x: 4200, y: 4600 })).status).toBe(409)
  })
})

describe('GET /api/zone-reading/leaderboard', () => {
  it('écart moyen croissant, membres actifs du clan, ligne du lecteur', async () => {
    mocks.session.mockResolvedValue({ activeMemberId: 2 })
    mocks.seriesGroupBy.mockResolvedValue([
      { memberId: 1, _count: { _all: 3 }, _avg: { meanError: 250.04 } },
      { memberId: 2, _count: { _all: 9 }, _avg: { meanError: 214 } },
      { memberId: 3, _count: { _all: 31 }, _avg: { meanError: 162 } },
    ])
    mocks.memberFindMany.mockResolvedValue([
      { id: 1, displayName: 'Lemon' },
      { id: 2, displayName: 'Kr4ken' },
      { id: 3, displayName: 'Vexa' },
    ])
    const response = await getLeaderboard(new Request('http://localhost/api/zone-reading/leaderboard?clanId=3&map=Baltic_Main'))
    const body = (await response.json()) as ZoneReadingLeaderboard
    expect(body.rows.map((row) => [row.rank, row.displayName, row.average])).toEqual([
      [1, 'Vexa', 162],
      [2, 'Kr4ken', 214],
      [3, 'Lemon', 250],
    ])
    expect(body.viewer?.rank).toBe(2)
    expect(mocks.seriesGroupBy.mock.calls[0][0].where).toEqual({
      mapName: 'Baltic_Main',
      status: 'finished',
      meanError: { not: null },
      member: { is: { clanId: 3, isActive: true } },
    })
  })

  it('paramètres invalides : 400', async () => {
    expect((await getLeaderboard(new Request('http://localhost/api/zone-reading/leaderboard?clanId=x&map=Baltic_Main'))).status).toBe(400)
    expect((await getLeaderboard(new Request('http://localhost/api/zone-reading/leaderboard?clanId=3'))).status).toBe(400)
  })
})
