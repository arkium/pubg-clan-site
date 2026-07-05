import 'server-only'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

import { getTelemetryResyncQueueStats } from '@/lib/pubg-telemetry/resync-queue'
import { getTelemetryLiveSyncQueueStats } from '@/lib/pubg-telemetry/live-sync-queue'
import { getTelemetryAggregateRecalcQueueStats } from '@/lib/pubg-telemetry/aggregate-recalc-queue'
import { isSuperUserSession } from '@/middleware/auth-permission'

type LockFileData = {
  workerId?: string
  pid?: number
  acquiredAt?: string
}

type WorkerLockInfo = {
  pid: number
  acquiredAt: string
  alive: boolean
} | null

// In standalone output, the running process has chdir'd into .next/standalone,
// so process.cwd() no longer points at the project root where workers write their
// lock files. Resolve against the same *_LOCK_FILE env vars the workers use instead.
function resolveLockFilePath(envVar: string, defaultFilename: string): string {
  const configured = process.env[envVar]?.trim()
  if (configured) {
    return isAbsolute(configured) ? configured : join(process.cwd(), configured)
  }
  return join(process.cwd(), defaultFilename)
}

async function readWorkerLock(path: string): Promise<WorkerLockInfo> {
  try {
    const raw = await readFile(path, 'utf-8')
    const data = JSON.parse(raw) as LockFileData

    if (typeof data.pid !== 'number' || !data.acquiredAt) {
      return null
    }

    let alive = false
    try {
      process.kill(data.pid, 0)
      alive = true
    } catch {
      alive = false
    }

    return { pid: data.pid, acquiredAt: data.acquiredAt, alive }
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  if (!(await isSuperUserSession(request))) {
    return Response.json({ error: 'Acces reserve au SuperUser' }, { status: 403 })
  }

  const resyncLockPath = resolveLockFilePath(
    'TELEMETRY_RESYNC_WORKER_LOCK_FILE',
    '.telemetry-resync-worker.lock'
  )
  const aggregateLockPath = resolveLockFilePath(
    'TELEMETRY_AGGREGATE_WORKER_LOCK_FILE',
    '.telemetry-aggregate-worker.lock'
  )

  const [resyncLock, aggregateLock, resyncQueue, liveSyncQueue, aggregateQueue] = await Promise.all([
    readWorkerLock(resyncLockPath),
    readWorkerLock(aggregateLockPath),
    getTelemetryResyncQueueStats(),
    getTelemetryLiveSyncQueueStats(),
    getTelemetryAggregateRecalcQueueStats(),
  ])

  return Response.json({
    ok: true,
    resyncWorker: {
      lock: resyncLock,
      queue: resyncQueue,
      liveSyncQueue,
    },
    aggregateWorker: {
      lock: aggregateLock,
      queue: aggregateQueue,
    },
  })
}
