import 'server-only'

import { prisma } from '@/lib/prisma'
import { TELEMETRY_LIVE_SYNC_QUEUE_ACTION } from '@/lib/pubg-telemetry/live-sync-queue'

/**
 * « Santé des données » d'un clan (docs/TODO/administration.md §8 ; SuperUser seul) : couverture de la télémétrie des
 * parties récentes et file de récupération PUBG du clan. La resynchronisation rapide plafonnée (Q17) a été retirée le
 * 2026-10-12 : même sélection que « Mettre en file le backlog » de Récupérations, jamais utilisée.
 */

const HEALTH_WINDOW_DAYS = 30

const clanMatchFilter = (clanId: number) => ({ members: { some: { member: { clanId } } } })

export async function getClanDataHealth(clanId: number) {
  const now = new Date()
  const since = new Date(now.getTime() - HEALTH_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const failedSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const window = { createdAt: { gte: since }, matchType: { not: 'airoyale' }, ...clanMatchFilter(clanId) }

  const [totalMatches, withTelemetry, expired, lastSuccess, queuedJobs, failedJobs] = await Promise.all([
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
  ])

  return {
    windowDays: HEALTH_WINDOW_DAYS,
    totalMatches,
    withTelemetry,
    expired,
    missing: Math.max(0, totalMatches - withTelemetry - expired),
    lastTelemetryAt: lastSuccess?.parsedAt.toISOString() ?? null,
    queuedJobs,
    failedJobsLast7Days: failedJobs,
  }
}
