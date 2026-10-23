import { describe, expect, it } from 'vitest'

import {
  fileFailures,
  formatMilliseconds,
  formatPercent,
  pickObservability,
  pickResyncFileQueue,
  pubgFailures,
  RETRY_BATCH_MAX,
  retryTargets,
  type LiveSyncJob,
  type TelemetryFailure,
} from '@/lib/clan-telemetry-view'

// Vue des deux files du worker pour les Données d'un clan (docs/TODO/administration.md §8) : calcul pur.

function job(id: string, squadMatchId: string | null, status: 'success' | 'failed', minutesAgo: number, extra: Partial<LiveSyncJob> = {}): LiveSyncJob {
  const at = new Date(Date.UTC(2026, 9, 11, 20, 0) - minutesAgo * 60_000).toISOString()
  return {
    id,
    squadMatchId,
    pubgMatchId: squadMatchId ? `pubg-${squadMatchId}` : null,
    startedAt: at,
    finishedAt: at,
    durationMs: 1000,
    status,
    expired: false,
    errorCode: status === 'failed' ? 'TELEMETRY_FETCH_FAILED' : null,
    errorMessage: status === 'failed' ? 'PUBG indisponible' : null,
    bytesDownloaded: 0,
    ...extra,
  }
}

const OBSERVABILITY = {
  summary: { runs: 2, success: 1, failed: 1, expired: 0, bytesDownloaded: 10 },
  health: { ratedRuns: 2, successRate: 50, failedRate: 50, alerts: [] },
  latency: { p95DurationMs: 1200 },
  series: [job('j1', 'sm1', 'failed', 5)],
}

describe('lecture des routes', () => {
  it('observabilité : données à la racine ou sous `data`, refus d’une réponse en erreur ou incomplète', () => {
    expect(pickObservability(OBSERVABILITY)).toEqual(OBSERVABILITY)
    expect(pickObservability({ ok: true, data: OBSERVABILITY })).toEqual(OBSERVABILITY)
    expect(pickObservability({ ok: false, error: { message: 'x' } })).toBeNull()
    expect(pickObservability({ summary: OBSERVABILITY.summary })).toBeNull()
    expect(pickObservability(null)).toBeNull()
  })

  it('file de retraitement : compteurs et derniers jobs, liste vide par défaut', () => {
    const queue = { queued: 1, running: 0, success: 3, failed: 2, total: 6 }
    expect(pickResyncFileQueue({ ok: true, queue })).toEqual({ queue, recentJobs: [] })
    expect(pickResyncFileQueue({ error: 'Forbidden' })).toBeNull()
  })
})

describe('échecs de la file de récupération PUBG', () => {
  it('ne garde que le dernier job de chaque partie, s’il a échoué', () => {
    const series = [
      job('j4', 'sm1', 'success', 1), // relancée puis réussie : plus un échec
      job('j3', 'sm2', 'failed', 2),
      job('j2', 'sm1', 'failed', 10),
      job('j1', 'sm2', 'failed', 20), // échec plus ancien de la même partie : une seule ligne
    ]
    expect(pubgFailures(series).map((failure) => failure.jobId)).toEqual(['j3'])
  })

  it('ignore les expirations chez PUBG (rien à relancer) et les jobs sans partie', () => {
    const series = [job('j2', 'sm1', 'failed', 1, { expired: true }), job('j1', null, 'failed', 2)]
    expect(pubgFailures(series)).toEqual([])
  })

  it('décrit l’échec : partie, date de fin, code et message', () => {
    expect(pubgFailures([job('j1', 'sm1', 'failed', 0)])).toEqual([
      {
        queue: 'pubg',
        jobId: 'j1',
        squadMatchId: 'sm1',
        pubgMatchId: 'pubg-sm1',
        sessionDate: null,
        at: '2026-10-11T20:00:00.000Z',
        code: 'TELEMETRY_FETCH_FAILED',
        message: 'PUBG indisponible',
      },
    ])
  })
})

describe('soirée d’un échec', () => {
  it('rattache l’échec à la soirée de sa partie (journée de jeu à Paris, de 06:00 à 06:00)', () => {
    const late = job('j1', 'sm1', 'failed', 0, { matchCreatedAt: '2026-10-21T23:40:00.000Z' })
    const evening = job('j2', 'sm2', 'failed', 0, { matchCreatedAt: '2026-10-21T19:30:00.000Z' })
    expect(pubgFailures([late, evening]).map((failure) => failure.queue === 'pubg' && failure.sessionDate)).toEqual([
      '2026-10-21',
      '2026-10-21',
    ])
  })
})

describe('échecs de la file de retraitement', () => {
  const now = Date.UTC(2026, 9, 11, 20, 0)
  const jobs = [
    { id: 'f1', status: 'failed', message: 'Fichier absent', createdAt: '2026-10-11T18:00:00.000Z', finishedAt: '2026-10-11T19:30:00.000Z' },
    { id: 'f2', status: 'failed', message: null, createdAt: '2026-10-01T18:00:00.000Z', finishedAt: null },
    { id: 'f3', status: 'success', message: null, createdAt: '2026-10-11T19:00:00.000Z', finishedAt: '2026-10-11T19:01:00.000Z' },
  ]

  it('jobs en échec seulement, filtrés sur la fenêtre (fin du job, sinon sa création)', () => {
    expect(fileFailures(jobs, '24h', now).map((failure) => failure.jobId)).toEqual(['f1'])
    expect(fileFailures(jobs, '30d', now).map((failure) => failure.jobId)).toEqual(['f1', 'f2'])
    expect(fileFailures(jobs, 'all', now).map((failure) => failure.at)).toEqual(['2026-10-11T19:30:00.000Z', '2026-10-01T18:00:00.000Z'])
  })
})

describe('relance', () => {
  it('parties pour la file PUBG (sans doublon), jobs pour la file de retraitement', () => {
    const failures: TelemetryFailure[] = [
      { queue: 'pubg', jobId: 'j1', squadMatchId: 'sm1', pubgMatchId: null, at: '', code: null, message: null },
      { queue: 'pubg', jobId: 'j2', squadMatchId: 'sm1', pubgMatchId: null, at: '', code: null, message: null },
      { queue: 'file', jobId: 'f1', at: '', code: null, message: null },
    ]
    expect(retryTargets(failures)).toEqual({ squadMatchIds: ['sm1'], jobIds: ['f1'] })
  })

  it('au plus 50 par file, comme les routes de relance', () => {
    const failures: TelemetryFailure[] = Array.from({ length: 70 }, (_, index) => ({
      queue: 'file' as const,
      jobId: `f${index}`,
      at: '',
      code: null,
      message: null,
    }))
    expect(retryTargets(failures).jobIds).toHaveLength(RETRY_BATCH_MAX)
    expect(RETRY_BATCH_MAX).toBe(50)
  })
})

describe('formats', () => {
  it('pourcentages et durées à la française, tiret quand la valeur manque', () => {
    expect(formatPercent(66.666)).toBe('66,7 %')
    expect(formatPercent(null)).toBe('—')
    expect(formatMilliseconds(850)).toBe('850 ms')
    expect(formatMilliseconds(12_340)).toBe('12,3 s')
    expect(formatMilliseconds(0)).toBe('—')
  })
})
