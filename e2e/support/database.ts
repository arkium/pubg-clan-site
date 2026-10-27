import type { ApiMock } from './api'

/**
 * Base de données (/settings/database, SuperUser) — réponses figées. Le comptage de purge reprend celui de la production
 * du 2026-10-27 : 7 609 matchs ordinaires au-delà de 30 jours, aucun match protégé au-delà de 90. La conservation
 * automatique est fermée par défaut ; les envois de la page sont rendus pour être vérifiés.
 */
const PURGE_COUNTS = {
  computedAt: '2026-10-27T05:01:46.854Z',
  durationMs: 106_347,
  totalRows: 37_743,
  totalWithGeo: 25_627,
  protectedMatches: 2_399,
  byThreshold: {
    '7': { cutoff: '2026-10-20T00:00:00.000Z', targeted: 21_461, protectedMatches: 2_003, purgeable: 19_458 },
    '14': { cutoff: '2026-10-13T00:00:00.000Z', targeted: 17_207, protectedMatches: 1_624, purgeable: 15_583 },
    '30': { cutoff: '2026-09-27T00:00:00.000Z', targeted: 8_504, protectedMatches: 895, purgeable: 7_609 },
    '60': { cutoff: '2026-08-28T00:00:00.000Z', targeted: 14, protectedMatches: 14, purgeable: 0 },
    '90': { cutoff: '2026-07-29T00:00:00.000Z', targeted: 0, protectedMatches: 0, purgeable: 0 },
    all: { cutoff: null, targeted: 25_627, protectedMatches: 2_399, purgeable: 23_228 },
  },
}

const TELEMETRY_TABLE = {
  tableName: 'SquadMatchTelemetry',
  rowCount: 37_743,
  dataSizeMb: 7_100,
  indexSizeMb: 12,
  totalSizeMb: 7_112,
  dataFreeMb: 4_500,
}

export function mockDatabaseSettings(api: ApiMock, options: { retentionEnabled?: boolean } = {}) {
  const posts: unknown[] = []
  let retentionEnabled = options.retentionEnabled ?? false
  api
    .on('GET', '/api/superuser/database', {
      body: {
        globalStats: { totalDataMb: 7_400, totalIndexMb: 900, totalSizeMb: 8_300, totalFreeMb: 4_600 },
        tables: [TELEMETRY_TABLE, { tableName: 'SquadMatch', rowCount: 52_000, dataSizeMb: 300, indexSizeMb: 120, totalSizeMb: 420, dataFreeMb: 4 }],
      },
    })
    .on('GET', '/api/superuser/database/optimize', {
      body: {
        assessment: {
          table: 'SquadMatchTelemetry',
          sizes: TELEMETRY_TABLE,
          disk: { measured: false, path: null, freeMb: null, totalMb: null, reason: 'mesure du disque indisponible' },
          requiredMb: 7_200,
          verdict: 'blocked_unknown_disk',
          reason: 'Espace disque inconnu : le compactage reste bloqué.',
        },
        run: null,
      },
    })
    .on('GET', '/api/superuser/database/purge-telemetry', () => ({
      body: {
        counts: PURGE_COUNTS,
        run: null,
        recounting: false,
        totalRows: PURGE_COUNTS.totalRows,
        retention: { enabled: retentionEnabled, nextTarget: 7_609 },
      },
    }))
    .on('POST', '/api/superuser/database/purge-telemetry', (_url, request) => {
      const body = request.postDataJSON() as { action?: string; enabled?: boolean }
      posts.push(body)
      if (body.action === 'retention') retentionEnabled = body.enabled === true
      return { body: { ok: true, retentionEnabled } }
    })
  return posts
}
