import type { ApiMock } from './api'
import { CLAN_ID } from './data'
import {
  RESOURCE_HISTORY_WINDOW_DAYS,
  type ObservedSpotView,
  type ResourceDropZonesResponse,
  type ResourceHistoryResponse,
  type ResourceMapResponse,
  type ResourcePointView,
  type ResourceProposalResponse,
  type ResourceQueueResponse,
  type ResourceReportResponse,
} from '../../src/lib/resources/resource-api'
import {
  DROP_ZONE_RADIUS_METERS,
  OBSERVED_FAMILIES,
  RESOURCE_POINT_KINDS,
  gridLabel,
  resourceMap,
  type ResourcePointKind,
} from '../../src/lib/resources/resource-map'
import type { ProposalBody, ReportBody } from '../../src/lib/resources/resource-view'

/**
 * Carte des ressources (`/carte-des-ressources`, docs/features/carte-ressources.md) : réponses figées de toutes les
 * routes du joueur (contrat : src/lib/resources/resource-api.ts). Les routes et les tables sont écrites en parallèle :
 * les tests ne dépendent que du contrat.
 *
 * Erangel : trois points validés, une proposition du lecteur (connecté seulement), cinq emplacements observés, assez
 * espacés pour rester cliquables à 375 px ; drop zones Pochinki, School, Georgopol — à 800 m : 1 voiture, 1 moto,
 * 1 station-service, 1 garage, 1 salle secrète.
 * Miramar : un point. Vikendi : aucun point saisi (encart « Aucun point saisi »), deux emplacements observés.
 */

export const ERANGEL = 'Baltic_Main'
export const MIRAMAR = 'Desert_Main'
export const VIKENDI = 'DihorOtok_Main'

export const FUEL_ID = 'pt-fuel-1'
export const GARAGE_ID = 'pt-garage-1'
export const DOCK_ID = 'pt-dock-1'
export const MINE_ID = 'pt-mine-1'
export const NEW_POINT_ID = 'pt-new'

export const RECHECK_SINCE = '2026-10-01T08:00:00.000Z'

const VERIFIED_AT = '2026-09-28T10:00:00.000Z'

function point(map: string, id: string, kind: ResourcePointKind, x: number, y: number, overrides: Partial<ResourcePointView> = {}): ResourcePointView {
  return {
    id,
    kind,
    x,
    y,
    grid: gridLabel(resourceMap(map)!, x, y),
    state: 'validated',
    mine: false,
    createdBy: { name: 'Vexa', validatedCount: 21 },
    validatedBy: 'Arkium',
    validatedAt: '2026-09-20T10:00:00.000Z',
    lastConfirmedAt: '2026-09-29T18:00:00.000Z',
    confirmations: 4,
    createdAt: '2026-09-18T10:00:00.000Z',
    comment: null,
    reportedByMe: false,
    confirmedByMe: false,
    ...overrides,
  }
}

function spot(map: string, family: ObservedSpotView['family'], x: number, y: number, share: number, observations: number): ObservedSpotView {
  return { family, x, y, grid: gridLabel(resourceMap(map)!, x, y), share, observations, matches: Math.max(3, Math.round(share * 78)) }
}

export type ResourceMockOptions = {
  signedIn?: boolean
  superUser?: boolean
  queueCount?: number
  /** Erangel marquée « à revérifier » : ses points validés passent « à confirmer ». */
  recheck?: boolean
  /** Réponse de la carte en erreur (500) tant que `state.failing` reste vrai. */
  failing?: boolean
}

function erangelPoints(options: ResourceMockOptions): ResourcePointView[] {
  const recheckState = options.recheck ? ({ state: 'to_confirm' } as const) : {}
  const points = [
    point(ERANGEL, FUEL_ID, 'fuel', 2500, 2400, recheckState),
    point(ERANGEL, GARAGE_ID, 'garage', 5000, 4800, { ...recheckState, createdBy: { name: 'Nyx', validatedCount: 1 }, confirmations: 0, lastConfirmedAt: null }),
    point(ERANGEL, DOCK_ID, 'dock', 6500, 7200, recheckState),
  ]
  if (options.signedIn) {
    points.push(
      point(ERANGEL, MINE_ID, 'secret_room', 4900, 3800, {
        state: 'pending',
        mine: true,
        createdBy: { name: 'Joueur Alpha', validatedCount: 2 },
        validatedBy: null,
        validatedAt: null,
        lastConfirmedAt: null,
        confirmations: 0,
        createdAt: '2026-10-03T16:00:00.000Z',
        comment: 'Clé dans la maison bleue',
      })
    )
  }
  return points
}

export function resourceMapResponse(mapKey: string, options: ResourceMockOptions = {}): ResourceMapResponse {
  const map = resourceMap(mapKey) ?? resourceMap(ERANGEL)!
  let points: ResourcePointView[] = []
  let spots: ObservedSpotView[] = []
  let state: ResourceMapResponse['state'] = { verifiedAt: VERIFIED_AT, recheckSince: null, toConfirm: 0 }
  if (map.key === ERANGEL) {
    points = erangelPoints(options)
    spots = [
      spot(ERANGEL, 'car', 3200, 3700, 0.62, 48),
      spot(ERANGEL, 'car', 5200, 2100, 0.12, 11),
      spot(ERANGEL, 'moto', 3400, 4900, 0.2, 17),
      spot(ERANGEL, 'boat', 7400, 6200, 0.3, 24),
      spot(ERANGEL, 'glider', 1500, 6000, 0.08, 6),
    ]
    if (options.recheck) state = { verifiedAt: VERIFIED_AT, recheckSince: RECHECK_SINCE, toConfirm: 9 }
  } else if (map.key === MIRAMAR) {
    points = [point(MIRAMAR, 'pt-miramar-1', 'fuel', 4000, 4000)]
    spots = [spot(MIRAMAR, 'car', 4100, 3900, 0.4, 5)]
  } else if (map.key === VIKENDI) {
    state = { verifiedAt: null, recheckSince: null, toConfirm: 0 }
    spots = [spot(VIKENDI, 'car', 1200, 1500, 0.3, 30), spot(VIKENDI, 'land', 6000, 6400, 0.15, 14)]
  } else {
    state = { verifiedAt: null, recheckSince: null, toConfirm: 0 }
  }

  const observed = Object.fromEntries(OBSERVED_FAMILIES.map((family) => [family, spots.filter((entry) => entry.family === family).length]))
  const counts = Object.fromEntries(RESOURCE_POINT_KINDS.map((kind) => [kind, points.filter((entry) => entry.kind === kind).length]))
  return {
    map: { key: map.key, label: map.label, sizeMeters: map.sizeMeters },
    state,
    points,
    observed: { analysedMatches: 78, windowDays: 90, computedAt: '2026-10-04T04:30:00.000Z', spots },
    counts: { observed: observed as ResourceMapResponse['counts']['observed'], points: counts as ResourceMapResponse['counts']['points'] },
    viewer: {
      signedIn: options.signedIn ?? false,
      isSuperUser: options.superUser ?? false,
      validatedCount: 2,
      queueCount: options.superUser ? (options.queueCount ?? 0) : null,
    },
  }
}

export function dropZonesResponse(mapKey: string): ResourceDropZonesResponse {
  const centers =
    mapKey === ERANGEL
      ? [
          { name: 'Pochinki', x: 3300, y: 4300, landings: 31 },
          { name: 'School', x: 5000, y: 4300, landings: 18 },
          { name: 'Georgopol', x: 2000, y: 2200, landings: 12 },
        ]
      : []
  return { clanId: CLAN_ID, map: mapKey, centers, radiusMeters: DROP_ZONE_RADIUS_METERS }
}

export type ResourceMockState = {
  proposals: ProposalBody[]
  reports: Array<{ pointId: string; body: ReportBody }>
  confirms: string[]
  cancels: string[]
  /** Carte en erreur (500) : le test le remet à faux avant « Réessayer ». */
  failing: boolean
}

export function mockResources(api: ApiMock, options: ResourceMockOptions = {}) {
  const state: ResourceMockState = { proposals: [], reports: [], confirms: [], cancels: [], failing: options.failing ?? false }

  api.on('GET', '/api/resources', (url) => {
    if (state.failing) return { status: 500, body: { error: 'Erreur interne' } }
    return { body: resourceMapResponse(url.searchParams.get('map') ?? ERANGEL, options) }
  })
  api.on('GET', '/api/resources/drop-zones', (url) => ({ body: dropZonesResponse(url.searchParams.get('map') ?? ERANGEL) }))

  api.on('POST', '/api/resources/points', (_url, request) => {
    const body = request.postDataJSON() as ProposalBody
    state.proposals.push(body)
    const created = point(body.map, NEW_POINT_ID, body.kind, body.x, body.y, {
      state: 'pending',
      mine: true,
      createdBy: { name: 'Joueur Alpha', validatedCount: 3 },
      validatedBy: null,
      validatedAt: null,
      lastConfirmedAt: null,
      confirmations: 0,
      createdAt: '2026-10-04T18:00:00.000Z',
      comment: body.comment ?? null,
    })
    const reply: ResourceProposalResponse = { point: created, validatedCount: 3 }
    return { body: reply }
  })

  for (const current of erangelPoints({ ...options, signedIn: true })) {
    api.on('POST', `/api/resources/points/${current.id}/confirm`, () => {
      state.confirms.push(current.id)
      return {
        body: {
          point: { ...current, state: 'validated', confirmedByMe: true, confirmations: current.confirmations + 1, lastConfirmedAt: '2026-10-04T18:00:00.000Z' },
        },
      }
    })
    api.on('POST', `/api/resources/points/${current.id}/reports`, (_url, request) => {
      state.reports.push({ pointId: current.id, body: request.postDataJSON() as ReportBody })
      const reply: ResourceReportResponse = { ok: true, validatedCount: 12 }
      return { body: reply }
    })
  }
  api.on('POST', `/api/resources/points/${MINE_ID}/cancel`, () => {
    state.cancels.push(MINE_ID)
    return { body: { ok: true } }
  })

  if (options.superUser) mockResourceAdmin(api, options.queueCount ?? 0)

  return state
}

/**
 * Vue SuperUser (onglets Validation et Historique, écrits à part) : file et historique vides, pour que la bascule des
 * onglets reste testable quand les onglets liront leurs routes.
 */
export function mockResourceAdmin(api: ApiMock, pendingCount: number) {
  const queue: ResourceQueueResponse = { items: [], maps: [], pendingCount }
  const history: ResourceHistoryResponse = { entries: [], page: 1, pageCount: 1, total: 0, windowDays: RESOURCE_HISTORY_WINDOW_DAYS }
  api.on('GET', '/api/resources/admin/queue', { body: queue })
  api.on('GET', '/api/resources/admin/history', { body: history })
}
