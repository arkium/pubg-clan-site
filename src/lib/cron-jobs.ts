import cron from 'node-cron'
import { syncAllActiveMembers } from './sync-matches'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 60_000

let consecutiveFailures = 0

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function runSyncWithRetry(attempt = 1): Promise<void> {
  const startedAt = new Date()
  console.log(
    `[cron] [sync-matches] Starting sync (attempt ${attempt}/${MAX_RETRIES}) at ${startedAt.toISOString()}`
  )

  try {
    const result = await syncAllActiveMembers()
    const duration = Date.now() - startedAt.getTime()
    consecutiveFailures = 0

    console.log(
      `[cron] [sync-matches] Sync completed in ${duration}ms: ` +
        `${result.synced}/${result.totalMembers} members synced, ` +
        `${result.totalImported} matches imported`
    )

    if (result.errors.length > 0) {
      console.warn(
        `[cron] [sync-matches] Sync finished with ${result.errors.length} non-fatal error(s):`,
        result.errors
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[cron] [sync-matches] Sync failed (attempt ${attempt}/${MAX_RETRIES}): ${message}`
    )

    if (attempt < MAX_RETRIES) {
      console.log(`[cron] [sync-matches] Retrying in ${RETRY_DELAY_MS / 1000}s...`)
      await sleep(RETRY_DELAY_MS)
      return runSyncWithRetry(attempt + 1)
    }

    consecutiveFailures++
    console.error(
      `[cron] [sync-matches] All ${MAX_RETRIES} attempts failed. ` +
        `Consecutive failures: ${consecutiveFailures}`
    )

    if (consecutiveFailures >= MAX_RETRIES) {
      console.error(
        `[cron] [ALERT] sync-matches has failed ${consecutiveFailures} times in a row! ` +
          `Manual intervention required.`
      )
    }
  }
}

export function initCronJobs() {
  cron.schedule('0 2 * * *', () => {
    runSyncWithRetry().catch((err) => {
      console.error('[cron] Unexpected error in sync job:', err)
    })
  })

  console.log('[cron] Cron jobs initialized. Daily sync scheduled at 02:00 AM.')
}
