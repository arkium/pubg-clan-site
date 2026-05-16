import cron, { type ScheduledTask } from 'node-cron'

import { endChallenge } from '@/lib/challenge-service'
import { getInternalApiBaseUrl } from '@/lib/internal-api'
import { notifyInviteReminder, notifyReportReady } from '@/lib/notification-service'
import { prisma } from '@/lib/prisma'
import { generateMonthlyReport, generateWeeklyReport } from '@/lib/report-generator'
import { recalculateStatsForClan } from '@/lib/stats-calculator'

const DAILY_SYNC_SCHEDULE = process.env.CLAN_MATCH_SYNC_CRON ?? '0 2 * * *'
const DAILY_SYNC_TIMEZONE = process.env.CLAN_MATCH_SYNC_TIMEZONE ?? 'UTC'
const STATS_RECALC_SCHEDULE = process.env.CLAN_STATS_RECALC_CRON ?? '0 3 * * *'
const CLAN_ONLINE_REMINDER_SCHEDULE =
  process.env.CLAN_ONLINE_REMINDER_CRON ?? '0 18 * * *'
const WEEKLY_REPORT_REMINDER_SCHEDULE =
  process.env.WEEKLY_REPORT_REMINDER_CRON ?? '0 9 * * *'
const WEEKLY_REPORT_GENERATION_SCHEDULE =
  process.env.WEEKLY_REPORT_GENERATION_CRON ?? '0 8 * * 1'
const MONTHLY_REPORT_GENERATION_SCHEDULE =
  process.env.MONTHLY_REPORT_GENERATION_CRON ?? '0 8 1 * *'
const MAX_SYNC_ATTEMPTS = 3

const globalForCron = globalThis as typeof globalThis & {
  clanSyncCronTask?: ScheduledTask
  clanSyncCronInitialized?: boolean
  clanSyncFailures?: Map<number, number>
  clanSyncInProgress?: boolean
  statsRecalcCronTask?: ScheduledTask
  statsRecalcInProgress?: boolean
  clanReminderCronTask?: ScheduledTask
  reportReminderCronTask?: ScheduledTask
  weeklyReportCronTask?: ScheduledTask
  monthlyReportCronTask?: ScheduledTask
  reportGenerationInProgress?: boolean
  challengeProcessingCronTask?: ScheduledTask
  challengeProcessingInProgress?: boolean
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
      try {
        if (reportType === 'weekly' || reportType === 'all') {
          await generateWeeklyReport(clan.id, weeklyStart)
        }

        if (reportType === 'monthly' || reportType === 'all') {
          await generateMonthlyReport(clan.id, monthlyStart)
        }

        console.info(`[Cron] Reports generated for clan "${clan.name}" (${clan.id})`)
      } catch (error) {
        console.error(`[Cron] Failed to generate reports for clan "${clan.name}" (${clan.id})`, error)
      }
    }
  } finally {
    globalForCron.reportGenerationInProgress = false
  }
}

export async function sendNotificationsReminders(
  reminderType: 'clan_online' | 'weekly_report'
) {
  const activeMembers = await prisma.clanMember.findMany({
    where: { isActive: true },
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
  if (globalForCron.challengeProcessingInProgress) {
    console.warn('[Cron] Challenge processing skipped because a previous run is still in progress')
    return
  }

  globalForCron.challengeProcessingInProgress = true
  const now = new Date()
  console.info(`[Cron] Challenge processing started at ${now.toISOString()}`)

  try {
    const expiredChallenges = await prisma.challenge.findMany({
      where: {
        status: 'active',
        endDate: { lte: now },
      },
      select: { id: true, clanId: true },
    })

    for (const challenge of expiredChallenges) {
      try {
        await endChallenge(challenge.id)
        console.info(`[Cron] Challenge ${challenge.id} (clan ${challenge.clanId}) ended`)
      } catch (error) {
        console.error(`[Cron] Failed to end challenge ${challenge.id}`, error)
      }
    }

    const pendingToActivate = await prisma.challenge.findMany({
      where: {
        status: 'pending',
        startDate: { lte: now },
      },
      select: { id: true, clanId: true },
    })

    for (const challenge of pendingToActivate) {
      try {
        await prisma.challenge.update({
          where: { id: challenge.id },
          data: { status: 'active' },
        })
        console.info(`[Cron] Challenge ${challenge.id} (clan ${challenge.clanId}) activated`)
      } catch (error) {
        console.error(`[Cron] Failed to activate challenge ${challenge.id}`, error)
      }
    }

    console.info(
      `[Cron] Challenge processing finished — ended: ${expiredChallenges.length}, activated: ${pendingToActivate.length}`
    )
  } catch (error) {
    console.error('[Cron] Challenge processing failed', error)
  } finally {
    globalForCron.challengeProcessingInProgress = false
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

  globalForCron.clanReminderCronTask = cron.schedule(
    CLAN_ONLINE_REMINDER_SCHEDULE,
    async () => {
      await sendNotificationsReminders('clan_online')
    },
    {
      timezone: DAILY_SYNC_TIMEZONE,
    }
  )

  globalForCron.reportReminderCronTask = cron.schedule(
    WEEKLY_REPORT_REMINDER_SCHEDULE,
    async () => {
      await sendNotificationsReminders('weekly_report')
    },
    {
      timezone: DAILY_SYNC_TIMEZONE,
    }
  )

  globalForCron.weeklyReportCronTask = cron.schedule(
    WEEKLY_REPORT_GENERATION_SCHEDULE,
    async () => {
      await generateReportsAutomatically('weekly')
    },
    {
      timezone: DAILY_SYNC_TIMEZONE,
    }
  )

  globalForCron.monthlyReportCronTask = cron.schedule(
    MONTHLY_REPORT_GENERATION_SCHEDULE,
    async () => {
      await generateReportsAutomatically('monthly')
    },
    {
      timezone: DAILY_SYNC_TIMEZONE,
    }
  )

  globalForCron.challengeProcessingCronTask = cron.schedule(
    '0 0 * * *',
    async () => {
      await processChallenges()
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
  console.info(
    `[Cron] Clan online reminders scheduled with "${CLAN_ONLINE_REMINDER_SCHEDULE}" (${DAILY_SYNC_TIMEZONE})`
  )
  console.info(
    `[Cron] Weekly report reminders scheduled with "${WEEKLY_REPORT_REMINDER_SCHEDULE}" (${DAILY_SYNC_TIMEZONE})`
  )
  console.info(
    `[Cron] Weekly report generation scheduled with "${WEEKLY_REPORT_GENERATION_SCHEDULE}" (${DAILY_SYNC_TIMEZONE})`
  )
  console.info(
    `[Cron] Monthly report generation scheduled with "${MONTHLY_REPORT_GENERATION_SCHEDULE}" (${DAILY_SYNC_TIMEZONE})`
  )
  console.info('[Cron] Challenge processing scheduled daily at midnight')
}
