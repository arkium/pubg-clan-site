import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { TELEMETRY_LIVE_SYNC_QUEUE_ACTION } from '@/lib/pubg-telemetry/live-sync-queue'
import { isTelemetryDataExpiredError } from '@/lib/pubg-telemetry/telemetry-error-presentation'
import { requireRole } from '@/middleware/auth-permission'

type TimeWindow = '24h' | '7d' | '30d' | 'all'

// Shape written by scripts/telemetry-resync-worker.ts (processOneLiveSyncJob) via
// finishTelemetryLiveSyncJobSuccess/Failed — see src/lib/pubg-telemetry/live-sync-queue.ts.
type LiveSyncJobDetails = {
  squadMatchId?: string
  pubgMatchId?: string
  status?: string
  errorCode?: string | null
  errorMessage?: string | null
  bytesDownloaded?: number
  contentLength?: number | null
}

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseWindow(value: string | null): TimeWindow {
  if (value === '24h' || value === '7d' || value === '30d' || value === 'all') {
    return value
  }

  return '7d'
}

function parseLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 100
  }

  return Math.min(parsed, 300)
}

function getWindowStart(window: TimeWindow) {
  if (window === 'all') {
    return null
  }

  const now = Date.now()
  if (window === '24h') {
    return new Date(now - 24 * 60 * 60 * 1000)
  }

  if (window === '30d') {
    return new Date(now - 30 * 24 * 60 * 60 * 1000)
  }

  return new Date(now - 7 * 24 * 60 * 60 * 1000)
}

function asLiveSyncJobDetails(value: unknown): LiveSyncJobDetails {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as LiveSyncJobDetails
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const normalizedRatio = Math.min(Math.max(ratio, 0), 1)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * normalizedRatio) - 1)
  return sorted[Math.max(0, index)]
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json(buildTelemetryErrorResponse('Invalid clan id', 'INVALID_CLAN_ID'), {
        status: 400,
      })
    }

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const url = new URL(request.url)
    const window = parseWindow(url.searchParams.get('window'))
    const limit = parseLimit(url.searchParams.get('limit'))
    const startedAtGte = getWindowStart(window)

    // Telemetry download/parse work moved off the daily_sync request thread and into
    // the telemetry_live_sync queue (processed by telemetry-resync-worker.ts) — each
    // job here is one match, not a batch, so per-run metrics are computed from these
    // job rows directly instead of daily_sync's CronExecution.details (which no longer
    // carries parsed/failed/metrics fields since that migration).
    const executions = await prisma.cronExecution.findMany({
      where: {
        clanId: parsedClanId,
        action: TELEMETRY_LIVE_SYNC_QUEUE_ACTION,
        status: { in: ['success', 'failed'] },
        ...(startedAtGte
          ? {
              startedAt: {
                gte: startedAtGte,
              },
            }
          : {}),
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: limit,
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        details: true,
      },
    })

    const rows = executions.map((execution) => {
      const jobDetails = asLiveSyncJobDetails(execution.details)
      const durationMs =
        execution.finishedAt && execution.startedAt
          ? Math.max(0, execution.finishedAt.getTime() - execution.startedAt.getTime())
          : null
      const expired =
        execution.status === 'failed' &&
        isTelemetryDataExpiredError(jobDetails.errorCode, jobDetails.errorMessage)

      return {
        id: execution.id,
        squadMatchId: jobDetails.squadMatchId ?? null,
        pubgMatchId: jobDetails.pubgMatchId ?? null,
        startedAt: execution.startedAt.toISOString(),
        finishedAt: execution.finishedAt?.toISOString() ?? null,
        durationMs,
        status: execution.status === 'success' ? ('success' as const) : ('failed' as const),
        expired,
        errorCode: jobDetails.errorCode ?? null,
        errorMessage: jobDetails.errorMessage ?? null,
        bytesDownloaded: typeof jobDetails.bytesDownloaded === 'number' ? jobDetails.bytesDownloaded : 0,
      }
    })

    const summary = rows.reduce(
      (acc, row) => {
        acc.runs += 1
        acc.bytesDownloaded += row.bytesDownloaded

        if (row.status === 'success') {
          acc.success += 1
        } else if (row.expired) {
          acc.expired += 1
        } else {
          acc.failed += 1
        }

        if (row.durationMs !== null) {
          acc.durationMsValues.push(row.durationMs)
        }

        return acc
      },
      {
        runs: 0,
        success: 0,
        failed: 0,
        expired: 0,
        bytesDownloaded: 0,
        durationMsValues: [] as number[],
      }
    )

    // Expired PUBG data is excluded from the rate denominator — it's not a pipeline
    // failure, so it shouldn't count against the health of the sync pipeline.
    const ratedRunsCount = summary.success + summary.failed
    const successRate = ratedRunsCount > 0 ? (summary.success / ratedRunsCount) * 100 : 0
    const failedRate = ratedRunsCount > 0 ? (summary.failed / ratedRunsCount) * 100 : 0

    const durationP95Ms = percentile(summary.durationMsValues, 0.95)

    const thresholds = {
      failedRateMax: 5,
      durationP95MaxMs: 15_000,
    }

    const alerts = [
      {
        key: 'failed_rate',
        label: 'Taux jobs en echec',
        value: failedRate,
        threshold: thresholds.failedRateMax,
        status: failedRate <= thresholds.failedRateMax ? 'ok' : 'warning',
      },
      {
        key: 'duration_p95_ms',
        label: 'Latence job p95',
        value: durationP95Ms,
        threshold: thresholds.durationP95MaxMs,
        status: durationP95Ms <= thresholds.durationP95MaxMs ? 'ok' : 'warning',
      },
    ] as const

    const data = {
      summary: {
        runs: summary.runs,
        success: summary.success,
        failed: summary.failed,
        expired: summary.expired,
        bytesDownloaded: summary.bytesDownloaded,
      },
      health: {
        ratedRuns: ratedRunsCount,
        successRate,
        failedRate,
        thresholds,
        alerts,
      },
      latency: {
        p95DurationMs: durationP95Ms,
      },
      series: rows,
    }

    return NextResponse.json(
      buildTelemetrySuccessResponse(
        {
          scope: 'clan',
          clanId: parsedClanId,
          window,
          limit,
          count: rows.length,
        },
        data,
        {
          clanId: parsedClanId,
          window,
          limit,
          ...data,
        }
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry observability failed:', error)
    return NextResponse.json(buildTelemetryErrorResponse('Failed to load telemetry observability'), {
      status: 500,
    })
  }
}
