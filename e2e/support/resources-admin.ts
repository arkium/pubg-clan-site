import type { Request } from '@playwright/test'

import type {
  ResourceDecisionInput,
  ResourceHistoryEntry,
  ResourceMapResponse,
  ResourceMapSummary,
  ResourceQueueItem,
} from '@/lib/resources/resource-api'
import { RESOURCE_HISTORY_PAGE_SIZE } from '@/lib/resources/resource-api'
import type { ApiMock } from './api'
import { mockMemberSession } from './session'

/**
 * Vue SuperUser de la Carte des ressources (e2e/resources-admin.spec.ts) : file de validation de six éléments (une
 * proposition par carte, un signalement de chaque nature, dont un regroupé de trois joueurs), cinq cartes (une déjà à
 * revérifier, une sans point saisi), historique de 17 décisions (trois pages de 7). Données fictives ; chaque action
 * modifie l'état simulé et son corps est gardé pour vérifier ce que la page envoie — rien n'atteint la base.
 */

export { withSessionCookie } from './session'

export const RESOURCES_PATH = '/carte-des-ressources'

type Spot = { x: number; y: number; kind: ResourceQueueItem['kind']; grid: string }

function queueItem(item: Omit<ResourceQueueItem, 'pointId' | 'reportIds'> & { reportIds?: string[] }): ResourceQueueItem {
  const pointId = item.id.split(':')[1]
  return { ...item, pointId, reportIds: item.reportIds ?? [pointId] }
}

const at = (x: number, y: number, kind: ResourceQueueItem['kind'], grid: string): Spot => ({ x, y, kind, grid })

/** Identifiants des lignes de la file. */
export const ITEM = {
  yasnaya: 'point:pt-yasnaya',
  missing: 'report:pt-garage-1:missing',
  misplaced: 'report:pt-dock-1:misplaced',
  wrongKind: 'report:pt-garage-2:wrong_kind',
  secret: 'point:pt-secret',
  sanhok: 'point:pt-sanhok',
} as const

export function initialQueue(): ResourceQueueItem[] {
  return [
    queueItem({
      id: ITEM.yasnaya,
      type: 'proposal',
      map: 'Baltic_Main',
      mapLabel: 'Erangel',
      kind: 'fuel',
      reportKind: null,
      before: null,
      after: at(4520, 4410, 'fuel', 'E-M'),
      authors: [{ name: 'Kr4ken', validatedCount: 12 }],
      comments: ['Petite station à l’entrée de Yasnaya'],
      createdAt: '2026-10-03T19:42:00.000Z',
    }),
    queueItem({
      id: ITEM.missing,
      type: 'report',
      map: 'Baltic_Main',
      mapLabel: 'Erangel',
      kind: 'garage',
      reportKind: 'missing',
      before: at(2870, 5230, 'garage', 'C-N'),
      after: null,
      authors: [
        { name: 'Nyx', validatedCount: 4 },
        { name: 'Vexa', validatedCount: 2 },
        { name: 'Lemon', validatedCount: 0 },
      ],
      comments: ['Plus de garage depuis la mise à jour', 'Rasé, il reste la dalle'],
      createdAt: '2026-10-02T18:05:00.000Z',
      reportIds: ['rep-1', 'rep-2', 'rep-3'],
    }),
    queueItem({
      id: ITEM.misplaced,
      type: 'report',
      map: 'Desert_Main',
      mapLabel: 'Miramar',
      kind: 'dock',
      reportKind: 'misplaced',
      before: at(1200, 3300, 'dock', 'B-L'),
      after: at(1260, 3340, 'dock', 'B-L'),
      authors: [{ name: 'Vexa', validatedCount: 2 }],
      comments: ['Le ponton est 60 m plus à l’est'],
      createdAt: '2026-10-02T21:10:00.000Z',
      reportIds: ['rep-4'],
    }),
    queueItem({
      id: ITEM.wrongKind,
      type: 'report',
      map: 'Tiger_Main',
      mapLabel: 'Taego',
      kind: 'garage',
      reportKind: 'wrong_kind',
      before: at(5600, 6100, 'garage', 'F-O'),
      after: at(5600, 6100, 'fuel', 'F-O'),
      authors: [{ name: 'Lemon', validatedCount: 0 }],
      comments: [],
      createdAt: '2026-10-01T20:30:00.000Z',
      reportIds: ['rep-5'],
    }),
    queueItem({
      id: ITEM.secret,
      type: 'proposal',
      map: 'DihorOtok_Main',
      mapLabel: 'Vikendi',
      kind: 'secret_room',
      reportKind: null,
      before: null,
      after: at(3100, 2900, 'secret_room', 'D-K'),
      authors: [{ name: 'Nyx', validatedCount: 4 }],
      comments: [],
      createdAt: '2026-10-01T19:00:00.000Z',
    }),
    queueItem({
      id: ITEM.sanhok,
      type: 'proposal',
      map: 'Savage_Main',
      mapLabel: 'Sanhok',
      kind: 'fuel',
      reportKind: null,
      before: null,
      after: at(1500, 2500, 'fuel', 'B-K'),
      authors: [{ name: 'Kr4ken', validatedCount: 12 }],
      comments: ['Derrière le pont'],
      createdAt: '2026-09-30T18:00:00.000Z',
    }),
  ]
}

export function initialMaps(): ResourceMapSummary[] {
  return [
    { key: 'Baltic_Main', label: 'Erangel', validatedPoints: 9, verifiedAt: '2026-09-28T10:00:00.000Z', recheckSince: null },
    { key: 'Desert_Main', label: 'Miramar', validatedPoints: 4, verifiedAt: null, recheckSince: '2026-10-01T08:00:00.000Z' },
    { key: 'Tiger_Main', label: 'Taego', validatedPoints: 0, verifiedAt: null, recheckSince: null },
    { key: 'DihorOtok_Main', label: 'Vikendi', validatedPoints: 3, verifiedAt: null, recheckSince: null },
    { key: 'Savage_Main', label: 'Sanhok', validatedPoints: 2, verifiedAt: null, recheckSince: null },
  ]
}

/** 17 décisions : la plus récente d'abord ; la 3e déjà annulée, la 4e non annulable (carte marquée à revérifier). */
export function historyEntries(): ResourceHistoryEntry[] {
  const crafted: ResourceHistoryEntry[] = [
    { id: 'h-1', at: '2026-10-03T19:42:00.000Z', actor: 'Kr4ken', verb: 'a validé', object: 'Station-service · F-L', detail: 'Proposée par Vexa', mapLabel: 'Erangel', undoable: true, undoneAt: null },
    { id: 'h-2', at: '2026-10-03T19:30:00.000Z', actor: 'Kr4ken', verb: 'a refusé', object: 'Garage · C-N', detail: '2 signalements regroupés', mapLabel: 'Erangel', undoable: true, undoneAt: null },
    { id: 'h-3', at: '2026-10-02T22:10:00.000Z', actor: 'Ombre', verb: 'a déplacé', object: 'Ponton · B-L', detail: 'Signalé par Vexa', mapLabel: 'Miramar', undoable: false, undoneAt: '2026-10-02T22:15:00.000Z' },
    { id: 'h-4', at: '2026-10-01T08:00:00.000Z', actor: 'Ombre', verb: 'a marqué à revérifier', object: 'Miramar', detail: '4 points à confirmer', mapLabel: 'Miramar', undoable: false, undoneAt: null },
  ]
  const filler = Array.from({ length: 13 }, (_, index): ResourceHistoryEntry => ({
    id: `h-${index + 5}`,
    at: new Date(Date.UTC(2026, 8, 30 - index, 19, 10)).toISOString(),
    actor: index % 2 ? 'Ombre' : 'Kr4ken',
    verb: 'a validé',
    object: `Salle secrète · D-${String.fromCharCode(73 + (index % 8))}`,
    detail: `Proposée par Joueur ${index + 1}`,
    mapLabel: 'Vikendi',
    undoable: true,
    undoneAt: null,
  }))
  return [...crafted, ...filler]
}

/** Lecteur SuperUser de la carte : réponse minimale de `GET /api/resources` (onglets réservés et pastille). */
export function resourceMapResponse(url: URL, queueCount: number): ResourceMapResponse {
  const key = url.searchParams.get('map') || 'Baltic_Main'
  const map = initialMaps().find((entry) => entry.key === key) ?? initialMaps()[0]
  return {
    map: { key: map.key, label: map.label, sizeMeters: key === 'Savage_Main' ? 4096 : 8192 },
    state: { verifiedAt: map.verifiedAt, recheckSince: map.recheckSince, toConfirm: 0 },
    points: [],
    observed: { analysedMatches: 0, windowDays: 90, computedAt: null, spots: [] },
    counts: { observed: { car: 0, moto: 0, boat: 0, glider: 0, land: 0 }, points: { fuel: 0, garage: 0, dock: 0, secret_room: 0 } },
    viewer: { signedIn: true, isSuperUser: true, validatedCount: 0, queueCount },
  }
}

export type ResourceAdminState = {
  queue: ResourceQueueItem[]
  maps: ResourceMapSummary[]
  history: ResourceHistoryEntry[]
  /** Lignes retirées par une décision, par identifiant d'action (pour l'annulation). */
  decided: Map<string, ResourceQueueItem>
  /** Corps reçus. */
  decisionBodies: ResourceDecisionInput[][]
  undone: string[]
  mapActions: Array<{ map: string; action: string }>
  historyPages: number[]
  /** Lignes dont la décision échoue (« Ce point a changé… »). */
  failing: Set<string>
  /** File vide dès le départ. */
  empty: boolean
}

const MAX_ACTIONS = 40

function body<T>(request: Request): T {
  return (request.postDataJSON() ?? {}) as T
}

/** Session SuperUser et toutes les API de la vue : file, décisions, cartes, historique, annulations. */
export function mockResourcesAdmin(api: ApiMock, options: { empty?: boolean } = {}): ResourceAdminState {
  const state: ResourceAdminState = {
    queue: options.empty ? [] : initialQueue(),
    maps: initialMaps(),
    history: historyEntries(),
    decided: new Map(),
    decisionBodies: [],
    undone: [],
    mapActions: [],
    historyPages: [],
    failing: new Set(),
    empty: Boolean(options.empty),
  }
  let nextAction = 1

  mockMemberSession(api, { superUser: true })
  api
    .on('GET', '/api/resources', (url) => ({ body: resourceMapResponse(url, state.queue.length) }))
    .on('GET', '/api/resources/drop-zones', (url) => ({
      body: { clanId: Number(url.searchParams.get('clanId')) || 1, map: url.searchParams.get('map') || 'Baltic_Main', centers: [], radiusMeters: 800 },
    }))
    .on('GET', '/api/resources/admin/queue', () => ({ body: { items: state.queue, maps: state.maps, pendingCount: state.queue.length } }))
    .on('POST', '/api/resources/admin/decisions', (_url, request) => {
      const decisions = body<{ decisions: ResourceDecisionInput[] }>(request).decisions ?? []
      state.decisionBodies.push(decisions)
      const results = decisions.map((decision) => {
        const item = state.queue.find((entry) => entry.id === decision.itemId)
        if (!item || state.failing.has(decision.itemId)) {
          return { itemId: decision.itemId, ok: false, actionId: null, error: 'Ce point a changé depuis le signalement — recharge la file.' }
        }
        const actionId = `act-${nextAction++}`
        state.queue = state.queue.filter((entry) => entry.id !== item.id)
        state.decided.set(actionId, item)
        return { itemId: decision.itemId, ok: true, actionId, error: null }
      })
      return { body: { results, pendingCount: state.queue.length } }
    })
    .on('GET', '/api/resources/admin/history', (url) => {
      const requested = Number(url.searchParams.get('page')) || 1
      state.historyPages.push(requested)
      const pageCount = Math.max(1, Math.ceil(state.history.length / RESOURCE_HISTORY_PAGE_SIZE))
      const page = Math.min(pageCount, Math.max(1, requested))
      const entries = state.history.slice((page - 1) * RESOURCE_HISTORY_PAGE_SIZE, page * RESOURCE_HISTORY_PAGE_SIZE)
      return { body: { entries, page, pageCount, total: state.history.length, windowDays: 30 } }
    })

  for (const map of initialMaps()) {
    api.on('POST', `/api/resources/admin/maps/${map.key}`, (_url, request) => {
      const action = body<{ action: string }>(request).action
      state.mapActions.push({ map: map.key, action })
      state.maps = state.maps.map((entry) =>
        entry.key !== map.key
          ? entry
          : action === 'recheck'
            ? { ...entry, recheckSince: '2026-10-04T18:00:00.000Z' }
            : { ...entry, recheckSince: null, verifiedAt: '2026-10-04T18:00:00.000Z' }
      )
      return { body: { map: state.maps.find((entry) => entry.key === map.key) } }
    })
  }

  // Annulation : une décision prise depuis la file (`act-N`, la ligne revient) ou une entrée de l'historique.
  const undoIds = [...Array.from({ length: MAX_ACTIONS }, (_, index) => `act-${index + 1}`), ...historyEntries().map((entry) => entry.id)]
  for (const id of undoIds) {
    api.on('POST', `/api/resources/admin/history/${id}/undo`, () => {
      state.undone.push(id)
      const item = state.decided.get(id)
      if (item) {
        state.decided.delete(id)
        state.queue = [...state.queue, item]
      }
      state.history = state.history.map((entry) => (entry.id === id ? { ...entry, undoable: false, undoneAt: '2026-10-04T18:05:00.000Z' } : entry))
      return { body: { ok: true } }
    })
  }

  return state
}
