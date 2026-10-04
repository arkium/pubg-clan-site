import type { ApiMock } from './api'

/**
 * Mouvements de clan (`GET /api/clan-lifecycle/mutations`) pour e2e/clan-mutations.spec.ts : 30 mouvements fictifs,
 * 25 par page comme l'API. Les quatre natures (arrivée, départ, transfert, annulé) sont sur la première page.
 */

export const MUTATIONS_API = '/api/clan-lifecycle/mutations'
const PAGE_SIZE = 25

const DEMO = { id: 1, tag: 'DEMO', name: 'Clan Démo', isSystem: false }
const MEUTE = { id: 3, tag: 'LMT', name: 'La Meute', isSystem: false }
const UNGROUPED = { id: 99, tag: 'UNG', name: 'Ungrouped', isSystem: true }

const FIRST = [
  // 01:45 à Paris le 4 octobre (23:45 UTC le 3) : rangé le dimanche 4.
  { id: 'mut-1', source: 'ungrouped_promotion', status: 'applied', at: '2026-10-03T23:45:00.000Z', member: { id: 11, name: 'Nova' }, from: UNGROUPED, to: DEMO },
  { id: 'mut-2', source: 'auto_demotion', status: 'applied', at: '2026-10-03T23:44:00.000Z', member: { id: 12, name: 'Brisk' }, from: MEUTE, to: UNGROUPED },
  { id: 'mut-3', source: 'auto_transfer', status: 'applied', at: '2026-10-02T23:45:00.000Z', member: { id: 13, name: 'Kestrel' }, from: DEMO, to: MEUTE },
  { id: 'mut-4', source: 'manual_transfer', status: 'reverted', at: '2026-10-01T14:10:00.000Z', member: null, from: MEUTE, to: DEMO },
]

/** Toutes les lignes, du plus récent au plus ancien, comme l'API. */
const ALL = [
  ...FIRST,
  ...Array.from({ length: 26 }, (_, index) => ({
    id: `mut-${index + 5}`,
    source: 'manual_demotion',
    status: 'applied',
    at: new Date(Date.UTC(2026, 8, 30 - Math.floor(index / 3), 18, 0)).toISOString(),
    member: { id: 100 + index, name: `Joueur ${index + 5}` },
    from: DEMO,
    to: UNGROUPED,
  })),
]

export function mockClanMutations(api: ApiMock, options: { empty?: boolean; status?: number } = {}) {
  api.on('GET', MUTATIONS_API, (url) => {
    if (options.status) return { status: options.status, body: { error: 'Unauthorized' } }
    const rows = options.empty ? [] : ALL
    const page = Number(url.searchParams.get('page') ?? '1')
    return {
      body: {
        mutations: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        page,
        pageSize: PAGE_SIZE,
        total: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / PAGE_SIZE)),
      },
    }
  })
}
