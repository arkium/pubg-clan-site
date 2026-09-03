import { z } from 'zod'

import {
  ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
} from '@/lib/encountered-player-resolution-constants'
import {
  getEncounteredPlayerResolutionBatchSize,
  getEncounteredPlayerResolutionBatchSizeBounds,
  isEncounteredPlayerResolutionEnabled,
  setEncounteredPlayerResolutionBatchSize,
  setEncounteredPlayerResolutionEnabled,
} from '@/lib/encountered-player-resolution-config-service'
import { buildStatusWhereClause } from '@/lib/encountered-player-status'
import { describeCronExpression, getCronWorkerRuntimeStatus } from '@/lib/cron-observability'
import { getEffectiveCronSchedules } from '@/lib/cron-jobs'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'

const UpdateConfigSchema = z
  .object({
    batchSize: z.number().int().positive().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((data) => data.batchSize !== undefined || data.enabled !== undefined, {
    message: 'batchSize ou enabled requis',
  })

const RECENT_RUNS_TAKE = 20
const LAST_24H_MS = 24 * 60 * 60 * 1000

function estimateRunsPerDay(expression: string): number | null {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) {
    return null
  }

  const [minute] = parts
  const everyNMinutes = minute.match(/^\*\/(\d+)$/)
  if (everyNMinutes) {
    const step = Number(everyNMinutes[1])
    return step > 0 ? Math.floor((24 * 60) / step) : null
  }

  if (minute === '*') {
    return 24 * 60
  }

  return 1
}

async function buildQuickPayload() {
  const [batchSize, enabled, schedules, latestRun, recentRuns, cronWorker] = await Promise.all([
    getEncounteredPlayerResolutionBatchSize(),
    isEncounteredPlayerResolutionEnabled(),
    getEffectiveCronSchedules(),
    prisma.encounteredPlayerResolutionRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.encounteredPlayerResolutionRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: RECENT_RUNS_TAKE,
    }),
    getCronWorkerRuntimeStatus(),
  ])

  const cronSchedule = schedules.find((entry) => entry.key === 'encountered_player_clan_resolution')

  return {
    config: {
      batchSize,
      bounds: getEncounteredPlayerResolutionBatchSizeBounds(),
      enabled,
    },
    cron: cronSchedule
      ? {
          expression: cronSchedule.expression,
          source: cronSchedule.source,
          description: describeCronExpression(cronSchedule.expression),
        }
      : null,
    latestRun,
    recentRuns,
    worker: {
      webWorker: { cronJobsEnabled: process.env.ENABLE_CRON_JOBS === 'true' },
      cronWorker,
    },
  }
}

async function buildBacklogPayload(batchSize: number, enabled: boolean, cronExpression: string | null) {
  const thresholds = {
    minEncounters: ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
    maxAttempts: ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  }

  const last24hCutoff = new Date(Date.now() - LAST_24H_MS)

  const [
    neverAttempted,
    retryPending,
    failed,
    resolvedWithClan,
    resolvedWithoutClan,
    resolvedWithClanLast24h,
    resolvedWithoutClanLast24h,
    last24hRuns,
  ] = await Promise.all([
    prisma.encounteredPlayer.count({ where: buildStatusWhereClause('never_attempted', thresholds) }),
    prisma.encounteredPlayer.count({ where: buildStatusWhereClause('retry_pending', thresholds) }),
    prisma.encounteredPlayer.count({ where: buildStatusWhereClause('failed', thresholds) }),
    prisma.encounteredPlayer.count({ where: buildStatusWhereClause('resolved_with_clan', thresholds) }),
    prisma.encounteredPlayer.count({ where: buildStatusWhereClause('resolved_without_clan', thresholds) }),
    prisma.encounteredPlayer.count({
      where: { clanResolvedAt: { gte: last24hCutoff }, pubgClanTag: { not: null } },
    }),
    prisma.encounteredPlayer.count({
      where: { clanResolvedAt: { gte: last24hCutoff }, pubgClanTag: null },
    }),
    prisma.encounteredPlayerResolutionRun.findMany({
      where: { startedAt: { gte: last24hCutoff } },
      select: { failed: true },
    }),
  ])

  const failedLast24h = last24hRuns.reduce((sum, run) => sum + run.failed, 0)
  const runsPerDay = cronExpression ? estimateRunsPerDay(cronExpression) : null
  const backlogToCatchUp = neverAttempted + retryPending
  const estimatedCatchUpDays =
    enabled && runsPerDay && runsPerDay > 0 && batchSize > 0
      ? backlogToCatchUp / (batchSize * runsPerDay)
      : null

  return {
    thresholds,
    backlog: {
      neverAttempted,
      retryPending,
      failed,
      resolvedWithClan,
      resolvedWithoutClan,
    },
    resolutionsLast24h: {
      withClan: resolvedWithClanLast24h,
      withoutClan: resolvedWithoutClanLast24h,
      failed: failedLast24h,
    },
    estimatedCatchUpDays,
  }
}

export async function GET(request: Request) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) {
    return permissionError
  }

  const url = new URL(request.url)
  const mode = url.searchParams.get('mode') // 'quick' | 'backlog' | null

  if (mode === 'quick') {
    const quickPayload = await buildQuickPayload()
    return Response.json({ data: quickPayload })
  }

  if (mode === 'backlog') {
    const [batchSize, enabled, schedules] = await Promise.all([
      getEncounteredPlayerResolutionBatchSize(),
      isEncounteredPlayerResolutionEnabled(),
      getEffectiveCronSchedules(),
    ])
    const cronSchedule = schedules.find((entry) => entry.key === 'encountered_player_clan_resolution')
    const backlogPayload = await buildBacklogPayload(
      batchSize,
      enabled,
      cronSchedule ? cronSchedule.expression : null
    )
    return Response.json({ data: backlogPayload })
  }

  // Full payload without the 28-second unindexed groupBy
  const quick = await buildQuickPayload()
  const backlog = await buildBacklogPayload(
    quick.config.batchSize,
    quick.config.enabled,
    quick.cron ? quick.cron.expression : null
  )

  return Response.json({
    data: {
      ...quick,
      ...backlog,
      crossClan: {
        uniqueIdentitiesRemaining: backlog.backlog.neverAttempted + backlog.backlog.retryPending,
        pendingRowCount: backlog.backlog.neverAttempted + backlog.backlog.retryPending + backlog.backlog.failed,
        crossClanPlayerCount: 0,
        avgRowsResolvedPerApiCall: null,
      },
    },
  })
}

export async function POST(request: Request) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) {
    return permissionError
  }

  const body = (await request.json().catch(() => null)) as unknown
  const validated = UpdateConfigSchema.safeParse(body)

  if (!validated.success) {
    return Response.json(
      { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  if (validated.data.batchSize !== undefined) {
    await setEncounteredPlayerResolutionBatchSize(validated.data.batchSize)
  }

  if (validated.data.enabled !== undefined) {
    await setEncounteredPlayerResolutionEnabled(validated.data.enabled)
  }

  const quick = await buildQuickPayload()
  return Response.json({ data: quick })
}
