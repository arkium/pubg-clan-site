import cron, { type ScheduledTask } from 'node-cron'

import { prisma } from '@/lib/prisma'
import { getInternalApiBaseUrl } from '@/lib/internal-api'
import { recalculateStatsForClan } from '@/lib/stats-calculator'

const DAILY_SYNC_SCHEDULE = process.env.CLAN_MATCH_SYNC_CRON ?? '0 2 * * *'
const DAILY_SYNC_TIMEZONE = process.env.CLAN_MATCH_SYNC_TIMEZONE ?? 'UTC'
const STATS_RECALC_SCHEDULE = process.env.CLAN_STATS_RECALC_CRON ?? '0 3 * * *'
const MAX_SYNC_ATTEMPTS = 3

const globalForCron = globalThis as typeof globalThis & {
  clanSyncCronTask?: ScheduledTask
  clanSyncCronInitialized?: boolean
  clanSyncFailures?: Map<number, number>
  clanSyncInProgress?: boolean
  statsRecalcCronTask?: ScheduledTask
  statsRecalcInProgress?: boolean
}

function isCronWorkerEnabled() {
  if (process.env.ENABLE_CRON_JOBS === 'true') {
    return true
  }

  if (process.env.ENABLE_CRON_JOBS === 'false') {
    return false
  }

  return process.env.NODE_ENV !== 'production'
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

async function triggerClanSync(clanId: number) {
  const response = await fetch(
    `${getInternalApiBaseUrl()}/api/clans/${clanId}/sync-matches`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
    importedCount?: number
    importedMatches?: number
    membersProcessed: number
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
      try {
        await recalculateStatsForClan(clan.id)
        console.info(`[Cron] Stats recalculated for clan "${clan.name}" (${clan.id})`)
      } catch (error) {
        console.error(
          `[Cron] Failed to recalculate stats for clan "${clan.name}" (${clan.id})`,
          error
        )
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
      try {
        const result = await syncClanWithRetry(clan.id, clan.name)
        const clanImportedMatches = result?.importedMatches ?? result?.importedCount ?? 0
        syncedClans += 1
        importedMatches += clanImportedMatches
        failureTracker.set(clan.id, 0)

        console.info(
          `[Cron] Clan "${clan.name}" (${clan.id}) synced: ${clanImportedMatches} imported matches`
        )
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

export function initCronJobs() {
  if (globalForCron.clanSyncCronInitialized) {
    return
  }

  if (!isCronWorkerEnabled()) {
    console.info(
      '[Cron] Skipping cron initialization because this worker is not designated to run scheduled jobs'
    )
    return
  }

  globalForCron.clanSyncCronTask = cron.schedule(
    DAILY_SYNC_SCHEDULE,
    async () => {
      await runDailyClanSync()
    },
    {
      timezone: DAILY_SYNC_TIMEZONE,
    }
  )

  globalForCron.statsRecalcCronTask = cron.schedule(
    STATS_RECALC_SCHEDULE,
    async () => {
      await recalculateStatsDaily()
    },
    {
      timezone: DAILY_SYNC_TIMEZONE,
    }
  )

  globalForCron.clanSyncCronInitialized = true

  console.info(
    `[Cron] Nightly clan sync scheduled with "${DAILY_SYNC_SCHEDULE}" (${DAILY_SYNC_TIMEZONE})`
  )
  console.info(
    `[Cron] Daily stats recalculation scheduled with "${STATS_RECALC_SCHEDULE}" (${DAILY_SYNC_TIMEZONE})`
  )
}
