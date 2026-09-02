import 'server-only'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

import { getTelemetryLiveSyncQueueStats, TelemetryLiveSyncQueueStats } from '@/lib/pubg-telemetry/live-sync-queue'

export type TelemetryWorkerStatus = {
  alive: boolean
  pid: number | null
  acquiredAt: string | null
}

export type TelemetryRecoveriesStatusPayload = {
  worker: TelemetryWorkerStatus
  queue: TelemetryLiveSyncQueueStats
  scheduler: {
    syncEnabled: boolean
    maxMatchesPerRun: number
    cronJobsEnabled: boolean
    nextDailySyncEstimate: string
  }
  etaSeconds: number | null
}

function resolveLockFilePath(envVar: string, defaultFilename: string): string {
  const configured = process.env[envVar]?.trim()
  if (configured) {
    return isAbsolute(configured)
      ? configured
      : join(/* turbopackIgnore: true */ process.cwd(), configured)
  }
  return join(/* turbopackIgnore: true */ process.cwd(), defaultFilename)
}

async function readWorkerLock(): Promise<TelemetryWorkerStatus> {
  const lockPath = resolveLockFilePath(
    'TELEMETRY_RESYNC_WORKER_LOCK_FILE',
    '.telemetry-resync-worker.lock'
  )

  try {
    const raw = await readFile(/* turbopackIgnore: true */ lockPath, 'utf-8')
    const data = JSON.parse(raw) as { pid?: number; acquiredAt?: string }

    if (typeof data.pid !== 'number' || !data.acquiredAt) {
      return { alive: false, pid: null, acquiredAt: null }
    }

    let alive = false
    try {
      process.kill(data.pid, 0)
      alive = true
    } catch {
      alive = false
    }

    return { alive, pid: data.pid, acquiredAt: data.acquiredAt }
  } catch {
    return { alive: false, pid: null, acquiredAt: null }
  }
}

function resolveNextDailySyncEstimate(): string {
  const now = new Date()
  const next = new Date(now)
  next.setHours(4, 0, 0, 0)
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  return next.toISOString()
}

export async function getTelemetryRecoveriesStatus(): Promise<TelemetryRecoveriesStatusPayload> {
  const [worker, queue] = await Promise.all([
    readWorkerLock(),
    getTelemetryLiveSyncQueueStats(),
  ])

  const syncEnabled = process.env.TELEMETRY_SYNC_ENABLED === 'true'
  const cronJobsEnabled = process.env.ENABLE_CRON_JOBS !== 'false'
  const maxMatchesPerRun = Math.min(
    Math.max(Number(process.env.TELEMETRY_MAX_MATCHES_PER_RUN ?? '50'), 1),
    200
  )

  // Approximation : en moyenne 5 à 7 secondes par match traité par le worker
  const etaSeconds =
    worker.alive && queue.remaining > 0 ? Math.round(queue.remaining * 6) : null

  return {
    worker,
    queue,
    scheduler: {
      syncEnabled,
      cronJobsEnabled,
      maxMatchesPerRun,
      nextDailySyncEstimate: resolveNextDailySyncEstimate(),
    },
    etaSeconds,
  }
}
