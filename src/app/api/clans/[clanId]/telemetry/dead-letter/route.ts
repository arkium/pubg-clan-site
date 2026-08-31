import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const TELEMETRY_RESYNC_QUEUE_ACTION = 'telemetry_resync_file'
const MAX_RETRY_ATTEMPTS = 5

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

    // Get permanently failed jobs (failed and at max retry attempts)
    const deadLetterJobs = await prisma.cronExecution.findMany({
      where: {
        clanId: parsedClanId,
        action: TELEMETRY_RESYNC_QUEUE_ACTION,
        status: 'failed',
      },
      select: {
        id: true,
        message: true,
        createdAt: true,
        finishedAt: true,
        details: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Filter to only those with max retries (check attempt count from details or status patterns)
    const filtered = deadLetterJobs.filter((job) => {
      // A job in dead letter queue is one that has failed and older than 1 hour
      // (meaning it wasn't retried recently), OR it's been attempted multiple times
      if (!job.finishedAt) return false

      const ageMs = Date.now() - job.finishedAt.getTime()
      const oneHourMs = 60 * 60 * 1000
      return ageMs > oneHourMs
    })

    return Response.json({
      ok: true,
      clanId: parsedClanId,
      deadLetterCount: filtered.length,
      deadLetterJobs: filtered.map((job) => ({
        id: job.id,
        message: job.message,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt,
        details: job.details,
      })),
    })
  } catch (error) {
    console.error('Dead letter queue fetch failed:', error)
    return Response.json(
      { error: 'Failed to fetch dead letter queue' },
      { status: 500 }
    )
  }
}

export async function POST(
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

    const body = (await request.json().catch(() => null)) as {
      jobIds?: unknown
    } | null

    if (!Array.isArray(body?.jobIds) || body.jobIds.length === 0) {
      return Response.json(
        { error: 'jobIds must be a non-empty array of strings' },
        { status: 400 }
      )
    }

    const jobIds = body.jobIds
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .slice(0, 50)

    if (jobIds.length === 0) {
      return Response.json(
        { error: 'No valid job IDs provided' },
        { status: 400 }
      )
    }

    // Reset selected jobs to queued status
    const updated = await prisma.cronExecution.updateMany({
      where: {
        id: { in: jobIds },
        clanId: parsedClanId,
        action: TELEMETRY_RESYNC_QUEUE_ACTION,
        status: 'failed',
      },
      data: {
        status: 'queued',
        message: 'Retried from dead letter queue',
        startedAt: new Date(),
        finishedAt: null,
      },
    })

    // Get updated job count
    const queuedCount = await prisma.cronExecution.count({
      where: {
        clanId: parsedClanId,
        action: TELEMETRY_RESYNC_QUEUE_ACTION,
        status: 'queued',
      },
    })

    return Response.json({
      ok: true,
      clanId: parsedClanId,
      jobsRetried: updated.count,
      newQueuedCount: queuedCount,
      message: `Retried ${updated.count} jobs from dead letter queue`,
    })
  } catch (error) {
    console.error('Dead letter retry failed:', error)
    return Response.json(
      { error: 'Failed to retry dead letter jobs' },
      { status: 500 }
    )
  }
}
