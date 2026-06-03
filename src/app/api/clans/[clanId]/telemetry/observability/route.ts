import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { requireRole } from '@/middleware/auth-permission'

type TimeWindow = '24h' | '7d' | '30d' | 'all'

type TelemetrySyncDetails = {
  status?: string
  reason?: string
  scanned?: number
  parsed?: number
  failed?: number
  skipped?: number
  metrics?: {
    bytesDownloaded?: number
    fetchMatchMs?: number
    downloadAssetMs?: number
    parseMs?: number
    persistMs?: number
  }
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

function asFiniteNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return value
}

function asTelemetrySyncDetails(value: unknown): TelemetrySyncDetails | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const details = value as Record<string, unknown>
  const telemetrySync = details.telemetrySync

  if (!telemetrySync || typeof telemetrySync !== 'object') {
    return null
  }

  return telemetrySync as TelemetrySyncDetails
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

    const executions = await prisma.cronExecution.findMany({
      where: {
        clanId: parsedClanId,
        action: 'daily_sync',
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
        durationMs: true,
        details: true,
      },
    })

    const rows = executions.map((execution) => {
      const telemetrySync = asTelemetrySyncDetails(execution.details)
      const metrics = telemetrySync?.metrics

      return {
        id: execution.id,
        startedAt: execution.startedAt.toISOString(),
        finishedAt: execution.finishedAt?.toISOString() ?? null,
        cronStatus: execution.status,
        durationMs: execution.durationMs,
        telemetry: {
          status: telemetrySync?.status ?? 'unknown',
          reason: telemetrySync?.reason ?? null,
          scanned: asFiniteNumber(telemetrySync?.scanned),
          parsed: asFiniteNumber(telemetrySync?.parsed),
          failed: asFiniteNumber(telemetrySync?.failed),
          skipped: asFiniteNumber(telemetrySync?.skipped),
          bytesDownloaded: asFiniteNumber(metrics?.bytesDownloaded),
          fetchMatchMs: asFiniteNumber(metrics?.fetchMatchMs),
          downloadAssetMs: asFiniteNumber(metrics?.downloadAssetMs),
          parseMs: asFiniteNumber(metrics?.parseMs),
          persistMs: asFiniteNumber(metrics?.persistMs),
        },
      }
    })

    const summary = rows.reduce(
      (acc, row) => {
        acc.runs += 1
        acc.scanned += row.telemetry.scanned
        acc.parsed += row.telemetry.parsed
        acc.failed += row.telemetry.failed
        acc.skipped += row.telemetry.skipped
        acc.bytesDownloaded += row.telemetry.bytesDownloaded
        acc.fetchMatchMs += row.telemetry.fetchMatchMs
        acc.downloadAssetMs += row.telemetry.downloadAssetMs
        acc.parseMs += row.telemetry.parseMs
        acc.persistMs += row.telemetry.persistMs
        return acc
      },
      {
        runs: 0,
        scanned: 0,
        parsed: 0,
        failed: 0,
        skipped: 0,
        bytesDownloaded: 0,
        fetchMatchMs: 0,
        downloadAssetMs: 0,
        parseMs: 0,
        persistMs: 0,
      }
    )

    const runsWithTelemetry = rows.filter((row) => row.telemetry.status !== 'unknown')
    const successfulRuns = runsWithTelemetry.filter((row) => row.telemetry.status === 'success').length
    const failedRuns = runsWithTelemetry.filter((row) => row.telemetry.failed > 0).length

    const successRate =
      runsWithTelemetry.length > 0 ? (successfulRuns / runsWithTelemetry.length) * 100 : 0
    const failedRate =
      runsWithTelemetry.length > 0 ? (failedRuns / runsWithTelemetry.length) * 100 : 0

    const p95 = {
      fetchMatchMs: percentile(
        rows.map((row) => row.telemetry.fetchMatchMs).filter((value) => value > 0),
        0.95
      ),
      downloadAssetMs: percentile(
        rows.map((row) => row.telemetry.downloadAssetMs).filter((value) => value > 0),
        0.95
      ),
      parseMs: percentile(
        rows.map((row) => row.telemetry.parseMs).filter((value) => value > 0),
        0.95
      ),
      persistMs: percentile(
        rows.map((row) => row.telemetry.persistMs).filter((value) => value > 0),
        0.95
      ),
    }

    const thresholds = {
      failedRateMax: 5,
      parseP95MaxMs: 3000,
    }

    const alerts = [
      {
        key: 'failed_rate',
        label: 'Taux runs en echec',
        value: failedRate,
        threshold: thresholds.failedRateMax,
        status: failedRate <= thresholds.failedRateMax ? 'ok' : 'warning',
      },
      {
        key: 'parse_p95_ms',
        label: 'Latence parse p95',
        value: p95.parseMs,
        threshold: thresholds.parseP95MaxMs,
        status: p95.parseMs <= thresholds.parseP95MaxMs ? 'ok' : 'warning',
      },
    ] as const

    return NextResponse.json(
      buildTelemetrySuccessResponse(
        {
          scope: 'clan',
          clanId: parsedClanId,
          window,
          limit,
          count: rows.length,
        },
        {
          summary,
          health: {
            runsWithTelemetry: runsWithTelemetry.length,
            successRate,
            failedRate,
            thresholds,
            alerts,
          },
          latency: {
            p95,
          },
          series: rows,
        },
        {
          clanId: parsedClanId,
          window,
          limit,
          summary,
          health: {
            runsWithTelemetry: runsWithTelemetry.length,
            successRate,
            failedRate,
            thresholds,
            alerts,
          },
          latency: {
            p95,
          },
          series: rows,
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
