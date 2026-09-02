import 'server-only'
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { TELEMETRY_LIVE_SYNC_QUEUE_ACTION } from '@/lib/pubg-telemetry/live-sync-queue'
import { enqueueTelemetryForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'

export type ClanBacklogStat = {
  clanId: number
  clanName: string
  clanTag: string
  totalMatches: number
  completedMatches: number
  expiredMatches: number
  recoverableBacklog: number
  urgentBacklog: number
  inQueueCount: number
  toQueueCount: number
  completionRate: number | null
}

export type GlobalBacklogSummary = {
  totalMatches: number
  completedMatches: number
  expiredMatches: number
  recoverableBacklog: number
  urgentBacklog: number
  inQueueCount: number
  toQueueCount: number
  completionRate: number | null
  clans: ClanBacklogStat[]
  auditedAt: string
}

function parseSquadMatchIdFromDetails(details: Prisma.JsonValue | null): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null
  }
  const record = details as Record<string, unknown>
  const squadMatchId = record.squadMatchId
  return typeof squadMatchId === 'string' && squadMatchId.trim().length > 0
    ? squadMatchId.trim()
    : null
}

export async function getTelemetryBacklogSummary(): Promise<GlobalBacklogSummary> {
  // 1. Récupérer les jobs actuellement en file ou en cours
  const activeJobs = await prisma.cronExecution.findMany({
    where: {
      action: TELEMETRY_LIVE_SYNC_QUEUE_ACTION,
      status: { in: ['queued', 'running'] },
    },
    select: { clanId: true, details: true },
    take: 5000,
  })

  const queuedMatchIdsByClan = new Map<number, Set<string>>()
  const allQueuedMatchIds = new Set<string>()

  for (const job of activeJobs) {
    const squadMatchId = parseSquadMatchIdFromDetails(job.details)
    if (squadMatchId) {
      allQueuedMatchIds.add(squadMatchId)
      if (typeof job.clanId === 'number') {
        const set = queuedMatchIdsByClan.get(job.clanId) ?? new Set<string>()
        set.add(squadMatchId)
        queuedMatchIdsByClan.set(job.clanId, set)
      }
    }
  }

  // 2. Requête SQL d'agrégation haute performance groupée par clan
  const rows = await prisma.$queryRaw<
    Array<{
      clanId: number
      totalMatches: number
      completedMatches: number
      expiredMatches: number
      recoverableBacklog: number
      urgentBacklog: number
    }>
  >(Prisma.sql`
    SELECT
      pairs.clanId AS clanId,
      COUNT(DISTINCT sm.id) AS totalMatches,
      COUNT(DISTINCT CASE
        WHEN t.status = 'success' THEN sm.id
      END) AS completedMatches,
      COUNT(DISTINCT CASE
        WHEN (t.status = 'failed' AND t.errorCode = 'TELEMETRY_DATA_EXPIRED')
          OR (t.status != 'success' AND sm.createdAt < DATE_SUB(NOW(), INTERVAL 14 DAY))
          OR (t.id IS NULL AND sm.createdAt < DATE_SUB(NOW(), INTERVAL 14 DAY)) THEN sm.id
      END) AS expiredMatches,
      COUNT(DISTINCT CASE
        WHEN sm.createdAt >= DATE_SUB(NOW(), INTERVAL 14 DAY)
          AND (
            t.id IS NULL
            OR (t.status != 'success' AND (t.errorCode IS NULL OR t.errorCode != 'TELEMETRY_DATA_EXPIRED'))
          ) THEN sm.id
      END) AS recoverableBacklog,
      COUNT(DISTINCT CASE
        WHEN sm.createdAt >= DATE_SUB(NOW(), INTERVAL 14 DAY)
          AND sm.createdAt < DATE_SUB(NOW(), INTERVAL 7 DAY)
          AND (
            t.id IS NULL
            OR (t.status != 'success' AND (t.errorCode IS NULL OR t.errorCode != 'TELEMETRY_DATA_EXPIRED'))
          ) THEN sm.id
      END) AS urgentBacklog
    FROM (
      SELECT DISTINCT cm.clanId AS clanId, sdm.squadMatchId AS squadMatchId
      FROM SquadMember sdm
      INNER JOIN ClanMember cm ON cm.id = sdm.memberId
      WHERE cm.clanId IS NOT NULL
    ) pairs
    INNER JOIN SquadMatch sm ON sm.id = pairs.squadMatchId AND sm.matchType != 'airoyale'
    LEFT JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    GROUP BY pairs.clanId
  `)

  const clanIds = rows.map((r) => Number(r.clanId))
  const clans =
    clanIds.length > 0
      ? await prisma.clan.findMany({
          where: { id: { in: clanIds } },
          select: { id: true, name: true, tag: true },
        })
      : []
  const clanMap = new Map(clans.map((c) => [c.id, c]))

  let globalTotal = 0
  let globalCompleted = 0
  let globalExpired = 0
  let globalRecoverable = 0
  let globalUrgent = 0

  const clanStats: ClanBacklogStat[] = rows.map((row) => {
    const clanId = Number(row.clanId)
    const clan = clanMap.get(clanId)
    const totalMatches = Number(row.totalMatches || 0)
    const completedMatches = Number(row.completedMatches || 0)
    const expiredMatches = Number(row.expiredMatches || 0)
    const recoverableBacklog = Number(row.recoverableBacklog || 0)
    const urgentBacklog = Number(row.urgentBacklog || 0)

    const clanQueuedSet = queuedMatchIdsByClan.get(clanId)
    const inQueueCount = clanQueuedSet ? clanQueuedSet.size : 0
    const toQueueCount = Math.max(0, recoverableBacklog - inQueueCount)

    globalTotal += totalMatches
    globalCompleted += completedMatches
    globalExpired += expiredMatches
    globalRecoverable += recoverableBacklog
    globalUrgent += urgentBacklog

    // Dénominateur de complétion : matchs vivants ou complétés (hors historique expiré non récupérable)
    const denominator = totalMatches - expiredMatches
    const completionRate =
      denominator > 0 ? Math.min(100, Math.round((completedMatches / denominator) * 1000) / 10) : null

    return {
      clanId,
      clanName: clan?.name ?? `Clan #${clanId}`,
      clanTag: clan?.tag ?? '',
      totalMatches,
      completedMatches,
      expiredMatches,
      recoverableBacklog,
      urgentBacklog,
      inQueueCount,
      toQueueCount,
      completionRate,
    }
  })

  // Trier par volume de backlog à récupérer décroissant, puis par total
  clanStats.sort((a, b) => b.recoverableBacklog - a.recoverableBacklog || b.totalMatches - a.totalMatches)

  const globalInQueue = allQueuedMatchIds.size
  const globalToQueue = Math.max(0, globalRecoverable - globalInQueue)
  const globalDenominator = globalTotal - globalExpired
  const globalCompletionRate =
    globalDenominator > 0
      ? Math.min(100, Math.round((globalCompleted / globalDenominator) * 1000) / 10)
      : null

  return {
    totalMatches: globalTotal,
    completedMatches: globalCompleted,
    expiredMatches: globalExpired,
    recoverableBacklog: globalRecoverable,
    urgentBacklog: globalUrgent,
    inQueueCount: globalInQueue,
    toQueueCount: globalToQueue,
    completionRate: globalCompletionRate,
    clans: clanStats,
    auditedAt: new Date().toISOString(),
  }
}

export type EnqueueBacklogOptions = {
  clanId?: number
  urgentOnly?: boolean
  limit?: number
  triggeredBy?: number | null
}

export async function enqueueTelemetryBacklog(options: EnqueueBacklogOptions = {}) {
  const limit = Math.min(Math.max(options.limit ?? 250, 1), 500)
  const now = new Date()
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // 1. Récupérer les IDs déjà en file pour ne pas les ré-interroger inutilement
  const activeJobs = await prisma.cronExecution.findMany({
    where: {
      action: TELEMETRY_LIVE_SYNC_QUEUE_ACTION,
      status: { in: ['queued', 'running'] },
      ...(typeof options.clanId === 'number' ? { clanId: options.clanId } : {}),
    },
    select: { details: true },
    take: 5000,
  })

  const alreadyInQueue = new Set<string>()
  for (const job of activeJobs) {
    const squadMatchId = parseSquadMatchIdFromDetails(job.details)
    if (squadMatchId) alreadyInQueue.add(squadMatchId)
  }

  // 2. Trouver les matchs éligibles au backlog
  const candidateMatches = await prisma.squadMatch.findMany({
    where: {
      matchType: { not: 'airoyale' },
      createdAt: options.urgentOnly
        ? { gte: fourteenDaysAgo, lt: sevenDaysAgo }
        : { gte: fourteenDaysAgo },
      ...(alreadyInQueue.size > 0 ? { id: { notIn: Array.from(alreadyInQueue) } } : {}),
      OR: [
        { telemetry: null },
        {
          telemetry: {
            is: {
              status: { not: 'success' },
              OR: [
                { errorCode: null },
                { errorCode: { not: 'TELEMETRY_DATA_EXPIRED' } },
              ],
            },
          },
        },
      ],
      ...(typeof options.clanId === 'number'
        ? {
            members: {
              some: {
                member: {
                  clanId: options.clanId,
                },
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      createdAt: true,
      members: {
        select: {
          member: {
            select: {
              clanId: true,
            },
          },
        },
      },
    },
    orderBy: options.urgentOnly ? { createdAt: 'asc' } : { createdAt: 'desc' },
    take: limit,
  })

  if (candidateMatches.length === 0) {
    return {
      requestedCount: 0,
      queuedCount: 0,
      alreadyQueuedCount: 0,
      skippedCount: 0,
      clansCount: 0,
    }
  }

  // 3. Grouper par clan
  const matchesByClan = new Map<number, string[]>()
  for (const match of candidateMatches) {
    const targetClanId =
      options.clanId ??
      match.members.find((m) => typeof m.member.clanId === 'number')?.member.clanId

    if (typeof targetClanId === 'number') {
      const list = matchesByClan.get(targetClanId) ?? []
      list.push(match.id)
      matchesByClan.set(targetClanId, list)
    }
  }

  let totalQueued = 0
  let totalAlreadyQueued = 0
  let totalSkipped = 0

  for (const [clanId, matchIds] of matchesByClan) {
    const res = await enqueueTelemetryForSelectedSquadMatches(
      clanId,
      matchIds,
      options.triggeredBy
    )
    totalQueued += res.queuedCount
    totalAlreadyQueued += res.alreadyQueuedCount
    totalSkipped += res.skippedCount
  }

  return {
    requestedCount: candidateMatches.length,
    queuedCount: totalQueued,
    alreadyQueuedCount: totalAlreadyQueued,
    skippedCount: totalSkipped,
    clansCount: matchesByClan.size,
  }
}
