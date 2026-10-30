import type { ApiMock } from './api'

/**
 * Page API PUBG (/settings/pubg-api) — réponse figée de `GET /api/settings/pubg-api-calls` (docs/TODO/fraicheur-des-parties.md,
 * lots 2 et 6) : grille du jour par tranches de 30 min, échecs classés, quota de la dernière heure.
 */

type Failures = { expected: number; transient: number; rateLimited: number; action: number }

const NO_FAILURE: Failures = { expected: 0, transient: 0, rateLimited: 0, action: 0 }

function slot(index: number, calls: number, failures: Partial<Failures> = {}) {
  const counts = { ...NO_FAILURE, ...failures }
  const failed = counts.expected + counts.transient + counts.rateLimited + counts.action
  return {
    minute: new Date(Date.UTC(2026, 9, 29, 0, 30 * index)).toISOString(),
    total: calls,
    success: calls - failed,
    errors: failed,
    ...counts,
  }
}

/**
 * Journée de démonstration : la tranche 2 n'a que des 404 attendus (verte), la tranche 3 un 403 (rouge), la tranche 4
 * deux 502 (verte : moins de 3 échecs passagers).
 */
export function pubgApiCallsPayload(options: { quotaLimited?: number } = {}) {
  const limited = options.quotaLimited ?? 420
  const series = Array.from({ length: 48 }, (_, index) => slot(index, index < 6 ? 300 : 0))
  series[2] = slot(2, 320, { expected: 4 })
  series[3] = slot(3, 310, { action: 1 })
  series[4] = slot(4, 305, { transient: 2 })
  const failures: Failures = { expected: 4, transient: 2, rateLimited: 0, action: 1 }
  return {
    rpm: 10,
    bounds: { min: 1, max: 600, defaultValue: 10 },
    windowMinutes: 1440,
    totals: { total: 1835, success: 1828, rateLimited: 0, errors: 7, retriesTotal: 1, avgDurationMs: 240, failures },
    latestRateLimit: null,
    historyPagination: { page: 1, pageSize: 15, total: 0, totalPages: 1, errorsOnly: false, query: null, clanId: null },
    series,
    dailySeries: [{ date: '2026-10-29', total: 1835, success: 1828, errors: 7, ...failures }],
    byCategory: [],
    byClan: [],
    topFailures: [
      { failureClass: 'action', statusCode: 403, category: 'player_search', label: '403 · Recherche joueur', count: 1, example: null },
      { failureClass: 'transient', statusCode: 502, category: 'match_detail', label: '502 · Détail du match', count: 2, example: null },
      { failureClass: 'expected', statusCode: 404, category: 'match_detail', label: '404 · Détail du match', count: 4, example: null },
    ],
    quota: {
      lastHour: { limited, high: Math.round(limited * 0.3), normal: 40, low: limited - Math.round(limited * 0.3) - 40 },
      peakHour: { hour: '2026-10-29T19:00:00.000Z', limited: 556 },
    },
    history: [],
  }
}

export function mockPubgApiCalls(api: ApiMock, options: { quotaLimited?: number } = {}) {
  api.on('GET', '/api/settings/pubg-api-calls', { body: pubgApiCallsPayload(options) })
}
