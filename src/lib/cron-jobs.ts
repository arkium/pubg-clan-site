import 'server-only'
import cron, { type ScheduledTask } from 'node-cron'

import { precomputeClanAwards } from '@/lib/awards-service'
import { precomputeClanMatchesStats } from '@/lib/matches-cache-service'
import { syncClanLifetimeStats, syncTrackedClanStats } from '@/lib/clan-service'
import { finishCronExecution, startCronExecution } from '@/lib/cron-observability'
import { getInternalApiBaseUrl, getInternalCronAuthHeaders } from '@/lib/internal-api'
import { prisma } from '@/lib/prisma'
import {
  fetchCurrentSeason,
  fetchPlayerClan,
  fetchPlayerRankedStats,
  fetchPlayerSeasonStats,
  fetchWeaponMastery,
  searchPlayerByName,
} from '@/lib/pubg'
import { listSquadMatchesNeedingTelemetry } from '@/lib/pubg-telemetry/backlog'
import { upsertFailedTelemetrySnapshot } from '@/lib/pubg-telemetry/index'
import { enqueueTelemetryLiveSyncJobs } from '@/lib/pubg-telemetry/live-sync-queue'
import { generateMonthlyReport, generateWeeklyReport } from '@/lib/report-generator'
import { recalculateStatsForClan } from '@/lib/stats-calculator'

const DAILY_SYNC_TIMEZONE = process.env.CLAN_MATCH_SYNC_TIMEZONE ?? 'UTC'
const MAX_SYNC_ATTEMPTS = 3

type TelemetryCronSyncSummary = {
  status: 'success' | 'partial' | 'failed' | 'skipped'
  reason: string
  scanned: number
  queuedCount: number
  alreadyQueuedCount: number
  skippedNoAccount: number
}

type NotificationService = {
  notifyInviteReminder: (memberId: number) => Promise<void>
  notifyReportReady: (reportId: string, memberId: number) => Promise<void>
}

type ChallengeService = {
  endChallenge: (challengeId: string) => Promise<void>
  refreshChallengeProgressForClan: (clanId: number) => Promise<void>
}

const globalForCron = globalThis as typeof globalThis & {
  clanSyncCronTask?: ScheduledTask
  clanSyncCronInitialized?: boolean
  clanSyncFailures?: Map<number, number>
  clanSyncInProgress?: boolean
  statsRecalcCronTask?: ScheduledTask
  statsRecalcInProgress?: boolean
  lifetimeStatsSyncCronTask?: ScheduledTask
  lifetimeStatsSyncInProgress?: boolean
  seasonStatsSyncCronTask?: ScheduledTask
  seasonStatsSyncInProgress?: boolean
  clanReminderCronTask?: ScheduledTask
  reportReminderCronTask?: ScheduledTask
  weeklyReportCronTask?: ScheduledTask
  monthlyReportCronTask?: ScheduledTask
  reportGenerationInProgress?: boolean
  challengeProcessingCronTask?: ScheduledTask
  challengeProcessingInProgress?: boolean
  encounteredPlayerResolutionCronTask?: ScheduledTask
  encounteredPlayerResolutionInProgress?: boolean
}

const ENCOUNTERED_PLAYER_RESOLUTION_BATCH_SIZE = 5
const ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION = 2
const ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS = 3
// Un joueur déjà résolu récemment via Player (par un autre clan suivi qui l'a
// croisé) n'est pas re-résolu par l'API — valeur de départ à ajuster après
// observation, les tags de clan changent rarement.
const PLAYER_CLAN_RESOLUTION_FRESHNESS_DAYS = 7

function isCronWorkerEnabled() {
  if (process.env.ENABLE_CRON_JOBS === 'true') {
    return true
  }

  if (process.env.ENABLE_CRON_JOBS === 'false') {
    return false
  }

  return process.env.NODE_ENV !== 'production'
}

function isTelemetrySyncEnabled() {
  return process.env.TELEMETRY_SYNC_ENABLED === 'true'
}

function getTelemetryMaxMatchesPerRun() {
  const value = Number(process.env.TELEMETRY_MAX_MATCHES_PER_RUN ?? '50')
  if (!Number.isFinite(value) || value <= 0) {
    return 50
  }

  return Math.min(Math.floor(value), 200)
}

function getTelemetryRetryMax() {
  const value = Number(process.env.TELEMETRY_RETRY_MAX ?? '2')
  if (!Number.isFinite(value) || value < 0) {
    return 2
  }

  return Math.min(Math.floor(value), 5)
}

function getFailureTracker() {
  if (!globalForCron.clanSyncFailures) {
    globalForCron.clanSyncFailures = new Map<number, number>()
  }

  return globalForCron.clanSyncFailures
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadNotificationService(): Promise<NotificationService> {
  const load = new Function(
    'return import("./notification-service")'
  ) as () => Promise<NotificationService>
  return load()
}

async function loadChallengeService(): Promise<ChallengeService> {
  const load = new Function(
    'return import("./challenge-service")'
  ) as () => Promise<ChallengeService>
  return load()
}

async function triggerClanSync(clanId: number) {
  const response = await fetch(
    `${getInternalApiBaseUrl()}/api/clans/${clanId}/sync-matches`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...getInternalCronAuthHeaders(),
      },
    }
  )

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : typeof payload?.message === 'string'
          ? payload.message
          : `${response.status} ${response.statusText}`.trim()
    throw new Error(message)
  }

  return payload as {
    clanId: number
    clanName: string
    status?: 'success' | 'partial'
    importedCount?: number
    importedMatches?: number
    membersProcessed: number
    errorsCount?: number
    errorsPreview?: string[]
    errors?: string[]
    logs?: string[]
    memberResults?: Array<{
      memberId: number
      memberName: string
      importedMatches: number
    }>
  } | null
}

async function syncClanWithRetry(clanId: number, clanName: string) {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt += 1) {
    try {
      console.info(
        `[Cron] Syncing clan "${clanName}" (${clanId}) - attempt ${attempt}/${MAX_SYNC_ATTEMPTS}`
      )
      const result = await triggerClanSync(clanId)

      return result
    } catch (error) {
      lastError = error
      console.error(
        `[Cron] Clan sync attempt ${attempt}/${MAX_SYNC_ATTEMPTS} failed for "${clanName}" (${clanId})`,
        error
      )

      if (attempt < MAX_SYNC_ATTEMPTS) {
        await wait(attempt * 1000)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Clan sync failed')
}

async function runTelemetryBatchForClan(clanId: number): Promise<TelemetryCronSyncSummary> {
  if (!isTelemetrySyncEnabled()) {
    return {
      status: 'skipped',
      reason: 'telemetry_sync_disabled',
      scanned: 0,
      queuedCount: 0,
      alreadyQueuedCount: 0,
      skippedNoAccount: 0,
    }
  }

  try {
    const parserVersion = process.env.TELEMETRY_PARSER_VERSION?.trim() || 'v1'
    const backlog = await listSquadMatchesNeedingTelemetry(getTelemetryMaxMatchesPerRun(), {
      clanId,
      parserVersion,
      retryMax: getTelemetryRetryMax(),
    })

    const matchesToQueue: {
      squadMatchId: string
      pubgMatchId: string
      anyPlayerId: string
      shard: string
    }[] = []
    let skippedNoAccount = 0

    for (const match of backlog) {
      const candidateMember = match.members.find((entry) => !!entry.member.pubgAccountId)

      if (!candidateMember?.member.pubgAccountId) {
        await upsertFailedTelemetrySnapshot({
          squadMatchId: match.id,
          parserVersion,
          errorCode: 'PUBG_ACCOUNT_ID_MISSING',
          errorMessage: 'No clan member with PUBG account id found for this squad match',
        })
        skippedNoAccount += 1
        continue
      }

      matchesToQueue.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        anyPlayerId: candidateMember.member.pubgAccountId,
        shard: candidateMember.member.platformShard,
      })
    }

    const enqueueResult = await enqueueTelemetryLiveSyncJobs({
      clanId,
      matches: matchesToQueue,
    })

    return {
      status: 'success',
      reason: backlog.length > 0 ? 'batch_queued' : 'no_match_to_process',
      scanned: backlog.length,
      queuedCount: enqueueResult.queuedCount,
      alreadyQueuedCount: enqueueResult.alreadyQueuedCount,
      skippedNoAccount,
    }
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'telemetry_batch_failed',
      scanned: 0,
      queuedCount: 0,
      alreadyQueuedCount: 0,
      skippedNoAccount: 0,
    }
  }
}

async function recalculateStatsDaily() {
  if (globalForCron.statsRecalcInProgress) {
    console.warn('[Cron] Stats recalculation skipped because a previous run is still in progress')
    return
  }

  globalForCron.statsRecalcInProgress = true

  const startedAt = new Date()
  console.info(`[Cron] Daily stats recalculation started at ${startedAt.toISOString()}`)

  try {
    const activeClans = await prisma.clan.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    })

    if (activeClans.length === 0) {
      console.info('[Cron] No active clans found for stats recalculation')
      return
    }

    for (const clan of activeClans) {
      const execution = await startCronExecution({
        clanId: clan.id,
        action: 'daily_stats_recalc',
        source: 'scheduler',
      })

      try {
        await recalculateStatsForClan(clan.id)
        console.info(`[Cron] Stats recalculated for clan "${clan.name}" (${clan.id})`)

        try {
          await precomputeClanAwards(clan.id)
        } catch (awardsError) {
          console.warn(
            `[Cron] Failed to precompute awards cache for clan "${clan.name}" (${clan.id})`,
            awardsError
          )
        }

        try {
          await precomputeClanMatchesStats(clan.id)
        } catch (matchesCacheError) {
          console.warn(
            `[Cron] Failed to precompute matches cache for clan "${clan.name}" (${clan.id})`,
            matchesCacheError
          )
        }

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: 'success',
          message: `Stats recalculated for clan "${clan.name}"`,
        })
      } catch (error) {
        console.error(
          `[Cron] Failed to recalculate stats for clan "${clan.name}" (${clan.id})`,
          error
        )

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Stats recalculation failed',
        }).catch(() => undefined)
      }
    }

    const finishedAt = new Date()
    console.info(
      `[Cron] Daily stats recalculation finished at ${finishedAt.toISOString()} - processed ${activeClans.length} clans`
    )
  } catch (error) {
    console.error('[Cron] Daily stats recalculation failed before processing clans', error)
  } finally {
    globalForCron.statsRecalcInProgress = false
  }
}

async function syncLifetimeStatsDaily() {
  if (globalForCron.lifetimeStatsSyncInProgress) {
    console.warn('[Cron] Lifetime stats sync skipped because a previous run is still in progress')
    return
  }

  globalForCron.lifetimeStatsSyncInProgress = true

  const startedAt = new Date()
  console.info(`[Cron] Daily lifetime stats sync started at ${startedAt.toISOString()}`)

  try {
    const activeClans = await prisma.clan.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    })

    if (activeClans.length === 0) {
      console.info('[Cron] No active clans found for lifetime stats sync')
      return
    }

    for (const clan of activeClans) {
      const execution = await startCronExecution({
        clanId: clan.id,
        action: 'daily_lifetime_stats_sync',
        source: 'scheduler',
      })

      try {
        const result = await syncClanLifetimeStats(clan.id)
        const hasErrors = result.errors.length > 0

        console.info(
          `[Cron] Lifetime stats sync for clan "${clan.name}" (${clan.id}): ${result.refreshedCount}/${result.membersTotal} refreshed`
        )

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: hasErrors ? 'partial' : 'success',
          message: hasErrors
            ? `Lifetime sync partial: ${result.refreshedCount}/${result.membersTotal} refreshed, ${result.skippedCount} skipped`
            : `Lifetime sync completed: ${result.refreshedCount}/${result.membersTotal} refreshed`,
          details: {
            refreshedCount: result.refreshedCount,
            skippedCount: result.skippedCount,
            membersTotal: result.membersTotal,
            errorsPreview: result.errors.slice(0, 10),
          },
        })
      } catch (error) {
        console.error(
          `[Cron] Failed to sync lifetime stats for clan "${clan.name}" (${clan.id})`,
          error
        )

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Lifetime stats sync failed',
        }).catch(() => undefined)
      }
    }

    const finishedAt = new Date()
    console.info(
      `[Cron] Daily lifetime stats sync finished at ${finishedAt.toISOString()} - processed ${activeClans.length} clans`
    )
  } catch (error) {
    console.error('[Cron] Daily lifetime stats sync failed before processing clans', error)
  } finally {
    globalForCron.lifetimeStatsSyncInProgress = false
  }
}

async function syncClanSeasonStats(clanId: number) {
  const members = await prisma.clanMember.findMany({
    where: { clanId, isActive: true, joinStatus: 'active' },
    select: { id: true, pubgPlayerName: true, pubgAccountId: true, platformShard: true },
  })

  const errors: string[] = []
  let refreshedCount = 0

  const shardGroups = new Map<string, typeof members>()
  for (const member of members) {
    const shard = member.platformShard
    if (!shardGroups.has(shard)) shardGroups.set(shard, [])
    shardGroups.get(shard)!.push(member)
  }

  for (const [shard, shardMembers] of shardGroups) {
    const currentSeason = await fetchCurrentSeason(shard)
    if (!currentSeason) {
      errors.push(`No current season found for shard ${shard}`)
      continue
    }

    for (const member of shardMembers) {
      try {
        let playerId = member.pubgAccountId
        if (!playerId) {
          const player = await searchPlayerByName(member.pubgPlayerName, shard, {
            clanId,
            memberId: member.id,
          })
          if (!player?.accountId) {
            errors.push(`Member ${member.id} (${member.pubgPlayerName}): PUBG account not found`)
            continue
          }
          playerId = player.accountId
          await prisma.clanMember.update({ where: { id: member.id }, data: { pubgAccountId: playerId } })
        }

        const [ranked, normal] = await Promise.all([
          fetchPlayerRankedStats(playerId, shard, currentSeason.seasonId, { clanId, memberId: member.id }),
          fetchPlayerSeasonStats(playerId, shard, currentSeason.seasonId, { clanId, memberId: member.id }),
        ])

        const now = new Date()
        const seasonData = {
          rankedGameMode: ranked?.gameMode ?? null,
          rankedTier: ranked?.tier ?? null,
          rankedSubTier: ranked?.subTier ?? null,
          rankedPoints: ranked?.currentRankPoints ?? 0,
          rankedBestTier: ranked?.bestTier ?? null,
          rankedBestSubTier: ranked?.bestSubTier ?? null,
          rankedBestPoints: ranked?.bestRankPoints ?? 0,
          rankedKills: ranked?.kills ?? 0,
          rankedDamage: ranked?.damageDealt ?? 0,
          rankedWins: ranked?.wins ?? 0,
          rankedMatches: ranked?.roundsPlayed ?? 0,
          rankedAssists: ranked?.assists ?? 0,
          rankedRevives: ranked?.revives ?? 0,
          normalKills: normal.kills,
          normalDamage: normal.damageDealt,
          normalWins: normal.wins,
          normalLosses: normal.losses,
          normalAssists: normal.assists,
          normalRevives: normal.revives,
          normalMatches: normal.wins + normal.losses,
          lastRefreshedAt: now,
        }

        await prisma.memberSeasonStats.upsert({
          where: { memberId_seasonId: { memberId: member.id, seasonId: currentSeason.seasonId } },
          update: seasonData,
          create: { memberId: member.id, seasonId: currentSeason.seasonId, ...seasonData },
        })

        refreshedCount += 1
      } catch (error) {
        errors.push(
          `Member ${member.id} (${member.pubgPlayerName}): ${error instanceof Error ? error.message : 'unknown error'}`
        )
      }
    }
  }

  return { refreshedCount, membersTotal: members.length, errors }
}

async function syncClanWeaponMastery(clanId: number) {
  const members = await prisma.clanMember.findMany({
    where: { clanId, isActive: true, joinStatus: 'active' },
    select: { id: true, pubgPlayerName: true, pubgAccountId: true, platformShard: true },
  })

  const errors: string[] = []
  let refreshedCount = 0

  for (const member of members) {
    try {
      let playerId = member.pubgAccountId
      if (!playerId) {
        const player = await searchPlayerByName(member.pubgPlayerName, member.platformShard, {
          clanId,
          memberId: member.id,
        })
        if (!player?.accountId) {
          errors.push(`Member ${member.id} (${member.pubgPlayerName}): PUBG account not found`)
          continue
        }
        playerId = player.accountId
        await prisma.clanMember.update({ where: { id: member.id }, data: { pubgAccountId: playerId } })
      }

      const entries = await fetchWeaponMastery(playerId, member.platformShard, { clanId, memberId: member.id })
      if (entries.length === 0) {
        refreshedCount += 1
        continue
      }

      const now = new Date()
      await prisma.$transaction(
        entries.map((entry) =>
          prisma.memberWeaponMastery.upsert({
            where: { memberId_weaponId: { memberId: member.id, weaponId: entry.weaponId } },
            update: {
              weaponName: entry.weaponName,
              kills: entry.kills,
              headshots: entry.headshots,
              knockouts: entry.knockouts,
              shots: entry.shots,
              hits: entry.hits,
              damage: entry.damage,
              level: entry.level,
              xpTotal: entry.xpTotal,
              tier: entry.tier,
              lastRefreshedAt: now,
            },
            create: {
              memberId: member.id,
              weaponId: entry.weaponId,
              weaponName: entry.weaponName,
              kills: entry.kills,
              headshots: entry.headshots,
              knockouts: entry.knockouts,
              shots: entry.shots,
              hits: entry.hits,
              damage: entry.damage,
              level: entry.level,
              xpTotal: entry.xpTotal,
              tier: entry.tier,
              lastRefreshedAt: now,
            },
          })
        )
      )

      refreshedCount += 1
    } catch (error) {
      errors.push(
        `Member ${member.id} (${member.pubgPlayerName}): ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
  }

  return { refreshedCount, membersTotal: members.length, errors }
}

async function syncSeasonStatsDaily() {
  if (globalForCron.seasonStatsSyncInProgress) {
    console.warn('[Cron] Season stats sync skipped because a previous run is still in progress')
    return
  }

  globalForCron.seasonStatsSyncInProgress = true
  const startedAt = new Date()
  console.info(`[Cron] Daily season stats sync started at ${startedAt.toISOString()}`)

  try {
    const activeClans = await prisma.clan.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    })

    if (activeClans.length === 0) {
      console.info('[Cron] No active clans found for season stats sync')
      return
    }

    for (const clan of activeClans) {
      const execution = await startCronExecution({
        clanId: clan.id,
        action: 'daily_season_stats_sync',
        source: 'scheduler',
      })

      try {
        const [result, masteryResult] = await Promise.all([
          syncClanSeasonStats(clan.id),
          syncClanWeaponMastery(clan.id),
        ])
        const hasErrors = result.errors.length > 0 || masteryResult.errors.length > 0
        const allErrors = [...result.errors, ...masteryResult.errors]

        console.info(
          `[Cron] Season stats sync for clan "${clan.name}" (${clan.id}): ${result.refreshedCount}/${result.membersTotal} refreshed, mastery: ${masteryResult.refreshedCount}/${masteryResult.membersTotal}`
        )

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: hasErrors ? 'partial' : 'success',
          message: hasErrors
            ? `Season/mastery sync partial: season ${result.refreshedCount}/${result.membersTotal}, mastery ${masteryResult.refreshedCount}/${masteryResult.membersTotal}`
            : `Season/mastery sync completed: ${result.refreshedCount}/${result.membersTotal} members`,
          details: {
            seasonRefreshed: result.refreshedCount,
            masteryRefreshed: masteryResult.refreshedCount,
            membersTotal: result.membersTotal,
            errorsPreview: allErrors.slice(0, 10),
          },
        })
      } catch (error) {
        console.error(
          `[Cron] Failed to sync season stats for clan "${clan.name}" (${clan.id})`,
          error
        )

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Season stats sync failed',
        }).catch(() => undefined)
      }
    }

    const finishedAt = new Date()
    console.info(
      `[Cron] Daily season stats sync finished at ${finishedAt.toISOString()} - processed ${activeClans.length} clans`
    )
  } catch (error) {
    console.error('[Cron] Daily season stats sync failed before processing clans', error)
  } finally {
    globalForCron.seasonStatsSyncInProgress = false
  }
}

async function runDailyClanSync() {
  if (globalForCron.clanSyncInProgress) {
    console.warn('[Cron] Daily clan sync skipped because a previous run is still in progress')
    return
  }

  globalForCron.clanSyncInProgress = true

  const startedAt = new Date()
  console.info(`[Cron] Daily clan sync started at ${startedAt.toISOString()}`)

  try {
    const activeClans = await prisma.clan.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
      },
      orderBy: { id: 'asc' },
    })

    if (activeClans.length === 0) {
      console.info('[Cron] No active clans found for nightly sync')
      return
    }

    const failureTracker = getFailureTracker()
    let importedMatches = 0
    let syncedClans = 0

    for (const clan of activeClans) {
      const execution = await startCronExecution({
        clanId: clan.id,
        action: 'daily_sync',
        source: 'scheduler',
      })

      try {
        const result = await syncClanWithRetry(clan.id, clan.name)
        const clanImportedMatches = result?.importedMatches ?? result?.importedCount ?? 0
        const errorsCount = result?.errorsCount ?? result?.errors?.length ?? 0
        const isPartialSync = result?.status === 'partial' || errorsCount > 0
        const telemetrySync = await runTelemetryBatchForClan(clan.id)
        syncedClans += 1
        importedMatches += clanImportedMatches
        failureTracker.set(clan.id, 0)

        console.info(
          `[Cron] Clan "${clan.name}" (${clan.id}) synced: ${clanImportedMatches} imported matches`
        )

        if (isPartialSync) {
          await finishCronExecution({
            id: execution.id,
            startedAt: execution.startedAt,
            status: 'partial',
            message: `Daily sync partial: ${clanImportedMatches} imported match(es), ${errorsCount} error(s). Stats recalculation skipped.`,
            details: {
              importedMatches: clanImportedMatches,
              errorsCount,
              errorsPreview: result?.errorsPreview ?? result?.errors?.slice(0, 5),
              telemetrySync,
              statsSync: {
                status: 'skipped',
                reason: 'partial_import',
              },
              result,
            },
          })

          continue
        }

        if (clanImportedMatches <= 0) {
          await finishCronExecution({
            id: execution.id,
            startedAt: execution.startedAt,
            status: 'success',
            message: 'Daily sync completed: no new matches, stats recalculation skipped.',
            details: {
              importedMatches: clanImportedMatches,
              telemetrySync,
              statsSync: {
                status: 'skipped',
                reason: 'no_new_matches',
              },
              result,
            },
          })

          continue
        }

        try {
          await syncTrackedClanStats(clan.id)
        } catch (statsError) {
          const statsErrorMessage =
            statsError instanceof Error ? statsError.message : 'Stats recalculation failed'

          await finishCronExecution({
            id: execution.id,
            startedAt: execution.startedAt,
            status: 'partial',
            message: `Daily sync completed: ${clanImportedMatches} imported match(es), but stats recalculation failed.`,
            details: {
              importedMatches: clanImportedMatches,
              telemetrySync,
              statsSync: {
                status: 'failed',
                reason: statsErrorMessage,
              },
              result,
            },
          })

          continue
        }

        try {
          const { refreshChallengeProgressForClan } = await loadChallengeService()
          await refreshChallengeProgressForClan(clan.id)
        } catch (challengeError) {
          console.warn(
            `[Cron] Failed to refresh challenge progress for clan "${clan.name}" (${clan.id})`,
            challengeError
          )
        }

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: 'success',
          message: `Daily sync completed: ${clanImportedMatches} imported match(es). Stats recalculated automatically.`,
          details: {
            importedMatches: clanImportedMatches,
            telemetrySync,
            statsSync: {
              status: 'success',
              reason: 'post_import_recalc',
            },
            result,
          },
        })
      } catch (error) {
        const consecutiveFailures = (failureTracker.get(clan.id) ?? 0) + 1
        failureTracker.set(clan.id, consecutiveFailures)

        console.error(
          `[Cron] Clan "${clan.name}" (${clan.id}) failed to sync. Consecutive failures: ${consecutiveFailures}`,
          error
        )

        if (consecutiveFailures >= MAX_SYNC_ATTEMPTS) {
          console.error(
            `[Cron][ALERT] Clan "${clan.name}" (${clan.id}) sync failed ${consecutiveFailures} times in a row`
          )
        }

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Daily sync failed',
          details: {
            consecutiveFailures,
          },
        }).catch(() => undefined)
      }
    }

    const finishedAt = new Date()

    console.info(
      `[Cron] Daily clan sync finished at ${finishedAt.toISOString()} - synced clans: ${syncedClans}/${activeClans.length}, imported matches: ${importedMatches}`
    )
  } catch (error) {
    console.error('[Cron] Daily clan sync failed before processing clans', error)
  } finally {
    globalForCron.clanSyncInProgress = false
  }
}

function getLastCompletedWeekStart(referenceDate = new Date()) {
  const currentWeekStart = new Date(referenceDate)
  const day = currentWeekStart.getDay()
  const diff = day === 0 ? -6 : 1 - day
  currentWeekStart.setDate(currentWeekStart.getDate() + diff)
  currentWeekStart.setHours(0, 0, 0, 0)

  const previousWeekStart = new Date(currentWeekStart)
  previousWeekStart.setDate(previousWeekStart.getDate() - 7)
  return previousWeekStart
}

function getLastCompletedMonthStart(referenceDate = new Date()) {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1, 0, 0, 0, 0)
}

export async function generateReportsAutomatically(reportType: 'weekly' | 'monthly' | 'all' = 'all') {
  if (globalForCron.reportGenerationInProgress) {
    console.warn('[Cron] Report generation skipped because a previous run is still in progress')
    return
  }

  globalForCron.reportGenerationInProgress = true
  const startedAt = new Date()
  console.info(
    `[Cron] Automatic report generation started at ${startedAt.toISOString()} (${reportType})`
  )

  try {
    const activeClans = await prisma.clan.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        id: 'asc',
      },
    })

    if (activeClans.length === 0) {
      console.info('[Cron] No active clans found for report generation')
      return
    }

    const weeklyStart = getLastCompletedWeekStart(startedAt)
    const monthlyStart = getLastCompletedMonthStart(startedAt)

    for (const clan of activeClans) {
      const execution = await startCronExecution({
        clanId: clan.id,
        action: reportType === 'weekly' ? 'weekly_report_auto' : 'monthly_report_auto',
        source: 'scheduler',
      })

      try {
        if (reportType === 'weekly' || reportType === 'all') {
          await generateWeeklyReport(clan.id, weeklyStart)
        }

        if (reportType === 'monthly' || reportType === 'all') {
          await generateMonthlyReport(clan.id, monthlyStart)
        }

        console.info(`[Cron] Reports generated for clan "${clan.name}" (${clan.id})`)

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: 'success',
          message: `Automatic report generation completed (${reportType})`,
          details: {
            reportType,
            weeklyStart: weeklyStart.toISOString(),
            monthlyStart: monthlyStart.toISOString(),
          },
        })
      } catch (error) {
        console.error(`[Cron] Failed to generate reports for clan "${clan.name}" (${clan.id})`, error)

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Automatic report generation failed',
          details: {
            reportType,
          },
        }).catch(() => undefined)
      }
    }
  } finally {
    globalForCron.reportGenerationInProgress = false
  }
}

export async function sendNotificationsReminders(
  reminderType: 'clan_online' | 'weekly_report'
) {
  const { notifyInviteReminder, notifyReportReady } = await loadNotificationService()

  const activeMembers = await prisma.clanMember.findMany({
    where: { isActive: true, joinStatus: 'active' },
    select: { id: true },
    orderBy: { id: 'asc' },
  })

  if (activeMembers.length === 0) {
    return
  }

  if (reminderType === 'clan_online') {
    await Promise.all(
      activeMembers.map((member) => notifyInviteReminder(member.id))
    )
    return
  }

  const reportId = `weekly-${new Date().toISOString().slice(0, 10)}`
  await Promise.all(
    activeMembers.map((member) => notifyReportReady(reportId, member.id))
  )
}

export async function processChallenges() {
  const { endChallenge, refreshChallengeProgressForClan } = await loadChallengeService()

  if (globalForCron.challengeProcessingInProgress) {
    console.warn('[Cron] Challenge processing skipped because a previous run is still in progress')
    return
  }

  globalForCron.challengeProcessingInProgress = true
  const now = new Date()
  console.info(`[Cron] Challenge processing started at ${now.toISOString()}`)

  try {
    const activeClans = await prisma.clan.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    })

    if (activeClans.length === 0) {
      console.info('[Cron] No active clans found for challenge processing')
      return
    }

    const clansWithActiveChallenges = await prisma.challenge.findMany({
      where: { status: 'active' },
      select: { clanId: true },
      distinct: ['clanId'],
    })
    const clanIdsWithActiveChallenges = new Set(
      clansWithActiveChallenges.map((entry) => entry.clanId)
    )

    const expiredChallenges = await prisma.challenge.findMany({
      where: {
        status: 'active',
        endDate: { lte: now },
      },
      select: { id: true, clanId: true },
    })
    const expiredByClan = new Map<number, typeof expiredChallenges>()
    for (const challenge of expiredChallenges) {
      const list = expiredByClan.get(challenge.clanId) ?? []
      list.push(challenge)
      expiredByClan.set(challenge.clanId, list)
    }

    const pendingToActivate = await prisma.challenge.findMany({
      where: {
        status: 'pending',
        startDate: { lte: now },
      },
      select: { id: true, clanId: true },
    })
    const pendingByClan = new Map<number, typeof pendingToActivate>()
    for (const challenge of pendingToActivate) {
      const list = pendingByClan.get(challenge.clanId) ?? []
      list.push(challenge)
      pendingByClan.set(challenge.clanId, list)
    }

    let totalEnded = 0
    let totalActivated = 0

    for (const clan of activeClans) {
      const execution = await startCronExecution({
        clanId: clan.id,
        action: 'challenge_processing',
        source: 'scheduler',
      })

      try {
        let refreshed = false
        if (clanIdsWithActiveChallenges.has(clan.id)) {
          await refreshChallengeProgressForClan(clan.id)
          refreshed = true
          console.info(`[Cron] Challenge progress refreshed for clan ${clan.id}`)
        }

        let endedCount = 0
        for (const challenge of expiredByClan.get(clan.id) ?? []) {
          try {
            await endChallenge(challenge.id)
            endedCount += 1
            console.info(`[Cron] Challenge ${challenge.id} (clan ${clan.id}) ended`)
          } catch (error) {
            console.error(`[Cron] Failed to end challenge ${challenge.id}`, error)
          }
        }

        let activatedCount = 0
        for (const challenge of pendingByClan.get(clan.id) ?? []) {
          try {
            await prisma.challenge.update({
              where: { id: challenge.id },
              data: { status: 'active' },
            })
            activatedCount += 1
            console.info(`[Cron] Challenge ${challenge.id} (clan ${clan.id}) activated`)
          } catch (error) {
            console.error(`[Cron] Failed to activate challenge ${challenge.id}`, error)
          }
        }

        totalEnded += endedCount
        totalActivated += activatedCount

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: 'success',
          message: `Challenge processing completed: refreshed=${refreshed}, ended=${endedCount}, activated=${activatedCount}`,
          details: { refreshed, endedCount, activatedCount },
        })
      } catch (error) {
        console.error(`[Cron] Challenge processing failed for clan ${clan.id}`, error)

        await finishCronExecution({
          id: execution.id,
          startedAt: execution.startedAt,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Challenge processing failed',
        }).catch(() => undefined)
      }
    }

    console.info(
      `[Cron] Challenge processing finished — ended: ${totalEnded}, activated: ${totalActivated}`
    )
  } catch (error) {
    console.error('[Cron] Challenge processing failed', error)
  } finally {
    globalForCron.challengeProcessingInProgress = false
  }
}

async function resolveEncounteredPlayerClans() {
  if (globalForCron.encounteredPlayerResolutionInProgress) {
    console.warn('[Cron] Encountered player clan resolution skipped — previous run still in progress')
    return
  }

  globalForCron.encounteredPlayerResolutionInProgress = true
  const startedAt = new Date()
  console.info(`[Cron] Encountered player clan resolution started at ${startedAt.toISOString()}`)

  try {
    const candidates = await prisma.encounteredPlayer.findMany({
      where: {
        clanResolvedAt: null,
        encounterCount: { gte: ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION },
        resolveAttempts: { lt: ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS },
      },
      orderBy: [{ encounterCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: ENCOUNTERED_PLAYER_RESOLUTION_BATCH_SIZE,
    })

    if (candidates.length === 0) {
      return
    }

    let resolvedCount = 0
    let resolvedFromCacheCount = 0
    let failedCount = 0
    const freshnessCutoff = new Date(
      Date.now() - PLAYER_CLAN_RESOLUTION_FRESHNESS_DAYS * 24 * 60 * 60 * 1000
    )

    for (const candidate of candidates) {
      try {
        // Un joueur croisé par plusieurs clans suivis n'est résolu qu'une seule
        // fois côté API : si un autre clan l'a déjà résolu récemment via Player,
        // on recopie directement sans rappeler fetchPlayerClan.
        const cachedPlayer = await prisma.player.findUnique({
          where: {
            pubgAccountId_platformShard: {
              pubgAccountId: candidate.pubgAccountId,
              platformShard: candidate.platformShard,
            },
          },
          include: { opponentClan: true },
        })

        if (cachedPlayer?.clanResolvedAt && cachedPlayer.clanResolvedAt >= freshnessCutoff) {
          await prisma.encounteredPlayer.update({
            where: { id: candidate.id },
            data: {
              clanResolvedAt: new Date(),
              pubgClanId: cachedPlayer.opponentClan?.pubgClanId ?? null,
              pubgClanTag: cachedPlayer.opponentClan?.tag ?? null,
              pubgClanName: cachedPlayer.opponentClan?.name ?? null,
            },
          })

          resolvedFromCacheCount += 1
          continue
        }

        const clan = await fetchPlayerClan(candidate.pubgAccountId, candidate.platformShard)
        const resolvedAt = new Date()

        await prisma.encounteredPlayer.update({
          where: { id: candidate.id },
          data: {
            clanResolvedAt: resolvedAt,
            pubgClanId: clan?.id ?? null,
            pubgClanTag: clan?.tag ?? null,
            pubgClanName: clan?.name ?? null,
          },
        })

        let opponentClanId: string | null = null
        if (clan?.id) {
          const opponentClan = await prisma.opponentClan.upsert({
            where: { pubgClanId_platformShard: { pubgClanId: clan.id, platformShard: candidate.platformShard } },
            update: { tag: clan.tag ?? null, name: clan.name ?? null, resolvedAt },
            create: {
              pubgClanId: clan.id,
              platformShard: candidate.platformShard,
              tag: clan.tag ?? null,
              name: clan.name ?? null,
              resolvedAt,
            },
          })
          opponentClanId = opponentClan.id
        }

        await prisma.player.upsert({
          where: {
            pubgAccountId_platformShard: {
              pubgAccountId: candidate.pubgAccountId,
              platformShard: candidate.platformShard,
            },
          },
          update: { opponentClanId, clanResolvedAt: resolvedAt },
          create: {
            pubgAccountId: candidate.pubgAccountId,
            platformShard: candidate.platformShard,
            pubgPlayerName: candidate.pubgPlayerName,
            opponentClanId,
            clanResolvedAt: resolvedAt,
          },
        })

        resolvedCount += 1
      } catch (error) {
        failedCount += 1
        console.error(
          `[Cron] Failed to resolve clan for encountered player ${candidate.pubgAccountId}`,
          error
        )

        await prisma.encounteredPlayer
          .update({
            where: { id: candidate.id },
            data: { resolveAttempts: { increment: 1 } },
          })
          .catch(() => undefined)
      }
    }

    console.info(
      `[Cron] Encountered player clan resolution finished at ${new Date().toISOString()} — resolved=${resolvedCount}, resolvedFromCache=${resolvedFromCacheCount}, failed=${failedCount}, batch=${candidates.length}`
    )
  } catch (error) {
    console.error('[Cron] Encountered player clan resolution failed before processing batch', error)
  } finally {
    globalForCron.encounteredPlayerResolutionInProgress = false
  }
}

export type CronScheduleKey =
  | 'daily_sync'
  | 'daily_stats_recalc'
  | 'daily_lifetime_stats_sync'
  | 'daily_season_stats_sync'
  | 'clan_online_reminder'
  | 'weekly_report_reminder'
  | 'weekly_report_auto'
  | 'monthly_report_auto'
  | 'challenge_processing'
  | 'encountered_player_clan_resolution'

type CronScheduleGlobalKey =
  | 'clanSyncCronTask'
  | 'statsRecalcCronTask'
  | 'lifetimeStatsSyncCronTask'
  | 'seasonStatsSyncCronTask'
  | 'clanReminderCronTask'
  | 'reportReminderCronTask'
  | 'weeklyReportCronTask'
  | 'monthlyReportCronTask'
  | 'challengeProcessingCronTask'
  | 'encounteredPlayerResolutionCronTask'

type CronScheduleDefinition = {
  key: CronScheduleKey
  envVar: string
  defaultExpression: string
  globalKey: CronScheduleGlobalKey
  run: () => Promise<void>
}

const CRON_SCHEDULE_DEFINITIONS: CronScheduleDefinition[] = [
  {
    key: 'daily_sync',
    envVar: 'CLAN_MATCH_SYNC_CRON',
    defaultExpression: '0 2 * * *',
    globalKey: 'clanSyncCronTask',
    run: runDailyClanSync,
  },
  {
    key: 'daily_stats_recalc',
    envVar: 'CLAN_STATS_RECALC_CRON',
    defaultExpression: '0 3 * * *',
    globalKey: 'statsRecalcCronTask',
    run: recalculateStatsDaily,
  },
  {
    key: 'daily_lifetime_stats_sync',
    envVar: 'CLAN_LIFETIME_STATS_SYNC_CRON',
    defaultExpression: '0 4 * * *',
    globalKey: 'lifetimeStatsSyncCronTask',
    run: syncLifetimeStatsDaily,
  },
  {
    key: 'daily_season_stats_sync',
    envVar: 'CLAN_SEASON_STATS_SYNC_CRON',
    defaultExpression: '0 5 * * *',
    globalKey: 'seasonStatsSyncCronTask',
    run: syncSeasonStatsDaily,
  },
  {
    key: 'clan_online_reminder',
    envVar: 'CLAN_ONLINE_REMINDER_CRON',
    defaultExpression: '0 18 * * *',
    globalKey: 'clanReminderCronTask',
    run: () => sendNotificationsReminders('clan_online'),
  },
  {
    key: 'weekly_report_reminder',
    envVar: 'WEEKLY_REPORT_REMINDER_CRON',
    defaultExpression: '0 9 * * *',
    globalKey: 'reportReminderCronTask',
    run: () => sendNotificationsReminders('weekly_report'),
  },
  {
    key: 'weekly_report_auto',
    envVar: 'WEEKLY_REPORT_GENERATION_CRON',
    defaultExpression: '0 8 * * 1',
    globalKey: 'weeklyReportCronTask',
    run: () => generateReportsAutomatically('weekly'),
  },
  {
    key: 'monthly_report_auto',
    envVar: 'MONTHLY_REPORT_GENERATION_CRON',
    defaultExpression: '0 8 1 * *',
    globalKey: 'monthlyReportCronTask',
    run: () => generateReportsAutomatically('monthly'),
  },
  {
    key: 'challenge_processing',
    envVar: 'CHALLENGE_PROCESSING_CRON',
    defaultExpression: '0 0 * * *',
    globalKey: 'challengeProcessingCronTask',
    run: processChallenges,
  },
  {
    key: 'encountered_player_clan_resolution',
    envVar: 'ENCOUNTERED_PLAYER_CLAN_RESOLUTION_CRON',
    defaultExpression: '*/30 * * * *',
    globalKey: 'encounteredPlayerResolutionCronTask',
    run: resolveEncounteredPlayerClans,
  },
]

async function resolveEffectiveCronExpressions(): Promise<Map<CronScheduleKey, string>> {
  const overrides = await prisma.cronSchedule.findMany()
  const overrideByKey = new Map(overrides.map((row) => [row.key, row.expression]))

  const effective = new Map<CronScheduleKey, string>()
  for (const definition of CRON_SCHEDULE_DEFINITIONS) {
    const expression =
      overrideByKey.get(definition.key) ??
      process.env[definition.envVar] ??
      definition.defaultExpression
    effective.set(definition.key, expression)
  }

  return effective
}

export async function initCronJobs() {
  if (globalForCron.clanSyncCronInitialized) {
    return
  }

  if (!isCronWorkerEnabled()) {
    console.info(
      '[Cron] Skipping cron initialization because this worker is not designated to run scheduled jobs'
    )
    return
  }

  // Set before the first await: two concurrent calls to initCronJobs() must not
  // both pass this guard and create duplicate ScheduledTasks.
  globalForCron.clanSyncCronInitialized = true

  const effectiveExpressions = await resolveEffectiveCronExpressions()

  for (const definition of CRON_SCHEDULE_DEFINITIONS) {
    const expression = effectiveExpressions.get(definition.key) ?? definition.defaultExpression

    globalForCron[definition.globalKey] = cron.schedule(
      expression,
      async () => {
        await definition.run()
      },
      {
        timezone: DAILY_SYNC_TIMEZONE,
      }
    )

    console.info(`[Cron] "${definition.key}" scheduled with "${expression}" (${DAILY_SYNC_TIMEZONE})`)
  }
}

export function rescheduleJob(key: string, newExpression: string): boolean {
  const definition = CRON_SCHEDULE_DEFINITIONS.find((entry) => entry.key === key)
  if (!definition) {
    return false
  }

  globalForCron[definition.globalKey]?.stop()

  globalForCron[definition.globalKey] = cron.schedule(
    newExpression,
    async () => {
      await definition.run()
    },
    {
      timezone: DAILY_SYNC_TIMEZONE,
    }
  )

  console.info(`[Cron] "${definition.key}" rescheduled to "${newExpression}" (${DAILY_SYNC_TIMEZONE})`)
  return true
}

export async function getEffectiveCronSchedules() {
  const overrides = await prisma.cronSchedule.findMany()
  const overrideByKey = new Map(overrides.map((row) => [row.key, row.expression]))

  return CRON_SCHEDULE_DEFINITIONS.map((definition) => {
    const dbExpression = overrideByKey.get(definition.key)
    const expression = dbExpression ?? process.env[definition.envVar] ?? definition.defaultExpression

    return {
      key: definition.key,
      expression,
      timezone: DAILY_SYNC_TIMEZONE,
      source: dbExpression ? ('db' as const) : ('env' as const),
    }
  })
}

export function isCronJobsInitialized() {
  return globalForCron.clanSyncCronInitialized === true
}
