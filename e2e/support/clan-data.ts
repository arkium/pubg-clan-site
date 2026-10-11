import type { ApiMock } from './api'
import { CLAN_ID } from './data'
import { mockClanMatches } from './pages'
import { mockMemberSession } from './session'

/**
 * « Données » d'un clan (e2e/clan-data.spec.ts, docs/TODO/administration.md §8) : session SuperUser, santé, files du
 * worker, observabilité, couverture et échecs simulés. Les mises en file et relances sont notées, jamais exécutées.
 */

const base = `/api/clans/${CLAN_ID}`
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()

function liveJob(id: string, squadMatchId: string, status: 'success' | 'failed', minutesAgo: number, expired = false) {
  return {
    id,
    squadMatchId,
    pubgMatchId: `pubg-${squadMatchId}`,
    startedAt: at(minutesAgo),
    finishedAt: at(minutesAgo),
    durationMs: 4200,
    status,
    expired,
    errorCode: status === 'failed' ? (expired ? 'TELEMETRY_DATA_EXPIRED' : 'TELEMETRY_FETCH_FAILED') : null,
    errorMessage: status === 'failed' ? (expired ? 'Fichier expiré chez PUBG' : 'PUBG a répondu 503') : null,
    bytesDownloaded: 2_400_000,
  }
}

function observability() {
  const series = [
    liveJob('live-3', 'sm-ok', 'success', 30),
    liveJob('live-2', 'sm-ko', 'failed', 60),
    liveJob('live-1', 'sm-old', 'failed', 90, true),
  ]
  return {
    ok: true,
    summary: { runs: 3, success: 1, failed: 1, expired: 1, bytesDownloaded: 7_200_000 },
    health: {
      ratedRuns: 2,
      successRate: 50,
      failedRate: 50,
      thresholds: { failedRateMax: 5, durationP95MaxMs: 15_000 },
      alerts: [
        { key: 'failed_rate', label: 'Taux jobs en echec', value: 50, threshold: 5, status: 'warning' },
        { key: 'duration_p95_ms', label: 'Latence job p95', value: 4200, threshold: 15_000, status: 'ok' },
      ],
    },
    latency: { p95DurationMs: 4200 },
    series,
  }
}

function resyncFileQueue() {
  return {
    ok: true,
    clanId: CLAN_ID,
    queue: { queued: 0, running: 0, success: 12, failed: 1, total: 13 },
    recentJobs: [
      { id: 'file-job-1', status: 'failed', message: 'Fichier capturé introuvable', createdAt: at(120), startedAt: at(120), finishedAt: at(119), duration: 60 },
      { id: 'file-job-2', status: 'success', message: null, createdAt: at(200), startedAt: at(200), finishedAt: at(199), duration: 60 },
    ],
  }
}

function recoveries() {
  return {
    ok: true,
    clanId: CLAN_ID,
    clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' },
    limit: 150,
    summary: { total: 1, success: 1, failed: 0, expired: 0, pending: 0, withParsedPayload: 1 },
    backlog: {
      clanId: CLAN_ID,
      clanName: 'Clan Démo',
      clanTag: 'DEMO',
      totalMatches: 120,
      completedMatches: 100,
      expiredMatches: 10,
      recoverableBacklog: 10,
      urgentBacklog: 3,
      inQueueCount: 2,
      toQueueCount: 8,
      completionRate: 90.9,
    },
    rows: [
      {
        id: 'telemetry-1',
        squadMatchId: 'sm-ok',
        pubgMatchId: 'pubg-sm-ok',
        gameMode: 'squad-fpp',
        mapName: 'Erangel',
        placement: 2,
        squadCreatedAt: at(24 * 60),
        status: 'success',
        parserVersion: 'v1',
        parsedAt: at(23 * 60),
        sourceGeneratedAt: null,
        contentLength: 2_400_000,
        bytesDownloaded: 2_400_000,
        errorCode: null,
        errorMessage: null,
        createdAt: at(23 * 60),
        updatedAt: at(23 * 60),
        hasParsedPayload: true,
      },
    ],
  }
}

export type ClanDataCalls = { enqueued: unknown[]; deadLetter: unknown[] }

export function mockClanData(api: ApiMock): ClanDataCalls {
  const calls: ClanDataCalls = { enqueued: [], deadLetter: [] }
  mockMemberSession(api, { superUser: true })
  mockClanMatches(api)
  api
    .on('GET', `${base}/settings/data-health`, {
      body: {
        windowDays: 30,
        totalMatches: 48,
        withTelemetry: 41,
        expired: 2,
        missing: 7,
        lastTelemetryAt: at(30),
        queuedJobs: 3,
        failedJobsLast7Days: 1,
        resync: { used: 0, limit: 50, remaining: 50, resetsAt: null },
      },
    })
    .on('GET', `${base}/telemetry/observability`, { body: observability() })
    .on('GET', `${base}/telemetry/sync-batch-manual`, { body: resyncFileQueue() })
    .on('GET', `${base}/telemetry/recoveries`, { body: recoveries() })
    .on('POST', `${base}/telemetry/sync-selected-enqueue`, (_url, request) => {
      calls.enqueued.push(request.postDataJSON())
      return { body: { ok: true, clanId: CLAN_ID, requestedCount: 1, queuedCount: 1, alreadyQueuedCount: 0, skippedCount: 0, results: [] } }
    })
    .on('POST', `${base}/telemetry/dead-letter`, (_url, request) => {
      calls.deadLetter.push(request.postDataJSON())
      return { body: { ok: true, clanId: CLAN_ID, jobsRetried: 1, newQueuedCount: 1 } }
    })
  return calls
}
