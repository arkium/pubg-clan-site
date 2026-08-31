
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const url = new URL(request.url)
    const format = url.searchParams.get('format') ?? 'json'

    // Get queue metrics
    const [queued, running, success, failed] = await Promise.all([
      prisma.cronExecution.count({
        where: {
          clanId: parsedClanId,
          action: 'telemetry_resync_file',
          status: 'queued',
        },
      }),
      prisma.cronExecution.count({
        where: {
          clanId: parsedClanId,
          action: 'telemetry_resync_file',
          status: 'running',
        },
      }),
      prisma.cronExecution.count({
        where: {
          clanId: parsedClanId,
          action: 'telemetry_resync_file',
          status: 'success',
        },
      }),
      prisma.cronExecution.count({
        where: {
          clanId: parsedClanId,
          action: 'telemetry_resync_file',
          status: 'failed',
        },
      }),
    ])

    // Get recent failures for error count
    const recentFailures = await prisma.cronExecution.count({
      where: {
        clanId: parsedClanId,
        action: 'telemetry_resync_file',
        status: 'failed',
        finishedAt: {
          gt: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
    })

    // Get average duration of successful jobs
    const successfulJobs = await prisma.cronExecution.findMany({
      where: {
        clanId: parsedClanId,
        action: 'telemetry_resync_file',
        status: 'success',
      },
      select: {
        durationMs: true,
      },
      orderBy: { finishedAt: 'desc' },
      take: 100,
    })

    const avgDurationMs =
      successfulJobs.length > 0
        ? Math.round(
            successfulJobs.reduce((sum, job) => sum + (job.durationMs || 0), 0) /
              successfulJobs.length
          )
        : 0

    const metricsData = {
      clanId: parsedClanId,
      timestamp: new Date().toISOString(),
      queue: {
        queued,
        running,
        success,
        failed,
        total: queued + running + success + failed,
      },
      performance: {
        avgDurationMs,
        successRate: success + failed > 0 ? (success / (success + failed)) * 100 : 0,
        recentFailures,
      },
    }

    if (format === 'prometheus') {
      // Return Prometheus text format
      const lines = [
        '# HELP telemetry_jobs_queued Number of jobs waiting to process',
        '# TYPE telemetry_jobs_queued gauge',
        `telemetry_jobs_queued{clan="${parsedClanId}"} ${queued}`,
        '',
        '# HELP telemetry_jobs_running Number of jobs currently processing',
        '# TYPE telemetry_jobs_running gauge',
        `telemetry_jobs_running{clan="${parsedClanId}"} ${running}`,
        '',
        '# HELP telemetry_jobs_success Total successful jobs',
        '# TYPE telemetry_jobs_success counter',
        `telemetry_jobs_success{clan="${parsedClanId}"} ${success}`,
        '',
        '# HELP telemetry_jobs_failed Total failed jobs',
        '# TYPE telemetry_jobs_failed counter',
        `telemetry_jobs_failed{clan="${parsedClanId}"} ${failed}`,
        '',
        '# HELP telemetry_recent_failures Failed jobs in last hour',
        '# TYPE telemetry_recent_failures gauge',
        `telemetry_recent_failures{clan="${parsedClanId}"} ${recentFailures}`,
        '',
        '# HELP telemetry_success_rate Success rate percentage',
        '# TYPE telemetry_success_rate gauge',
        `telemetry_success_rate{clan="${parsedClanId}"} ${metricsData.performance.successRate.toFixed(2)}`,
        '',
        '# HELP telemetry_avg_duration_ms Average job duration in milliseconds',
        '# TYPE telemetry_avg_duration_ms gauge',
        `telemetry_avg_duration_ms{clan="${parsedClanId}"} ${avgDurationMs}`,
      ]

      return new Response(lines.join('\n'), {
        headers: { 'Content-Type': 'text/plain; version=0.0.4' },
      })
    }

    // Default JSON format
    return Response.json({
      ok: true,
      ...metricsData,
    })
  } catch (error) {
    console.error('Metrics export failed:', error)
    return Response.json(
      { error: 'Failed to export metrics' },
      { status: 500 }
    )
  }
}
