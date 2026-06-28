import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { getTelemetryResyncQueueStats } from '@/lib/pubg-telemetry/resync-queue'
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

async function readWorkerLock(filename: string): Promise<WorkerLockInfo> {
  try {
    const raw = await readFile(join(process.cwd(), filename), 'utf-8')
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

  const [resyncLock, aggregateLock, resyncQueue, aggregateQueue] = await Promise.all([
    readWorkerLock('.telemetry-resync-worker.lock'),
    readWorkerLock('.telemetry-aggregate-worker.lock'),
    getTelemetryResyncQueueStats(),
    getTelemetryAggregateRecalcQueueStats(),
  ])

  return Response.json({
    ok: true,
    resyncWorker: {
      lock: resyncLock,
      queue: resyncQueue,
    },
    aggregateWorker: {
      lock: aggregateLock,
      queue: aggregateQueue,
    },
  })
}
