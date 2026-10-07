import 'server-only'

import { prisma } from '@/lib/prisma'
import { TELEMETRY_LIVE_SYNC_QUEUE_ACTION } from '@/lib/pubg-telemetry/live-sync-queue'
import { enqueueTelemetryForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'

/**
 * « Santé des données » d'un clan pour son Owner (docs/TODO/administration.md Q17, lot 3b) : état de la télémétrie en
 * lecture seule et demande de resynchronisation plafonnée — 50 parties par 24 h et par clan, mises en file à basse
 * priorité, sans appel PUBG dans la requête ni réordonnancement de la file commune.
 *
 * Le plafond se compte dans un registre `AppConfig` par clan (`owner_resync_ledger:<clanId>`) : le worker réécrit
 * `source` et `details` des jobs, qui ne gardent donc pas la trace de leur origine. Le registre note aussi l'auteur.
 */

export const OWNER_RESYNC_LIMIT = 50
export const OWNER_RESYNC_WINDOW_MS = 24 * 60 * 60 * 1000
const HEALTH_WINDOW_DAYS = 30
const RESYNC_LOOKBACK_DAYS = 14

export type OwnerResyncLedgerEntry = { at: string; count: number; userId: number }

export function ownerResyncLedgerKey(clanId: number) {
  return `owner_resync_ledger:${clanId}`
}

export function parseOwnerResyncLedger(raw: string | null): OwnerResyncLedgerEntry[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is OwnerResyncLedgerEntry =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as OwnerResyncLedgerEntry).at === 'string' &&
        Number.isFinite((entry as OwnerResyncLedgerEntry).count) &&
        Number.isFinite((entry as OwnerResyncLedgerEntry).userId)
    )
  } catch {
    return []
  }
}

/** Quota restant sur la fenêtre glissante, et date à laquelle la plus ancienne demande comptée en sort. */
export function computeOwnerResyncQuota(ledger: readonly OwnerResyncLedgerEntry[], now = new Date()) {
  const since = now.getTime() - OWNER_RESYNC_WINDOW_MS
  const recent = ledger.filter((entry) => new Date(entry.at).getTime() > since)
  const used = recent.reduce((sum, entry) => sum + entry.count, 0)
  const oldest = recent.reduce<number | null>((min, entry) => {
    const at = new Date(entry.at).getTime()
    return min === null || at < min ? at : min
  }, null)
  return {
    used,
    limit: OWNER_RESYNC_LIMIT,
    remaining: Math.max(0, OWNER_RESYNC_LIMIT - used),
    resetsAt: oldest === null ? null : new Date(oldest + OWNER_RESYNC_WINDOW_MS).toISOString(),
    recent,
  }
}

async function readLedger(clanId: number) {
  const record = await prisma.appConfig.findUnique({ where: { key: ownerResyncLedgerKey(clanId) }, select: { value: true } })
  return parseOwnerResyncLedger(record?.value ?? null)
}

const clanMatchFilter = (clanId: number) => ({ members: { some: { member: { clanId } } } })

export async function getClanDataHealth(clanId: number) {
  const now = new Date()
  const since = new Date(now.getTime() - HEALTH_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const failedSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const window = { createdAt: { gte: since }, matchType: { not: 'airoyale' }, ...clanMatchFilter(clanId) }

  const [totalMatches, withTelemetry, expired, lastSuccess, queuedJobs, failedJobs, ledger] = await Promise.all([
    prisma.squadMatch.count({ where: window }),
    prisma.squadMatch.count({ where: { ...window, telemetry: { is: { status: 'success' } } } }),
    prisma.squadMatch.count({ where: { ...window, telemetry: { is: { errorCode: 'TELEMETRY_DATA_EXPIRED' } } } }),
    prisma.squadMatchTelemetry.findFirst({
      where: { status: 'success', squadMatch: clanMatchFilter(clanId) },
      orderBy: { parsedAt: 'desc' },
      select: { parsedAt: true },
    }),
    prisma.cronExecution.count({
      where: { clanId, action: TELEMETRY_LIVE_SYNC_QUEUE_ACTION, status: { in: ['queued', 'running'] } },
    }),
    prisma.cronExecution.count({
      where: { clanId, action: TELEMETRY_LIVE_SYNC_QUEUE_ACTION, status: 'failed', finishedAt: { gte: failedSince } },
    }),
    readLedger(clanId),
  ])

  const quota = computeOwnerResyncQuota(ledger, now)
  return {
    windowDays: HEALTH_WINDOW_DAYS,
    totalMatches,
    withTelemetry,
    expired,
    missing: Math.max(0, totalMatches - withTelemetry - expired),
    lastTelemetryAt: lastSuccess?.parsedAt.toISOString() ?? null,
    queuedJobs,
    failedJobsLast7Days: failedJobs,
    resync: { used: quota.used, limit: quota.limit, remaining: quota.remaining, resetsAt: quota.resetsAt },
  }
}

/**
 * Met en file, à basse priorité, jusqu'au quota restant des parties récentes du clan sans télémétrie (les plus récentes
 * d'abord, celles dont la télémétrie a expiré chez PUBG exclues), puis l'inscrit au registre.
 */
export async function requestOwnerResync(clanId: number, userId: number) {
  const ledger = await readLedger(clanId)
  const quota = computeOwnerResyncQuota(ledger)
  if (quota.remaining === 0) {
    return { queuedCount: 0, remaining: 0, resetsAt: quota.resetsAt, reason: 'quota' as const }
  }

  const activeJobs = await prisma.cronExecution.findMany({
    where: { clanId, action: TELEMETRY_LIVE_SYNC_QUEUE_ACTION, status: { in: ['queued', 'running'] } },
    select: { details: true },
    take: 2000,
  })
  const alreadyQueued = new Set(
    activeJobs
      .map((job) => (job.details && typeof job.details === 'object' && !Array.isArray(job.details) ? job.details.squadMatchId : null))
      .filter((id): id is string => typeof id === 'string')
  )

  const since = new Date(Date.now() - RESYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const candidates = await prisma.squadMatch.findMany({
    where: {
      createdAt: { gte: since },
      matchType: { not: 'airoyale' },
      ...clanMatchFilter(clanId),
      ...(alreadyQueued.size > 0 ? { id: { notIn: [...alreadyQueued] } } : {}),
      OR: [
        { telemetry: null },
        {
          telemetry: {
            is: {
              status: { not: 'success' },
              OR: [{ errorCode: null }, { errorCode: { not: 'TELEMETRY_DATA_EXPIRED' } }],
            },
          },
        },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: quota.remaining,
  })

  if (candidates.length === 0) {
    return { queuedCount: 0, remaining: quota.remaining, resetsAt: quota.resetsAt, reason: 'nothing-to-sync' as const }
  }

  const result = await enqueueTelemetryForSelectedSquadMatches(
    clanId,
    candidates.map((match) => match.id),
    userId,
    { priority: 'low' }
  )

  const now = new Date()
  const nextLedger = [...quota.recent, { at: now.toISOString(), count: result.queuedCount, userId }]
  const value = JSON.stringify(nextLedger)
  await prisma.appConfig.upsert({
    where: { key: ownerResyncLedgerKey(clanId) },
    update: { value },
    create: { key: ownerResyncLedgerKey(clanId), value },
  })

  const after = computeOwnerResyncQuota(nextLedger, now)
  return { queuedCount: result.queuedCount, remaining: after.remaining, resetsAt: after.resetsAt, reason: null }
}
