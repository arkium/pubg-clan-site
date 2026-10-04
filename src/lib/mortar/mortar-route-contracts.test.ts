import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Routes de l'entraînement au mortier (docs/features/mortier.md) : départ de série, fin de série (score recalculé à
 * partir de la graine), classement du clan. Prisma et la session sont simulés — aucun accès à la base (CLAUDE.md,
 * piège n° 9 : les tests de route vivent dans src/lib et importent les handlers depuis src/app).
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  deleteMany: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  aggregate: vi.fn(),
  updateMany: vi.fn(),
  groupBy: vi.fn(),
  memberFindMany: vi.fn(),
}))

vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSession }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mortarSeries: {
      deleteMany: mocks.deleteMany,
      create: mocks.create,
      findUnique: mocks.findUnique,
      aggregate: mocks.aggregate,
      updateMany: mocks.updateMany,
      groupBy: mocks.groupBy,
    },
    clanMember: { findMany: mocks.memberFindMany },
  },
}))

import { GET as leaderboardRoute } from '@/app/api/mortar/leaderboard/route'
import { POST as finishRoute } from '@/app/api/mortar/series/[seriesId]/finish/route'
import { POST as startRoute } from '@/app/api/mortar/series/route'
import { MORTAR_LEADERBOARD_SIZE, type MortarLeaderboard, type MortarSeriesFinish, type MortarSeriesStart } from './mortar-api'
import { MORTAR_RANGE, generateMortarTargets, requiredSetting, type MortarDifficulty } from './mortar-game'
import { MORTAR_SERIES_MAX_DURATION_MS, rankMortarResults } from './mortar-service'

const MEMBER_ID = 42
const SEED = 'a1b2c3d4e5'
const SERIES_ID = 'cmortarseries000000000001'

const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
const finish = (body: unknown, seriesId = SERIES_ID) =>
  finishRoute(post(`/api/mortar/series/${seriesId}/finish`, body), { params: Promise.resolve({ seriesId }) })
const leaderboard = (query: string) => leaderboardRoute(new Request(`http://localhost/api/mortar/leaderboard?${query}`))

/** Dix tirs à `offset` mètres de l'écart parfait (vers l'intérieur de la portée), une seconde de visée chacun. */
function shotsAt(difficulty: MortarDifficulty, offset: number, timeMs = 1000) {
  return generateMortarTargets(SEED, difficulty).map((target) => {
    const perfect = requiredSetting(target)
    return { setting: perfect + offset <= MORTAR_RANGE.max ? perfect + offset : perfect - offset, timeMs }
  })
}

function storedSeries(overrides: Record<string, unknown> = {}) {
  return {
    id: SERIES_ID,
    memberId: MEMBER_ID,
    difficulty: 'medium',
    seed: SEED,
    status: 'started',
    startedAt: new Date(Date.now() - 60_000),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSession.mockResolvedValue({ userId: 1, activeMemberId: MEMBER_ID, isSuperUser: false })
  mocks.deleteMany.mockResolvedValue({ count: 0 })
  mocks.create.mockResolvedValue({ id: SERIES_ID })
  mocks.findUnique.mockResolvedValue(storedSeries())
  mocks.aggregate.mockResolvedValue({ _min: { meanError: null }, _count: { _all: 0 } })
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.groupBy.mockResolvedValue([])
  mocks.memberFindMany.mockResolvedValue([])
})

describe('POST /api/mortar/series', () => {
  it('visiteur : graine aléatoire, série non enregistrée, aucune écriture', async () => {
    mocks.getSession.mockResolvedValue(null)
    const response = await startRoute(post('/api/mortar/series', { difficulty: 'easy' }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as MortarSeriesStart
    expect(body).toMatchObject({ seriesId: null, difficulty: 'easy', recorded: false })
    expect(body.seed).toMatch(/^[0-9a-f]{10}$/)
    expect(mocks.deleteMany).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('compte sans membre actif : traité comme un visiteur', async () => {
    mocks.getSession.mockResolvedValue({ userId: 1, activeMemberId: null, isSuperUser: false })
    const body = (await (await startRoute(post('/api/mortar/series', { difficulty: 'hard' }))).json()) as MortarSeriesStart
    expect(body.recorded).toBe(false)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('membre connecté : séries ouvertes supprimées, puis série créée avec la graine renvoyée', async () => {
    const response = await startRoute(post('/api/mortar/series', { difficulty: 'medium' }))
    expect(response.status).toBe(201)
    const body = (await response.json()) as MortarSeriesStart
    expect(body).toMatchObject({ seriesId: SERIES_ID, difficulty: 'medium', recorded: true })
    expect(body.seed).toMatch(/^[0-9a-f]{10}$/)
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { memberId: MEMBER_ID, status: 'started' } })
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ memberId: MEMBER_ID, difficulty: 'medium', seed: body.seed, status: 'started' })
    expect(mocks.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0])
  })

  it('deux départs : deux graines différentes', async () => {
    const first = (await (await startRoute(post('/api/mortar/series', { difficulty: 'easy' }))).json()) as MortarSeriesStart
    const second = (await (await startRoute(post('/api/mortar/series', { difficulty: 'easy' }))).json()) as MortarSeriesStart
    expect(first.seed).not.toBe(second.seed)
  })

  it.each([[{ difficulty: 'expert' }], [{}], ['pas du JSON']])('difficulté inconnue ou corps illisible (%j) : 400, rien d’écrit', async (body) => {
    const response = await startRoute(post('/api/mortar/series', body))
    expect(response.status).toBe(400)
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})

describe('POST /api/mortar/series/:seriesId/finish', () => {
  it('score recalculé à partir de la graine : un faux écart envoyé par le client est ignoré', async () => {
    const response = await finish({ shots: shotsAt('medium', 7), meanError: 0, hits: 10, score: { meanError: 0 } })
    expect(response.status).toBe(200)
    const body = (await response.json()) as MortarSeriesFinish
    expect(body.score.meanError).toBe(7)
    expect(body.score.hits).toBe(body.score.results.filter((result) => result.verdict === 'hit').length)
    expect(body.score.results.every((result) => Math.abs(result.error) === 7)).toBe(true)
    expect(body.score.avgTimeMs).toBe(1000)

    const update = mocks.updateMany.mock.calls[0][0]
    expect(update.where).toEqual({ id: SERIES_ID, status: 'started' })
    expect(update.data).toMatchObject({ status: 'finished', meanError: 7, hits: body.score.hits, avgTimeMs: 1000, shots: body.score.results })
    expect(update.data.finishedAt).toBeInstanceOf(Date)
  })

  it('tirs parfaits en Difficile : dénivelé compris, écart nul, dix au but', async () => {
    mocks.findUnique.mockResolvedValue(storedSeries({ difficulty: 'hard' }))
    const body = (await (await finish({ shots: shotsAt('hard', 0) })).json()) as MortarSeriesFinish
    expect(body.score).toMatchObject({ meanError: 0, hits: 10 })
  })

  it('première série : record, pas de précédent, compteur à 1', async () => {
    const body = (await (await finish({ shots: shotsAt('medium', 7) })).json()) as MortarSeriesFinish
    expect(body).toMatchObject({ previousBest: null, isRecord: true, seriesCount: 1 })
    expect(mocks.aggregate.mock.calls[0][0].where).toEqual({ memberId: MEMBER_ID, difficulty: 'medium', status: 'finished' })
  })

  it('meilleur que le record précédent : record', async () => {
    mocks.aggregate.mockResolvedValue({ _min: { meanError: 9.5 }, _count: { _all: 4 } })
    const body = (await (await finish({ shots: shotsAt('medium', 7) })).json()) as MortarSeriesFinish
    expect(body).toMatchObject({ previousBest: 9.5, isRecord: true, seriesCount: 5 })
  })

  it.each([[5], [7]])('record précédent de %s m (meilleur ou égal) : pas de record', async (previousBest) => {
    mocks.aggregate.mockResolvedValue({ _min: { meanError: previousBest }, _count: { _all: 2 } })
    const body = (await (await finish({ shots: shotsAt('medium', 7) })).json()) as MortarSeriesFinish
    expect(body).toMatchObject({ previousBest, isRecord: false, seriesCount: 3 })
  })

  it('sans session ou sans membre actif : 401, la série n’est pas lue', async () => {
    mocks.getSession.mockResolvedValue(null)
    expect((await finish({ shots: shotsAt('medium', 0) })).status).toBe(401)
    mocks.getSession.mockResolvedValue({ userId: 1, activeMemberId: null, isSuperUser: false })
    expect((await finish({ shots: shotsAt('medium', 0) })).status).toBe(401)
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  const refusals: Array<[string, Record<string, unknown> | null, number, string]> = [
    ['série inconnue', null, 404, 'not_found'],
    ['série d’un autre joueur', { memberId: 7 }, 403, 'forbidden'],
    ['série déjà terminée', { status: 'finished' }, 409, 'finished'],
    ['série commencée il y a plus de deux heures', { startedAt: new Date(Date.now() - MORTAR_SERIES_MAX_DURATION_MS - 1000) }, 409, 'expired'],
  ]
  it.each(refusals)('%s : %i, rien d’écrit', async (_label, overrides, status, code) => {
    mocks.findUnique.mockResolvedValue(overrides === null ? null : storedSeries(overrides))
    const response = await finish({ shots: shotsAt('medium', 0) })
    expect(response.status).toBe(status)
    const body = await response.json()
    expect(body.code).toBe(code)
    expect(typeof body.error).toBe('string')
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    ['neuf tirs', shotsAt('medium', 0).slice(0, 9)],
    ['réglage hors portée', shotsAt('medium', 0).map((shot, index) => (index === 3 ? { ...shot, setting: 90 } : shot))],
    ['réglage non entier', shotsAt('medium', 0).map((shot, index) => (index === 0 ? { ...shot, setting: shot.setting + 0.5 } : shot))],
    ['temps de visée trop court', shotsAt('medium', 0, 100)],
    ['tirs absents', undefined],
  ])('tirs invalides (%s) : 400, rien d’écrit', async (_label, shots) => {
    const response = await finish({ shots })
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('invalid_shots')
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('temps impossible : plus de temps de visée annoncé que de temps écoulé depuis le départ (+ 5 s)', async () => {
    mocks.findUnique.mockResolvedValue(storedSeries({ startedAt: new Date(Date.now() - 3_000) }))
    const response = await finish({ shots: shotsAt('medium', 0, 1000) }) // 10 s annoncées pour 3 s écoulées
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('implausible_time')
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('temps juste plausible : dans la tolérance de 5 s', async () => {
    mocks.findUnique.mockResolvedValue(storedSeries({ startedAt: new Date(Date.now() - 6_000) }))
    expect((await finish({ shots: shotsAt('medium', 0, 1000) })).status).toBe(200)
  })

  it('deux envois simultanés : le second, qui ne trouve plus la série ouverte, reçoit 409', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 })
    const response = await finish({ shots: shotsAt('medium', 0) })
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('finished')
  })

  it('corps illisible : 400', async () => {
    expect((await finish('pas du JSON')).status).toBe(400)
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })
})

describe('GET /api/mortar/leaderboard', () => {
  /** Douze artilleurs : le n° i a pour meilleur écart i m ; le lecteur (MEMBER_ID) est le dernier. */
  function twelveGunners() {
    const ids = [...Array.from({ length: 11 }, (_, index) => 100 + index), MEMBER_ID]
    mocks.groupBy.mockResolvedValue(
      ids.map((memberId, index) => ({ memberId, _count: { _all: 2 }, _min: { meanError: index + 1 } })).reverse()
    )
    mocks.memberFindMany.mockResolvedValue(ids.map((id) => ({ id, displayName: id === MEMBER_ID ? 'Moi' : `Joueur ${id}` })))
  }

  it('trié par meilleur écart, dix premiers, ligne du lecteur même hors top 10', async () => {
    twelveGunners()
    const response = await leaderboard('clanId=3&difficulty=medium')
    expect(response.status).toBe(200)
    const body = (await response.json()) as MortarLeaderboard
    expect(body).toMatchObject({ clanId: 3, difficulty: 'medium' })
    expect(body.rows).toHaveLength(MORTAR_LEADERBOARD_SIZE)
    expect(body.rows.map((row) => row.rank)).toEqual(Array.from({ length: 10 }, (_, index) => index + 1))
    expect(body.rows.map((row) => row.best)).toEqual(Array.from({ length: 10 }, (_, index) => index + 1))
    expect(body.rows[0]).toEqual({ rank: 1, memberId: 100, displayName: 'Joueur 100', series: 2, best: 1 })
    expect(body.viewer).toEqual({ rank: 12, memberId: MEMBER_ID, displayName: 'Moi', series: 2, best: 12 })
  })

  it('requête groupée : séries terminées des membres actifs du clan, à cette difficulté', async () => {
    twelveGunners()
    await leaderboard('clanId=3&difficulty=hard')
    expect(mocks.groupBy).toHaveBeenCalledTimes(1)
    const query = mocks.groupBy.mock.calls[0][0]
    expect(query.by).toEqual(['memberId'])
    expect(query.where).toMatchObject({ difficulty: 'hard', status: 'finished', member: { is: { clanId: 3, isActive: true } } })
    expect(mocks.memberFindMany).toHaveBeenCalledTimes(1)
  })

  it('visiteur : classement lu, `viewer` à null', async () => {
    twelveGunners()
    mocks.getSession.mockResolvedValue(null)
    const body = (await (await leaderboard('clanId=3&difficulty=medium')).json()) as MortarLeaderboard
    expect(body.rows).toHaveLength(10)
    expect(body.viewer).toBeNull()
  })

  it('lecteur sans série : `viewer` à null ; personne n’a joué : classement vide sans lire les membres', async () => {
    mocks.getSession.mockResolvedValue({ userId: 1, activeMemberId: 999, isSuperUser: false })
    const body = (await (await leaderboard('clanId=3&difficulty=easy')).json()) as MortarLeaderboard
    expect(body).toEqual({ clanId: 3, difficulty: 'easy', rows: [], viewer: null })
    expect(mocks.memberFindMany).not.toHaveBeenCalled()
  })

  it.each(['difficulty=medium', 'clanId=abc&difficulty=medium', 'clanId=0&difficulty=medium', 'clanId=-2&difficulty=medium', 'clanId=1.5&difficulty=medium', 'clanId=3', 'clanId=3&difficulty=expert'])(
    'paramètres invalides (%s) : 400',
    async (query) => {
      expect((await leaderboard(query)).status).toBe(400)
      expect(mocks.groupBy).not.toHaveBeenCalled()
    }
  )
})

describe('rankMortarResults', () => {
  it('ex æquo sur l’écart : plus de séries d’abord, puis le nom', () => {
    const rows = rankMortarResults([
      { memberId: 1, displayName: 'Zoé', series: 3, best: 4.2 },
      { memberId: 2, displayName: 'Bob', series: 1, best: 4.2 },
      { memberId: 3, displayName: 'alice', series: 1, best: 4.2 },
      { memberId: 4, displayName: 'Max', series: 9, best: 6 },
      { memberId: 5, displayName: 'Léa', series: 1, best: 2.1 },
    ])
    expect(rows.map((row) => [row.rank, row.displayName])).toEqual([
      [1, 'Léa'],
      [2, 'Zoé'],
      [3, 'alice'],
      [4, 'Bob'],
      [5, 'Max'],
    ])
  })
})
