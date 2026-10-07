import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Routes de la Carte des ressources (docs/features/carte-ressources.md) : lecture, zones de drop, propositions,
 * annulation, « Toujours là », signalements, file SuperUser, décisions, cartes, historique et annulation.
 *
 * Prisma est remplacé par une base en mémoire (`resource-test-db.ts`) et la session par un mock — aucun accès à la
 * base (CLAUDE.md, piège n° 9 : les tests de route vivent dans src/lib et importent les handlers depuis src/app).
 */

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), navGuard: vi.fn() }))

vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSession }))
vi.mock('@/middleware/auth-permission', () => ({ requireNavPermission: () => mocks.navGuard }))
vi.mock('@/lib/prisma', async () => {
  const { resourceTestDb } = await import('./resource-test-db')
  // Journal des actions d'administration (docs/TODO/administration.md Q10) : hors du sujet de ces contrats, absorbé.
  return { prisma: { ...resourceTestDb.client, adminActionLog: { create: async () => ({}) } } }
})

import { POST as decisionsRoute } from '@/app/api/resources/admin/decisions/route'
import { POST as undoRoute } from '@/app/api/resources/admin/history/[actionId]/undo/route'
import { GET as historyRoute } from '@/app/api/resources/admin/history/route'
import { POST as mapActionRoute } from '@/app/api/resources/admin/maps/[map]/route'
import { GET as queueRoute } from '@/app/api/resources/admin/queue/route'
import { GET as dropZonesRoute } from '@/app/api/resources/drop-zones/route'
import { POST as cancelRoute } from '@/app/api/resources/points/[pointId]/cancel/route'
import { POST as confirmRoute } from '@/app/api/resources/points/[pointId]/confirm/route'
import { POST as reportRoute } from '@/app/api/resources/points/[pointId]/reports/route'
import { POST as proposeRoute } from '@/app/api/resources/points/route'
import { GET as mapRoute } from '@/app/api/resources/route'
import {
  RESOURCE_HISTORY_PAGE_SIZE,
  type ResourceDecisionInput,
  type ResourceDecisionsResponse,
  type ResourceDropZonesResponse,
  type ResourceHistoryResponse,
  type ResourceMapResponse,
  type ResourceMapSummary,
  type ResourcePointView,
  type ResourceProposalResponse,
  type ResourceQueueResponse,
  type ResourceReportResponse,
} from './resource-api'
import type { StoredActionAfter } from './resource-history'
import { RESOURCE_MAPS } from './resource-map'
import { RESOURCE_MAX_PENDING_PER_USER } from './resource-service'
import { requestedByGroup, parseQueueItemId } from './resource-service-admin'
import { resourceTestDb as db } from './resource-test-db'

type Session = { sessionId: string; userId: number; email: string; activeMemberId: number | null; isSuperUser: boolean }
type Row = Record<string, unknown>
type ErrorBody = { error: string; code: string }

const ADMIN: Session = { sessionId: 's1', userId: 1, email: 'paulo@example.com', activeMemberId: null, isSuperUser: true }
const VEXA: Session = { sessionId: 's10', userId: 10, email: 'vexa@example.com', activeMemberId: 100, isSuperUser: false }
const LEMON: Session = { sessionId: 's11', userId: 11, email: 'lemon@example.com', activeMemberId: 111, isSuperUser: false }
const NYX: Session = { sessionId: 's12', userId: 12, email: 'nyx@example.com', activeMemberId: null, isSuperUser: false }

let session: Session | null = null

const DAY = 86_400_000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY)

const get = (url: string) => new Request(`http://localhost${url}`)
const post = (url: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
const params = <T>(value: T) => ({ params: Promise.resolve(value) })
async function call<T>(response: Response | Promise<Response>) {
  const resolved = await response
  return { status: resolved.status, body: (await resolved.json()) as T }
}

const readMap = (map = 'Baltic_Main') => call<ResourceMapResponse>(mapRoute(get(`/api/resources?map=${map}`)))
const dropZones = (query: string) => call<ResourceDropZonesResponse>(dropZonesRoute(get(`/api/resources/drop-zones?${query}`)))
const propose = (body: unknown) => call<ResourceProposalResponse>(proposeRoute(post('/api/resources/points', body)))
const cancel = (pointId: string) => call<{ ok: true }>(cancelRoute(post(`/api/resources/points/${pointId}/cancel`), params({ pointId })))
const confirm = (pointId: string) => call<{ point: ResourcePointView }>(confirmRoute(post(`/api/resources/points/${pointId}/confirm`), params({ pointId })))
const report = (pointId: string, body: unknown) => call<ResourceReportResponse>(reportRoute(post(`/api/resources/points/${pointId}/reports`, body), params({ pointId })))
const queue = () => call<ResourceQueueResponse>(queueRoute(get('/api/resources/admin/queue')))
const decide = (decisions: Array<Partial<ResourceDecisionInput> | Row>) => call<ResourceDecisionsResponse>(decisionsRoute(post('/api/resources/admin/decisions', { decisions })))
const mapAction = (map: string, action: unknown) => call<{ map: ResourceMapSummary }>(mapActionRoute(post(`/api/resources/admin/maps/${map}`, { action }), params({ map })))
const history = (page?: number | string) => call<ResourceHistoryResponse>(historyRoute(get(`/api/resources/admin/history${page === undefined ? '' : `?page=${page}`}`)))
const undo = (actionId: string) => call<{ ok: true }>(undoRoute(post(`/api/resources/admin/history/${actionId}/undo`), params({ actionId })))

/** Point validé par Paulo, proposé par Vexa : station-service en F-L (Erangel). */
const addPoint = (data: Row = {}) =>
  db.insert('resourcePoint', {
    mapName: 'Baltic_Main',
    kind: 'fuel',
    x: 5500,
    y: 3500,
    status: 'validated',
    createdByUserId: 10,
    validatedByUserId: 1,
    validatedAt: daysAgo(10),
    lastConfirmedAt: daysAgo(10),
    createdAt: daysAgo(12),
    ...data,
  })
const addReport = (pointId: unknown, data: Row = {}) => db.insert('resourceReport', { pointId, kind: 'missing', userId: 11, status: 'pending', ...data })
const pointRow = (id: unknown) => db.find('resourcePoint', { id })
const reportRow = (id: unknown) => db.find('resourceReport', { id })
const actions = () => db.rows('resourceAction')

beforeEach(() => {
  vi.clearAllMocks()
  db.reset()
  session = null
  mocks.getSession.mockImplementation(async () => session)
  mocks.navGuard.mockResolvedValue(null)
  db.insert('userAccount', { id: 1, email: 'paulo@example.com', displayName: 'Paulo', isSuperUser: true })
  db.insert('userAccount', { id: 10, email: 'vexa@example.com', displayName: 'Vexa' })
  // Lemon : pas de pseudo de compte, nom repris du membre lié.
  db.insert('userAccount', { id: 11, email: 'lemon@example.com', displayName: null })
  db.insert('clanMember', { id: 111, displayName: 'Lemon', clanId: 7 })
  db.insert('memberIdentity', { id: 1, userId: 11, memberId: 111, isPrimary: true })
  // Nyx : ni pseudo ni membre lié → « Joueur », jamais l'e-mail.
  db.insert('userAccount', { id: 12, email: 'nyx@example.com', displayName: '   ' })
})

afterEach(() => {
  vi.useRealTimers()
})

// --- Lecture ---------------------------------------------------------------------------------------------------------

describe('GET /api/resources', () => {
  it.each([['map=Range_Main'], ['']])('carte inconnue ou absente (%s) : 400 unknown_map', async (query) => {
    const response = await call<ErrorBody>(mapRoute(get(`/api/resources?${query}`)))
    expect(response.status).toBe(400)
    expect(response.body.code).toBe('unknown_map')
  })

  it('tables vides : réponse vide cohérente, rien d’écrit', async () => {
    const { status, body } = await readMap('Savage_Main')
    expect(status).toBe(200)
    expect(body).toEqual({
      map: { key: 'Savage_Main', label: 'Sanhok', sizeMeters: 4096 },
      state: { verifiedAt: null, recheckSince: null, toConfirm: 0 },
      points: [],
      observed: { analysedMatches: 0, windowDays: 90, computedAt: null, spots: [] },
      counts: { observed: { car: 0, moto: 0, boat: 0, glider: 0, land: 0 }, points: { fuel: 0, garage: 0, dock: 0, secret_room: 0 } },
      viewer: { signedIn: false, isSuperUser: false, validatedCount: 0, queueCount: null },
    })
    expect(db.writes).toEqual([])
  })

  function seedVisibility() {
    const validated = addPoint({ comment: 'Pompe à l’arrière' })
    const vexaPending = addPoint({ status: 'pending', kind: 'garage', x: 1200, y: 1300, validatedByUserId: null, validatedAt: null, lastConfirmedAt: null, comment: 'Grand garage' })
    const lemonPending = addPoint({ status: 'pending', kind: 'dock', x: 2200, y: 6300, createdByUserId: 11, validatedByUserId: null, validatedAt: null, lastConfirmedAt: null })
    addPoint({ status: 'rejected', x: 100, y: 100 })
    addPoint({ status: 'removed', x: 200, y: 200 })
    addPoint({ mapName: 'Desert_Main' })
    return { validated, vexaPending, lemonPending }
  }

  it('visiteur : points validés seulement, sans commentaire ni e-mail ; auteur nommé avec ses points validés', async () => {
    const { validated } = seedVisibility()
    const { body } = await readMap()
    expect(body.points.map((point) => point.id)).toEqual([validated.id])
    expect(body.points[0]).toMatchObject({
      kind: 'fuel',
      x: 5500,
      y: 3500,
      grid: 'F-L',
      state: 'validated',
      mine: false,
      createdBy: { name: 'Vexa', validatedCount: 2 },
      validatedBy: 'Paulo',
      comment: null,
      reportedByMe: false,
      confirmedByMe: false,
    })
    expect(body.counts.points).toEqual({ fuel: 1, garage: 0, dock: 0, secret_room: 0 })
    expect(body.viewer).toEqual({ signedIn: false, isSuperUser: false, validatedCount: 0, queueCount: null })
    expect(JSON.stringify(body)).not.toContain('@')
  })

  it('joueur connecté : ses propositions en attente (avec commentaire), pas celles des autres', async () => {
    const { validated, vexaPending } = seedVisibility()
    session = VEXA
    const { body } = await readMap()
    expect(body.points.map((point) => point.id)).toEqual([validated.id, vexaPending.id])
    const pending = body.points.find((point) => point.id === vexaPending.id)!
    expect(pending).toMatchObject({ state: 'pending', mine: true, comment: 'Grand garage', validatedBy: null, validatedAt: null })
    expect(body.points[0]).toMatchObject({ mine: true, comment: 'Pompe à l’arrière' })
    expect(body.counts.points).toEqual({ fuel: 1, garage: 0, dock: 0, secret_room: 0 })
    expect(body.viewer).toEqual({ signedIn: true, isSuperUser: false, validatedCount: 2, queueCount: null })

    session = LEMON
    const lemon = await readMap()
    expect(lemon.body.points.find((point) => point.id === validated.id)?.comment).toBeNull()
    expect(lemon.body.points.some((point) => point.id === vexaPending.id)).toBe(false)
  })

  it('SuperUser : toutes les propositions en attente avec leur commentaire, et la taille de la file', async () => {
    const { vexaPending, lemonPending } = seedVisibility()
    session = ADMIN
    const { body } = await readMap()
    expect(body.points).toHaveLength(3)
    expect(body.points.find((point) => point.id === lemonPending.id)).toMatchObject({ state: 'pending', mine: false, createdBy: { name: 'Lemon' } })
    expect(body.points.find((point) => point.id === vexaPending.id)?.comment).toBe('Grand garage')
    expect(body.viewer).toMatchObject({ signedIn: true, isSuperUser: true, queueCount: 2 })
    expect(JSON.stringify(body)).not.toContain('@')
  })

  it('nom affiché : pseudo du compte, sinon membre lié, sinon « Joueur » — jamais l’e-mail', async () => {
    addPoint({ createdByUserId: 10, x: 1000, y: 1000 })
    addPoint({ createdByUserId: 11, x: 2000, y: 2000 })
    addPoint({ createdByUserId: 12, x: 3000, y: 3000 })
    addPoint({ createdByUserId: null, x: 4000, y: 4000 })
    const { body } = await readMap()
    expect(body.points.map((point) => point.createdBy?.name ?? null)).toEqual(['Vexa', 'Lemon', 'Joueur', null])
    expect(JSON.stringify(body)).not.toMatch(/example\.com/)
  })

  it('carte à revérifier : « à confirmer » tant que personne n’a confirmé depuis ; confirmedByMe suit la même fenêtre', async () => {
    db.insert('resourceMapState', { mapName: 'Baltic_Main', recheckSince: daysAgo(2), verifiedAt: daysAgo(20) })
    const stale = addPoint({ lastConfirmedAt: daysAgo(5) })
    const fresh = addPoint({ x: 1500, y: 1500, lastConfirmedAt: daysAgo(1) })
    db.insert('resourceConfirmation', { pointId: stale.id, userId: 10, createdAt: daysAgo(5) })
    db.insert('resourceConfirmation', { pointId: fresh.id, userId: 10, createdAt: daysAgo(1) })
    addReport(fresh.id, { userId: 10 })
    session = VEXA
    const { body } = await readMap()
    expect(body.state).toMatchObject({ toConfirm: 1, recheckSince: expect.any(String), verifiedAt: expect.any(String) })
    const byId = new Map(body.points.map((point) => [point.id, point]))
    expect(byId.get(stale.id as string)).toMatchObject({ state: 'to_confirm', confirmedByMe: false, reportedByMe: false })
    expect(byId.get(fresh.id as string)).toMatchObject({ state: 'validated', confirmedByMe: true, reportedByMe: true })
    expect(body.counts.points.fuel).toBe(2)
  })

  it('véhicules observés : seuls les emplacements au-dessus des seuils, avec part, repère et compte par famille', async () => {
    const computedAt = daysAgo(0.2)
    db.insert('resourceVehicleMapStat', { mapName: 'Baltic_Main', analysedMatches: 40, windowDays: 90, computedAt })
    db.insert('resourceVehicleSpot', { mapName: 'Baltic_Main', family: 'car', x: 3500, y: 4200, observations: 30, matches: 25, computedAt })
    db.insert('resourceVehicleSpot', { mapName: 'Baltic_Main', family: 'boat', x: 1200, y: 6100, observations: 4, matches: 3, computedAt })
    db.insert('resourceVehicleSpot', { mapName: 'Baltic_Main', family: 'moto', x: 2000, y: 2000, observations: 2, matches: 2, computedAt })
    db.insert('resourceVehicleSpot', { mapName: 'Baltic_Main', family: 'unknown', x: 2000, y: 2000, observations: 20, matches: 20, computedAt })
    db.insert('resourceVehicleSpot', { mapName: 'Desert_Main', family: 'car', x: 2000, y: 2000, observations: 20, matches: 20, computedAt })
    const { body } = await readMap()
    expect(body.observed).toEqual({
      analysedMatches: 40,
      windowDays: 90,
      computedAt: computedAt.toISOString(),
      spots: [
        { family: 'car', x: 3500, y: 4200, grid: 'D-M', share: 25 / 40, observations: 30, matches: 25 },
        { family: 'boat', x: 1200, y: 6100, grid: 'B-O', share: 3 / 40, observations: 4, matches: 3 },
      ],
    })
    expect(body.counts.observed).toEqual({ car: 1, moto: 0, boat: 1, glider: 0, land: 0 })
  })
})

// --- Zones de drop ---------------------------------------------------------------------------------------------------

describe('GET /api/resources/drop-zones', () => {
  const landing = (memberId: number, x: number, y: number, data: Row = {}) =>
    db.insert('dropPressureStat', { squadMatchId: `m${x}${y}`, memberId, mapName: 'Baltic_Main', x, y, matchDate: daysAgo(3), ...data })

  beforeEach(() => {
    db.insert('clanMember', { id: 100, displayName: 'Vexa', clanId: 7 })
    db.insert('clanMember', { id: 200, displayName: 'Rival', clanId: 8 })
  })

  it('trois zones les plus fréquentes du clan sur la carte, centre moyen en mètres', async () => {
    // Pochinki ×3, Georgopol ×2, Rozhok et Zharki ×1 (Rozhok avant Zharki par ordre alphabétique).
    landing(100, 368640, 405504)
    landing(100, 378640, 405504)
    landing(111, 358640, 405504)
    landing(100, 184320, 253952)
    landing(111, 184320, 253952)
    landing(100, 401408, 286720)
    landing(100, 110592, 126976)
    // Ignorés : hors de toute ville, autre clan, autre carte, trop ancien.
    landing(100, 10000, 810000)
    landing(200, 368640, 405504)
    landing(200, 368640, 405504)
    landing(100, 368640, 405504, { mapName: 'Desert_Main' })
    landing(100, 184320, 253952, { matchDate: daysAgo(120) })
    landing(100, 184320, 253952, { matchDate: daysAgo(100) })

    const { status, body } = await dropZones('clanId=7&map=Baltic_Main')
    expect(status).toBe(200)
    expect(body).toEqual({
      clanId: 7,
      map: 'Baltic_Main',
      centers: [
        { name: 'Pochinki', x: 3686, y: 4055, landings: 3 },
        { name: 'Georgopol', x: 1843, y: 2540, landings: 2 },
        { name: 'Rozhok', x: 4014, y: 2867, landings: 1 },
      ],
      radiusMeters: 800,
    })
    expect(db.writes).toEqual([])
  })

  it('aucun atterrissage : liste vide', async () => {
    const { body } = await dropZones('clanId=7&map=Tiger_Main')
    expect(body.centers).toEqual([])
  })

  it.each([['clanId=0&map=Baltic_Main', 'invalid_clan'], ['clanId=abc&map=Baltic_Main', 'invalid_clan'], ['clanId=7&map=Range_Main', 'unknown_map']])(
    'paramètres invalides (%s) : 400 %s',
    async (query, code) => {
      const { status, body } = await call<ErrorBody>(dropZonesRoute(get(`/api/resources/drop-zones?${query}`)))
      expect(status).toBe(400)
      expect(body.code).toBe(code)
    }
  )

  it('même accès que la page « Zones de drop » : la réponse de la garde est renvoyée telle quelle', async () => {
    mocks.navGuard.mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    const { status } = await call<ErrorBody>(dropZonesRoute(get('/api/resources/drop-zones?clanId=7&map=Baltic_Main')))
    expect(status).toBe(401)
    expect(mocks.navGuard).toHaveBeenCalledWith(expect.any(Request), { clanId: 7 })
  })
})

// --- Propositions ----------------------------------------------------------------------------------------------------

describe('POST /api/resources/points', () => {
  const valid = { map: 'Baltic_Main', kind: 'garage', x: 3456.789, y: 4321.04, comment: '  Sous le pont  ' }

  it('visiteur : 401, rien d’écrit', async () => {
    const { status, body } = await propose(valid)
    expect(status).toBe(401)
    expect(body).toMatchObject({ code: 'unauthorized' })
    expect(db.writes).toEqual([])
  })

  it('proposition en attente : position au dixième, commentaire nettoyé, vue de l’auteur', async () => {
    session = VEXA
    addPoint() // déjà validé : compte dans « points validés »
    const { status, body } = await propose(valid)
    expect(status).toBe(201)
    expect(body.validatedCount).toBe(1)
    expect(body.point).toMatchObject({ kind: 'garage', x: 3456.8, y: 4321, grid: 'D-M', state: 'pending', mine: true, comment: 'Sous le pont', createdBy: { name: 'Vexa', validatedCount: 1 } })
    expect(pointRow(body.point.id)).toMatchObject({ status: 'pending', createdByUserId: 10, mapName: 'Baltic_Main', comment: 'Sous le pont' })
  })

  it.each([
    [{ ...valid, map: 'Range_Main' }, 'unknown_map'],
    [{ ...valid, kind: 'armory' }, 'invalid_kind'],
    [{ ...valid, x: -1 }, 'outside_map'],
    [{ ...valid, map: 'Savage_Main', x: 5000 }, 'outside_map'],
    [{ ...valid, y: '12' }, 'outside_map'],
    [{ ...valid, comment: 'x'.repeat(281) }, 'comment_too_long'],
    [{ ...valid, comment: 42 }, 'invalid_body'],
    ['pas du JSON', 'invalid_body'],
  ])('refus %#: 400 %s', async (body, code) => {
    session = VEXA
    const response = await call<ErrorBody>(proposeRoute(post('/api/resources/points', body)))
    expect(response.status).toBe(400)
    expect(response.body.code).toBe(code)
    expect(db.rows('resourcePoint')).toHaveLength(0)
  })

  it('doublon flagrant : même type, validé ou en attente, à moins de 25 m → 409', async () => {
    session = LEMON
    const existing = addPoint({ kind: 'garage', x: 3470, y: 4330 })
    expect(await propose(valid)).toMatchObject({ status: 409, body: { code: 'duplicate' } })
    // Proposition d'un autre joueur, invisible pour Lemon mais déjà en attente.
    existing.status = 'pending'
    expect(await propose(valid)).toMatchObject({ status: 409, body: { code: 'duplicate' } })
    expect(db.rows('resourcePoint')).toHaveLength(1)
  })

  it('pas un doublon : autre type, à plus de 25 m, ou point refusé / retiré', async () => {
    session = LEMON
    addPoint({ kind: 'fuel', x: 3456, y: 4321 })
    addPoint({ kind: 'garage', x: 3456 + 26, y: 4321 })
    addPoint({ kind: 'garage', x: 3456, y: 4321, status: 'rejected' })
    addPoint({ kind: 'garage', x: 3456, y: 4321, status: 'removed' })
    addPoint({ kind: 'garage', x: 3456, y: 4321, mapName: 'Desert_Main' })
    expect((await propose(valid)).status).toBe(201)
  })

  it(`limite : ${RESOURCE_MAX_PENDING_PER_USER} propositions en attente par joueur → 429`, async () => {
    session = VEXA
    for (let index = 0; index < RESOURCE_MAX_PENDING_PER_USER; index += 1) {
      addPoint({ status: 'pending', kind: 'dock', x: 100 + index * 100, y: 7000 })
    }
    const { status, body } = await propose(valid)
    expect(status).toBe(429)
    expect(body).toMatchObject({ code: 'too_many_pending' })
    session = LEMON
    expect((await propose(valid)).status).toBe(201)
  })
})

describe('POST /api/resources/points/:id/cancel', () => {
  it('l’auteur retire sa proposition en attente : ligne supprimée', async () => {
    const pending = addPoint({ status: 'pending', validatedByUserId: null, validatedAt: null })
    session = VEXA
    const { status, body } = await cancel(pending.id as string)
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(pointRow(pending.id)).toBeNull()
  })

  it('autre joueur 403, point déjà traité 409, inconnu 404, visiteur 401', async () => {
    const pending = addPoint({ status: 'pending' })
    const validated = addPoint({ x: 100, y: 100 })
    session = LEMON
    expect(await cancel(pending.id as string)).toMatchObject({ status: 403, body: { code: 'forbidden' } })
    session = VEXA
    expect(await cancel(validated.id as string)).toMatchObject({ status: 409, body: { code: 'not_pending' } })
    expect(await cancel('cinconnu')).toMatchObject({ status: 404, body: { code: 'not_found' } })
    session = null
    expect(await cancel(pending.id as string)).toMatchObject({ status: 401 })
    expect(pointRow(pending.id)).not.toBeNull()
  })
})

describe('POST /api/resources/points/:id/confirm', () => {
  it('« Toujours là » : date et compteur mis à jour, une seule fois par joueur (idempotent)', async () => {
    const point = addPoint({ confirmationCount: 4 })
    session = LEMON
    const first = await confirm(point.id as string)
    expect(first.status).toBe(200)
    expect(first.body.point).toMatchObject({ id: point.id, confirmations: 5, confirmedByMe: true, state: 'validated' })
    const confirmedAt = pointRow(point.id)?.lastConfirmedAt as Date
    expect(Date.now() - confirmedAt.getTime()).toBeLessThan(5_000)

    const second = await confirm(point.id as string)
    expect(second.body.point.confirmations).toBe(5)
    expect(db.rows('resourceConfirmation')).toHaveLength(1)
  })

  it('après une demande de revérification, une confirmation ancienne ne compte plus : le point repasse « validé »', async () => {
    db.insert('resourceMapState', { mapName: 'Baltic_Main', recheckSince: daysAgo(1) })
    const point = addPoint({ lastConfirmedAt: daysAgo(3) })
    db.insert('resourceConfirmation', { pointId: point.id, userId: 11, createdAt: daysAgo(3) })
    session = LEMON
    expect((await readMap()).body.points[0]).toMatchObject({ state: 'to_confirm', confirmedByMe: false })
    const { body } = await confirm(point.id as string)
    expect(body.point).toMatchObject({ state: 'validated', confirmedByMe: true, confirmations: 1 })
    expect(db.rows('resourceConfirmation')).toHaveLength(2)
  })

  it('point en attente 409, refusé ou inconnu 404, visiteur 401', async () => {
    const pending = addPoint({ status: 'pending' })
    const rejected = addPoint({ status: 'rejected', x: 10, y: 10 })
    session = LEMON
    expect(await confirm(pending.id as string)).toMatchObject({ status: 409, body: { code: 'not_validated' } })
    expect(await confirm(rejected.id as string)).toMatchObject({ status: 404 })
    expect(await confirm('cinconnu')).toMatchObject({ status: 404 })
    session = null
    expect((await confirm(pending.id as string)).status).toBe(401)
    expect(db.rows('resourceConfirmation')).toHaveLength(0)
  })
})

describe('POST /api/resources/points/:id/reports', () => {
  it('« N’existe plus » : rien d’autre n’est gardé ; renvoie les points validés du joueur', async () => {
    const point = addPoint()
    addPoint({ createdByUserId: 11, x: 100, y: 100 })
    session = LEMON
    const { status, body } = await report(point.id as string, { kind: 'missing', x: 10, y: 10, proposedKind: 'dock', comment: ' Rasé ' })
    expect(status).toBe(201)
    expect(body).toEqual({ ok: true, validatedCount: 1 })
    expect(db.rows('resourceReport')[0]).toMatchObject({ kind: 'missing', proposedX: null, proposedY: null, proposedKind: null, comment: 'Rasé', userId: 11, status: 'pending' })
  })

  it('« Mal placé » : position requise, dans la carte, à plus de 15 m de l’actuelle', async () => {
    const point = addPoint()
    session = LEMON
    expect(await report(point.id as string, { kind: 'misplaced' })).toMatchObject({ status: 400, body: { code: 'outside_map' } })
    expect(await report(point.id as string, { kind: 'misplaced', x: 9000, y: 3500 })).toMatchObject({ status: 400, body: { code: 'outside_map' } })
    expect(await report(point.id as string, { kind: 'misplaced', x: 5510, y: 3510 })).toMatchObject({ status: 400, body: { code: 'invalid_report' } })
    expect((await report(point.id as string, { kind: 'misplaced', x: 5540, y: 3500 })).status).toBe(201)
    expect(db.rows('resourceReport')[0]).toMatchObject({ kind: 'misplaced', proposedX: 5540, proposedY: 3500 })
  })

  it('« Mauvais type » : type proposé valide et différent', async () => {
    const point = addPoint({ kind: 'garage' })
    session = LEMON
    expect(await report(point.id as string, { kind: 'wrong_kind', proposedKind: 'garage' })).toMatchObject({ status: 400, body: { code: 'invalid_report' } })
    expect(await report(point.id as string, { kind: 'wrong_kind', proposedKind: 'bunker' })).toMatchObject({ status: 400, body: { code: 'invalid_kind' } })
    expect((await report(point.id as string, { kind: 'wrong_kind', proposedKind: 'fuel' })).status).toBe(201)
    expect(db.rows('resourceReport')[0]).toMatchObject({ kind: 'wrong_kind', proposedKind: 'fuel' })
  })

  it('un seul signalement en attente par joueur et par point (409), les autres joueurs restent libres', async () => {
    const point = addPoint()
    session = LEMON
    expect((await report(point.id as string, { kind: 'missing' })).status).toBe(201)
    expect(await report(point.id as string, { kind: 'wrong_kind', proposedKind: 'dock' })).toMatchObject({ status: 409, body: { code: 'already_reported' } })
    session = NYX
    expect((await report(point.id as string, { kind: 'missing' })).status).toBe(201)
  })

  it('motif inconnu 400, point en attente 409, inconnu 404, visiteur 401, commentaire trop long 400', async () => {
    const point = addPoint()
    const pending = addPoint({ status: 'pending', x: 10, y: 10 })
    session = LEMON
    expect(await report(point.id as string, { kind: 'burnt' })).toMatchObject({ status: 400, body: { code: 'invalid_report' } })
    expect(await report(point.id as string, { kind: 'missing', comment: 'x'.repeat(281) })).toMatchObject({ status: 400, body: { code: 'comment_too_long' } })
    expect(await report(pending.id as string, { kind: 'missing' })).toMatchObject({ status: 409, body: { code: 'not_validated' } })
    expect((await report('cinconnu', { kind: 'missing' })).status).toBe(404)
    session = null
    expect((await report(point.id as string, { kind: 'missing' })).status).toBe(401)
    expect(db.rows('resourceReport')).toHaveLength(0)
  })
})

// --- SuperUser : droits ----------------------------------------------------------------------------------------------

describe('routes SuperUser : 401 sans session, 403 sans droit', () => {
  const routes: Array<[string, () => Promise<{ status: number; body: unknown }>]> = [
    ['queue', () => queue()],
    ['decisions', () => decide([{ itemId: 'point:x', decision: 'validate' }])],
    ['maps', () => mapAction('Baltic_Main', 'recheck')],
    ['history', () => history()],
    ['undo', () => undo('caction')],
  ]

  it.each(routes)('%s', async (_name, run) => {
    session = null
    expect((await run()).status).toBe(401)
    session = VEXA
    const forbidden = await run()
    expect(forbidden.status).toBe(403)
    expect(forbidden.body).toMatchObject({ code: 'forbidden' })
    expect(db.writes).toEqual([])
  })
})

// --- File ------------------------------------------------------------------------------------------------------------

describe('GET /api/resources/admin/queue', () => {
  it('propositions et signalements regroupés, toutes cartes, du plus ancien au plus récent', async () => {
    session = ADMIN
    // Lemon : un point validé + un signalement accepté → 2.
    addPoint({ createdByUserId: 11, x: 7000, y: 7000 })
    const old = addPoint({ x: 7500, y: 7500 })
    addReport(old.id, { status: 'accepted' })

    const proposal = addPoint({ status: 'pending', kind: 'secret_room', x: 5500, y: 3500, createdAt: daysAgo(3), comment: 'Porte au sous-sol', validatedByUserId: null, validatedAt: null })
    const dock = addPoint({ kind: 'dock', x: 1500, y: 6500 })
    const misplacedA = addReport(dock.id, { kind: 'misplaced', userId: 11, proposedX: 1600, proposedY: 6600, comment: 'Plus au nord', createdAt: daysAgo(4) })
    const misplacedB = addReport(dock.id, { kind: 'misplaced', userId: 12, proposedX: 1701, proposedY: 6800, comment: '  ', createdAt: daysAgo(2) })
    const garage = addPoint({ mapName: 'Desert_Main', kind: 'garage', x: 4500, y: 2500 })
    addReport(garage.id, { kind: 'wrong_kind', userId: 11, proposedKind: 'dock', createdAt: daysAgo(5) })
    addReport(garage.id, { kind: 'wrong_kind', userId: 12, proposedKind: 'fuel', createdAt: daysAgo(1) })
    addReport(garage.id, { kind: 'wrong_kind', userId: 10, proposedKind: 'fuel', createdAt: daysAgo(1) })
    const fuel = addPoint({ x: 2500, y: 2500 })
    const missing = addReport(fuel.id, { kind: 'missing', userId: 10, createdAt: daysAgo(6), comment: 'Rasée' })
    // Exclus : point retiré, proposition refusée, signalement déjà traité.
    const removed = addPoint({ status: 'removed', x: 300, y: 300 })
    addReport(removed.id, { userId: 12 })
    addPoint({ status: 'rejected', x: 400, y: 400 })
    addReport(dock.id, { kind: 'missing', userId: 10, status: 'refused' })

    const { status, body } = await queue()
    expect(status).toBe(200)
    expect(body.items.map((item) => item.id)).toEqual([`report:${fuel.id}:missing`, `report:${garage.id}:wrong_kind`, `report:${dock.id}:misplaced`, `point:${proposal.id}`])
    expect(body.pendingCount).toBe(4)

    const [missingItem, wrongKind, misplaced, proposalItem] = body.items
    expect(missingItem).toMatchObject({ type: 'report', reportKind: 'missing', kind: 'fuel', before: { x: 2500, y: 2500, kind: 'fuel', grid: 'C-K' }, after: null, comments: ['Rasée'], reportIds: [missing.id] })
    expect(wrongKind).toMatchObject({ map: 'Desert_Main', mapLabel: 'Miramar', kind: 'garage', after: { x: 4500, y: 2500, kind: 'fuel', grid: 'E-K' } })
    expect(wrongKind.authors.map((author) => author.name)).toEqual(['Lemon', 'Joueur', 'Vexa'])
    expect(misplaced).toMatchObject({
      before: { x: 1500, y: 6500, kind: 'dock', grid: 'B-O' },
      after: { x: 1650.5, y: 6700, kind: 'dock', grid: 'B-O' },
      authors: [{ name: 'Lemon', validatedCount: 2 }, { name: 'Joueur', validatedCount: 0 }],
      comments: ['Plus au nord'],
      reportIds: [misplacedA.id, misplacedB.id],
      createdAt: (misplacedA.createdAt as Date).toISOString(),
    })
    expect(proposalItem).toMatchObject({ type: 'proposal', kind: 'secret_room', reportKind: null, before: null, after: { x: 5500, y: 3500, kind: 'secret_room', grid: 'F-L' }, authors: [{ name: 'Vexa' }], comments: ['Porte au sous-sol'], reportIds: [proposal.id] })

    expect(body.maps.map((map) => map.key)).toEqual(RESOURCE_MAPS.map((map) => map.key))
    expect(body.maps.find((map) => map.key === 'Baltic_Main')).toMatchObject({ validatedPoints: 4, verifiedAt: null, recheckSince: null })
    expect(body.maps.find((map) => map.key === 'Desert_Main')?.validatedPoints).toBe(1)
    expect(JSON.stringify(body)).not.toContain('@')
  })
})

describe('regroupement : demande d’un groupe et clé de ligne', () => {
  const report = (data: Row) => ({ id: 'r', userId: 1, kind: 'misplaced', proposedX: null, proposedY: null, proposedKind: null, comment: null, createdAt: new Date(), ...data })

  it('« Mal placé » : moyenne des positions valides ; « Mauvais type » : le plus demandé, le premier à égalité', () => {
    const point = { x: 100, y: 100, kind: 'garage' }
    expect(requestedByGroup(point, { kind: 'misplaced', reports: [report({ proposedX: 200, proposedY: 300 }), report({ proposedX: 300, proposedY: 400 }), report({})] })).toEqual({ x: 250, y: 350, kind: 'garage' })
    expect(requestedByGroup(point, { kind: 'misplaced', reports: [report({})] })).toBeNull()
    expect(requestedByGroup(point, { kind: 'wrong_kind', reports: [report({ proposedKind: 'dock' }), report({ proposedKind: 'fuel' })] })).toEqual({ x: 100, y: 100, kind: 'dock' })
    expect(requestedByGroup(point, { kind: 'wrong_kind', reports: [report({ proposedKind: 'dock' }), report({ proposedKind: 'fuel' }), report({ proposedKind: 'fuel' })] })?.kind).toBe('fuel')
    expect(requestedByGroup(point, { kind: 'missing', reports: [report({})] })).toBeNull()
  })

  it('clés de ligne', () => {
    expect(parseQueueItemId('point:cabc')).toEqual({ type: 'proposal', pointId: 'cabc' })
    expect(parseQueueItemId('report:cabc:wrong_kind')).toEqual({ type: 'report', pointId: 'cabc', reportKind: 'wrong_kind' })
    expect(parseQueueItemId('report:cabc:burnt')).toBeNull()
    expect(parseQueueItemId('cabc')).toBeNull()
    expect(parseQueueItemId(42)).toBeNull()
  })
})

// --- Décisions -------------------------------------------------------------------------------------------------------

describe('POST /api/resources/admin/decisions — propositions', () => {
  const pending = (data: Row = {}) => addPoint({ status: 'pending', validatedByUserId: null, validatedAt: null, lastConfirmedAt: null, ...data })

  beforeEach(() => {
    session = ADMIN
  })

  it('valider : point validé, validateur, dates ; une action d’historique avec avant / après', async () => {
    const point = pending()
    const { status, body } = await decide([{ itemId: `point:${point.id}`, decision: 'validate' }])
    expect(status).toBe(200)
    expect(body.results).toEqual([{ itemId: `point:${point.id}`, ok: true, actionId: expect.any(String), error: null }])
    expect(body.pendingCount).toBe(0)
    const row = pointRow(point.id)!
    expect(row).toMatchObject({ status: 'validated', validatedByUserId: 1 })
    expect(row.validatedAt).toEqual(row.lastConfirmedAt)

    expect(actions()).toHaveLength(1)
    const action = actions()[0]
    expect(action).toMatchObject({ id: body.results[0].actionId, action: 'validate_point', actorUserId: 1, mapName: 'Baltic_Main', pointId: point.id, summary: 'a validé Station-service · F-L — Proposée par Vexa' })
    expect(action.before).toMatchObject({ point: { id: point.id, status: 'pending', validatedByUserId: null, validatedAt: null, kind: 'fuel', x: 5500, y: 3500 } })
    expect(action.after).toMatchObject({ point: { status: 'validated', validatedByUserId: 1, validatedAt: expect.any(String) }, label: { object: 'Station-service · F-L', detail: 'Proposée par Vexa' } })
  })

  it('refuser : point refusé (plus visible), action « refuse_point »', async () => {
    const point = pending()
    const { body } = await decide([{ itemId: `point:${point.id}`, decision: 'refuse' }])
    expect(body.results[0].ok).toBe(true)
    expect(pointRow(point.id)).toMatchObject({ status: 'rejected', validatedByUserId: null })
    expect(actions()[0]).toMatchObject({ action: 'refuse_point', after: { point: { status: 'rejected' } } })
    session = VEXA
    expect((await readMap()).body.points).toEqual([])
  })

  it('modifier : type et position corrigés puis validation', async () => {
    const point = pending({ kind: 'garage' })
    const { body } = await decide([{ itemId: `point:${point.id}`, decision: 'edit', kind: 'fuel', x: 5601.26, y: 3399 }])
    expect(body.results[0].ok).toBe(true)
    expect(pointRow(point.id)).toMatchObject({ status: 'validated', kind: 'fuel', x: 5601.3, y: 3399, validatedByUserId: 1 })
    expect(actions()[0]).toMatchObject({ action: 'edit_point', summary: 'a corrigé et validé Garage → Station-service · F-L — Proposée par Vexa' })
  })

  it('modifier avec un type inconnu ou une position hors carte : ligne refusée, rien d’écrit', async () => {
    const point = pending()
    const { body } = await decide([
      { itemId: `point:${point.id}`, decision: 'edit', kind: 'bunker' },
      { itemId: `point:${point.id}`, decision: 'edit', x: 9000, y: 10 },
      { itemId: `point:${point.id}`, decision: 'edit', x: 10 },
    ])
    expect(body.results.map((result) => result.ok)).toEqual([false, false, false])
    expect(body.results[0].error).toMatch(/Type/)
    expect(pointRow(point.id)?.status).toBe('pending')
    expect(actions()).toHaveLength(0)
  })

  it('lot partiel : chaque ligne traitée indépendamment (inconnue, déjà traitée, décision invalide)', async () => {
    const first = pending()
    const second = pending({ x: 1000, y: 1000 })
    const done = addPoint({ x: 2000, y: 2000 })
    const { status, body } = await decide([
      { itemId: `point:${first.id}`, decision: 'validate' },
      { itemId: 'point:cinconnu', decision: 'validate' },
      { itemId: `point:${done.id}`, decision: 'refuse' },
      { itemId: `point:${second.id}`, decision: 'approve' },
      { itemId: 'n’importe quoi', decision: 'validate' },
      { itemId: `point:${second.id}`, decision: 'refuse' },
      { itemId: `point:${second.id}`, decision: 'validate' },
    ])
    expect(status).toBe(200)
    expect(body.results.map((result) => result.ok)).toEqual([true, false, false, false, false, true, false])
    expect(body.results[1].error).toBe('Proposition introuvable.')
    expect(body.results[2].error).toBe('Proposition déjà traitée.')
    expect(body.results[6].error).toBe('Proposition déjà traitée.')
    expect(body.results.every((result) => (result.ok ? result.actionId !== null : result.actionId === null))).toBe(true)
    expect(actions()).toHaveLength(2)
    expect(pointRow(second.id)?.status).toBe('rejected')
  })

  it('corps invalide : 400', async () => {
    expect((await call<ErrorBody>(decisionsRoute(post('/api/resources/admin/decisions', { decisions: [] })))).status).toBe(400)
    expect((await call<ErrorBody>(decisionsRoute(post('/api/resources/admin/decisions', { decisions: 'x' })))).status).toBe(400)
    expect((await call<ErrorBody>(decisionsRoute(post('/api/resources/admin/decisions', 'pas du JSON')))).status).toBe(400)
  })
})

describe('POST /api/resources/admin/decisions — signalements', () => {
  beforeEach(() => {
    session = ADMIN
  })

  it('« N’existe plus » validé : point retiré, signalements acceptés, autres signalements du point annulés', async () => {
    const point = addPoint({ kind: 'garage', x: 4500, y: 2500 })
    const a = addReport(point.id, { kind: 'missing', userId: 11 })
    const b = addReport(point.id, { kind: 'missing', userId: 12 })
    const other = addReport(point.id, { kind: 'wrong_kind', userId: 10, proposedKind: 'fuel' })
    const { body } = await decide([{ itemId: `report:${point.id}:missing`, decision: 'validate' }])
    expect(body.results[0].ok).toBe(true)
    expect(body.pendingCount).toBe(0)
    expect(pointRow(point.id)?.status).toBe('removed')
    expect(reportRow(a.id)).toMatchObject({ status: 'accepted', resolvedByUserId: 1 })
    expect(reportRow(b.id)?.status).toBe('accepted')
    expect(reportRow(other.id)?.status).toBe('cancelled')

    const action = actions()[0]
    expect(action).toMatchObject({ action: 'remove_point', summary: 'a retiré Garage · E-K — 2 signalements regroupés' })
    const before = action.before as StoredActionAfter
    const after = action.after as StoredActionAfter
    expect(before.point?.status).toBe('validated')
    expect(before.reports?.map((report) => [report.id, report.status])).toEqual([[a.id, 'pending'], [b.id, 'pending'], [other.id, 'pending']])
    expect(after.reports?.map((report) => [report.id, report.status])).toEqual([[a.id, 'accepted'], [b.id, 'accepted'], [other.id, 'cancelled']])

    // Lemon : signalement accepté → compte dans ses points validés.
    session = LEMON
    expect((await readMap()).body.viewer.validatedCount).toBe(1)
  })

  it('« Mal placé » validé : point déplacé à la moyenne des positions demandées', async () => {
    const point = addPoint({ kind: 'dock', x: 1500, y: 6500 })
    addReport(point.id, { kind: 'misplaced', userId: 11, proposedX: 1600, proposedY: 6600 })
    addReport(point.id, { kind: 'misplaced', userId: 12, proposedX: 1700, proposedY: 6700 })
    const { body } = await decide([{ itemId: `report:${point.id}:misplaced`, decision: 'validate' }])
    expect(body.results[0].ok).toBe(true)
    expect(pointRow(point.id)).toMatchObject({ status: 'validated', x: 1650, y: 6650, kind: 'dock' })
    expect(actions()[0]).toMatchObject({ action: 'move_point', summary: 'a déplacé Ponton · B-O — 2 signalements regroupés' })
  })

  it('« Mauvais type » validé : type le plus demandé', async () => {
    const point = addPoint({ kind: 'garage', x: 3500, y: 4500 })
    addReport(point.id, { kind: 'wrong_kind', userId: 11, proposedKind: 'fuel' })
    const { body } = await decide([{ itemId: `report:${point.id}:wrong_kind`, decision: 'validate' }])
    expect(body.results[0].ok).toBe(true)
    expect(pointRow(point.id)).toMatchObject({ kind: 'fuel', x: 3500, y: 4500 })
    expect(actions()[0]).toMatchObject({ action: 'change_kind', summary: 'a changé le type Garage → Station-service · D-M — Signalé par Lemon' })
  })

  it('refuser : signalements refusés, point inchangé', async () => {
    const point = addPoint({ kind: 'garage', x: 4500, y: 2500 })
    const a = addReport(point.id, { kind: 'missing', userId: 11 })
    const { body } = await decide([{ itemId: `report:${point.id}:missing`, decision: 'refuse' }])
    expect(body.results[0].ok).toBe(true)
    expect(reportRow(a.id)).toMatchObject({ status: 'refused', resolvedByUserId: 1 })
    expect(pointRow(point.id)?.status).toBe('validated')
    expect(actions()[0]).toMatchObject({ action: 'refuse_report', summary: 'a refusé Signalement « N’existe plus » · Garage E-K — Signalé par Lemon' })
    expect((actions()[0].before as StoredActionAfter).point).toBeUndefined()
  })

  it('modifier : la correction donnée remplace la demande (position et/ou type), signalements acceptés', async () => {
    const dock = addPoint({ kind: 'dock', x: 1500, y: 6500 })
    addReport(dock.id, { kind: 'misplaced', userId: 11, proposedX: 1600, proposedY: 6600 })
    const garage = addPoint({ kind: 'garage', x: 3500, y: 4500 })
    addReport(garage.id, { kind: 'wrong_kind', userId: 11, proposedKind: 'fuel' })
    const ghost = addPoint({ kind: 'fuel', x: 2500, y: 2500 })
    const missing = addReport(ghost.id, { kind: 'missing', userId: 12 })

    const { body } = await decide([
      { itemId: `report:${dock.id}:misplaced`, decision: 'edit', x: 1580, y: 6610 },
      { itemId: `report:${garage.id}:wrong_kind`, decision: 'edit', kind: 'secret_room' },
      { itemId: `report:${ghost.id}:missing`, decision: 'edit', x: 2600, y: 2400, kind: 'garage' },
    ])
    expect(body.results.map((result) => result.ok)).toEqual([true, true, true])
    expect(pointRow(dock.id)).toMatchObject({ x: 1580, y: 6610 })
    expect(pointRow(garage.id)).toMatchObject({ kind: 'secret_room' })
    expect(pointRow(ghost.id)).toMatchObject({ status: 'validated', kind: 'garage', x: 2600, y: 2400 })
    expect(reportRow(missing.id)?.status).toBe('accepted')
    expect(actions().map((action) => action.action)).toEqual(['move_point', 'change_kind', 'correct_point'])
  })

  it('refus de ligne : groupe inconnu, déjà traité, point retiré entre-temps, correction vide ou sans effet', async () => {
    const point = addPoint({ kind: 'garage', x: 4500, y: 2500 })
    addReport(point.id, { kind: 'missing', userId: 11 })
    addReport(point.id, { kind: 'wrong_kind', userId: 12, proposedKind: 'fuel' })
    const misplaced = addPoint({ kind: 'dock', x: 1500, y: 6500 })
    addReport(misplaced.id, { kind: 'misplaced', userId: 11, proposedX: 1600, proposedY: 6600 })
    const { body } = await decide([
      { itemId: `report:${point.id}:misplaced`, decision: 'validate' },
      { itemId: `report:${misplaced.id}:misplaced`, decision: 'edit' },
      { itemId: `report:${misplaced.id}:misplaced`, decision: 'edit', x: 1500, y: 6500 },
      { itemId: `report:${point.id}:missing`, decision: 'validate' },
      { itemId: `report:${point.id}:missing`, decision: 'validate' },
      { itemId: `report:${point.id}:wrong_kind`, decision: 'validate' },
    ])
    expect(body.results.map((result) => result.ok)).toEqual([false, false, false, true, false, false])
    expect(body.results[0].error).toBe('Signalements introuvables ou déjà traités.')
    expect(body.results[1].error).toMatch(/Correction vide/)
    expect(body.results[2].error).toMatch(/Rien à changer/)
    // Le point retiré a annulé le signalement « mauvais type » : la ligne n'existe plus.
    expect(body.results[5].error).toBe('Signalements introuvables ou déjà traités.')
    expect(body.pendingCount).toBe(1)
    expect(actions()).toHaveLength(1)
  })
})

// --- Cartes ----------------------------------------------------------------------------------------------------------

describe('POST /api/resources/admin/maps/:map', () => {
  beforeEach(() => {
    session = ADMIN
  })

  it('« à revérifier » puis « vérifiée » : état de la carte, points à confirmer, actions annulables', async () => {
    addPoint()
    addPoint({ x: 1000, y: 1000 })
    addPoint({ x: 2000, y: 2000, status: 'pending' })
    const recheck = await mapAction('Baltic_Main', 'recheck')
    expect(recheck.status).toBe(200)
    expect(recheck.body.map).toMatchObject({ key: 'Baltic_Main', label: 'Erangel', validatedPoints: 2, verifiedAt: null, recheckSince: expect.any(String) })
    expect(db.find('resourceMapState', { mapName: 'Baltic_Main' })).toMatchObject({ updatedByUserId: 1 })

    session = LEMON
    const map = await readMap()
    expect(map.body.state.toConfirm).toBe(2)
    expect(map.body.points.filter((point) => point.state === 'to_confirm')).toHaveLength(2)

    session = ADMIN
    const verify = await mapAction('Baltic_Main', 'verify')
    expect(verify.body.map).toMatchObject({ verifiedAt: expect.any(String), recheckSince: null })
    session = LEMON
    expect((await readMap()).body.state).toMatchObject({ toConfirm: 0, recheckSince: null, verifiedAt: expect.any(String) })

    expect(actions().map((action) => action.action)).toEqual(['recheck_map', 'verify_map'])
    expect(actions()[0]).toMatchObject({ pointId: null, before: { map: { mapName: 'Baltic_Main', verifiedAt: null, recheckSince: null } }, after: { map: { recheckSince: expect.any(String) } } })
  })

  it('carte inconnue ou action inconnue : 400', async () => {
    expect(await mapAction('Range_Main', 'recheck')).toMatchObject({ status: 400, body: { code: 'unknown_map' } })
    expect(await mapAction('Baltic_Main', 'reset')).toMatchObject({ status: 400, body: { code: 'invalid_action' } })
    expect(actions()).toHaveLength(0)
  })
})

// --- Historique ------------------------------------------------------------------------------------------------------

describe('GET /api/resources/admin/history', () => {
  beforeEach(() => {
    session = ADMIN
  })

  it('libellés de la maquette, plus récentes d’abord', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    let clock = new Date('2026-09-28T18:00:00Z').getTime()
    const tick = () => {
      clock += 60 * 60_000
      vi.setSystemTime(clock)
    }
    tick()

    const proposal = addPoint({ status: 'pending', validatedByUserId: null, validatedAt: null, x: 5500, y: 3500 })
    const garage = addPoint({ kind: 'garage', x: 4500, y: 2500 })
    addReport(garage.id, { kind: 'missing', userId: 11 })
    const dock = addPoint({ kind: 'dock', x: 1500, y: 6500 })
    addReport(dock.id, { kind: 'misplaced', userId: 11, proposedX: 1600, proposedY: 6600 })
    addReport(dock.id, { kind: 'misplaced', userId: 12, proposedX: 1700, proposedY: 6700 })
    const retyped = addPoint({ kind: 'garage', x: 3500, y: 4500 })
    addReport(retyped.id, { kind: 'wrong_kind', userId: 10, proposedKind: 'fuel' })
    for (let index = 0; index < 5; index += 1) addPoint({ kind: 'secret_room', x: 7000 + index * 100, y: 7000 })

    await decide([{ itemId: `point:${proposal.id}`, decision: 'validate' }])
    tick()
    await decide([{ itemId: `report:${garage.id}:missing`, decision: 'refuse' }])
    tick()
    await decide([{ itemId: `report:${dock.id}:misplaced`, decision: 'validate' }])
    vi.setSystemTime(new Date('2026-10-01T08:00:00Z'))
    await mapAction('Baltic_Main', 'recheck')
    vi.setSystemTime(new Date('2026-10-02T08:00:00Z'))
    await decide([{ itemId: `report:${retyped.id}:wrong_kind`, decision: 'validate' }])
    vi.setSystemTime(new Date('2026-10-03T08:00:00Z'))
    await mapAction('Baltic_Main', 'verify')

    const { status, body } = await history()
    expect(status).toBe(200)
    expect(body).toMatchObject({ page: 1, pageCount: 1, total: 6, windowDays: 30 })
    expect(body.entries.map(({ actor, verb, object, detail, mapLabel }) => ({ actor, verb, object, detail, mapLabel }))).toEqual([
      { actor: 'Paulo', verb: 'a vérifié la carte', object: 'Erangel', detail: 'Tous les points confirmés', mapLabel: 'Erangel' },
      { actor: 'Paulo', verb: 'a changé le type', object: 'Garage → Station-service · D-M', detail: 'Signalé par Vexa', mapLabel: 'Erangel' },
      { actor: 'Paulo', verb: 'a marqué à revérifier', object: '9 points saisis', detail: 'Mise à jour PUBG du 1/10', mapLabel: 'Erangel' },
      { actor: 'Paulo', verb: 'a déplacé', object: 'Ponton · B-O', detail: '2 signalements regroupés', mapLabel: 'Erangel' },
      { actor: 'Paulo', verb: 'a refusé', object: 'Signalement « N’existe plus » · Garage E-K', detail: 'Signalé par Lemon', mapLabel: 'Erangel' },
      { actor: 'Paulo', verb: 'a validé', object: 'Station-service · F-L', detail: 'Proposée par Vexa', mapLabel: 'Erangel' },
    ])
    // La carte vérifiée a changé l'état d'après de la revérification : celle-ci n'est plus annulable.
    expect(body.entries.map((entry) => entry.undoable)).toEqual([true, true, false, true, true, true])
    expect(body.entries[0].at).toBe('2026-10-03T08:00:00.000Z')
    expect(JSON.stringify(body)).not.toContain('@')
  })

  it(`pages de ${RESOURCE_HISTORY_PAGE_SIZE}, fenêtre de 30 jours, page hors bornes ramenée`, async () => {
    for (let index = 0; index < 9; index += 1) {
      db.insert('resourceAction', { actorUserId: 1, action: 'verify_map', mapName: 'Baltic_Main', summary: `entrée ${index}`, before: {}, after: { label: { object: `n°${index}`, detail: null } }, createdAt: daysAgo(index) })
    }
    db.insert('resourceAction', { actorUserId: 1, action: 'verify_map', mapName: 'Baltic_Main', summary: 'trop vieille', before: {}, after: {}, createdAt: daysAgo(31) })

    const first = await history()
    expect(first.body).toMatchObject({ page: 1, pageCount: 2, total: 9 })
    expect(first.body.entries.map((entry) => entry.object)).toEqual(['n°0', 'n°1', 'n°2', 'n°3', 'n°4', 'n°5', 'n°6'])
    const second = await history(2)
    expect(second.body.entries.map((entry) => entry.object)).toEqual(['n°7', 'n°8'])
    expect((await history(99)).body.page).toBe(2)
    expect((await history('abc')).body.page).toBe(1)
    expect(db.writes).toEqual([])
  })

  it('auteur supprimé : « Un SuperUser »', async () => {
    db.insert('resourceAction', { actorUserId: null, action: 'verify_map', mapName: 'Desert_Main', summary: 'a vérifié la carte Miramar', before: {}, after: {} })
    const { body } = await history()
    expect(body.entries[0]).toMatchObject({ actor: 'Un SuperUser', verb: 'a vérifié la carte', object: 'a vérifié la carte Miramar', detail: null, mapLabel: 'Miramar' })
  })
})

// --- Annulation ------------------------------------------------------------------------------------------------------

describe('POST /api/resources/admin/history/:id/undo', () => {
  beforeEach(() => {
    session = ADMIN
  })

  it('annuler une validation : proposition de nouveau en attente, action marquée, entrée « a annulé »', async () => {
    const point = addPoint({ status: 'pending', validatedByUserId: null, validatedAt: null, lastConfirmedAt: null })
    const { body } = await decide([{ itemId: `point:${point.id}`, decision: 'validate' }])
    const actionId = body.results[0].actionId!

    const response = await undo(actionId)
    expect(response).toEqual({ status: 200, body: { ok: true } })
    expect(pointRow(point.id)).toMatchObject({ status: 'pending', validatedByUserId: null, validatedAt: null, lastConfirmedAt: null })
    expect(db.find('resourceAction', { id: actionId })).toMatchObject({ undoneAt: expect.any(Date), undoneByUserId: 1 })

    const entries = (await history()).body.entries
    expect(entries[0]).toMatchObject({ verb: 'a annulé', object: 'Station-service · F-L', detail: expect.stringMatching(/^Validation de Paulo du \d+\/\d+$/), undoable: false, undoneAt: null })
    expect(entries[1]).toMatchObject({ id: actionId, verb: 'a validé', undoable: false, undoneAt: expect.any(String) })
    expect((await queue()).body.pendingCount).toBe(1)

    expect(await undo(actionId)).toMatchObject({ status: 409, body: { code: 'already_undone' } })
    expect(await undo(entries[0].id)).toMatchObject({ status: 409, body: { code: 'not_undoable' } })
  })

  it('refuse si la ligne a changé depuis : 409 « modifié depuis », rien n’est restauré', async () => {
    const point = addPoint({ status: 'pending', validatedByUserId: null, validatedAt: null, kind: 'dock', x: 1500, y: 6500 })
    const validation = (await decide([{ itemId: `point:${point.id}`, decision: 'validate' }])).body.results[0].actionId!
    addReport(point.id, { kind: 'misplaced', userId: 11, proposedX: 1600, proposedY: 6600 })
    await decide([{ itemId: `report:${point.id}:misplaced`, decision: 'validate' }])

    const response = await undo(validation)
    expect(response).toMatchObject({ status: 409, body: { code: 'modified' } })
    expect(response.body).toMatchObject({ error: expect.stringMatching(/modifié depuis/) })
    expect(pointRow(point.id)).toMatchObject({ status: 'validated', x: 1600, y: 6600 })
    expect(db.find('resourceAction', { id: validation })?.undoneAt).toBeNull()
    expect((await history()).body.entries.map((entry) => entry.undoable)).toEqual([true, false])
  })

  it('un « Toujours là » postérieur n’empêche pas l’annulation d’un déplacement, et reste gardé', async () => {
    const point = addPoint({ kind: 'dock', x: 1500, y: 6500 })
    addReport(point.id, { kind: 'misplaced', userId: 11, proposedX: 1600, proposedY: 6600 })
    const moved = (await decide([{ itemId: `report:${point.id}:misplaced`, decision: 'validate' }])).body.results[0].actionId!
    session = NYX
    await confirm(point.id as string)
    const confirmedAt = pointRow(point.id)?.lastConfirmedAt

    session = ADMIN
    expect((await undo(moved)).status).toBe(200)
    expect(pointRow(point.id)).toMatchObject({ x: 1500, y: 6500, lastConfirmedAt: confirmedAt, confirmationCount: 1 })
    expect(db.rows('resourceReport')[0].status).toBe('pending')
  })

  it('annuler un retrait : point de nouveau validé, signalements de nouveau en attente', async () => {
    const point = addPoint({ kind: 'garage', x: 4500, y: 2500 })
    const missing = addReport(point.id, { kind: 'missing', userId: 11 })
    const other = addReport(point.id, { kind: 'wrong_kind', userId: 12, proposedKind: 'fuel' })
    const removal = (await decide([{ itemId: `report:${point.id}:missing`, decision: 'validate' }])).body.results[0].actionId!
    expect((await undo(removal)).status).toBe(200)
    expect(pointRow(point.id)?.status).toBe('validated')
    expect(reportRow(missing.id)).toMatchObject({ status: 'pending', resolvedByUserId: null, resolvedAt: null })
    expect(reportRow(other.id)?.status).toBe('pending')
    expect((await queue()).body.pendingCount).toBe(2)
  })

  it('annuler un refus de signalements : de nouveau dans la file', async () => {
    const point = addPoint()
    addReport(point.id, { kind: 'missing', userId: 11 })
    const refusal = (await decide([{ itemId: `report:${point.id}:missing`, decision: 'refuse' }])).body.results[0].actionId!
    expect((await queue()).body.pendingCount).toBe(0)
    expect((await undo(refusal)).status).toBe(200)
    expect((await queue()).body.items.map((item) => item.id)).toEqual([`report:${point.id}:missing`])
  })

  it('annuler « à revérifier » : la carte retrouve son état d’avant', async () => {
    const verifiedAt = daysAgo(20)
    db.insert('resourceMapState', { mapName: 'Baltic_Main', verifiedAt, recheckSince: null })
    await mapAction('Baltic_Main', 'recheck')
    const recheck = actions()[0].id as string
    expect((await undo(recheck)).status).toBe(200)
    expect(db.find('resourceMapState', { mapName: 'Baltic_Main' })).toMatchObject({ verifiedAt, recheckSince: null })
    expect(actions().map((action) => action.action)).toEqual(['recheck_map', 'undo'])
    expect(actions()[1]).toMatchObject({ before: { map: { recheckSince: expect.any(String) } }, after: { map: { recheckSince: null } } })
  })

  it('action inconnue : 404', async () => {
    expect(await undo('cinconnu')).toMatchObject({ status: 404, body: { code: 'not_found' } })
  })
})
