import { NextRequest } from 'next/server'
import { withAdminActionLog } from '@/lib/admin-action-log'
import { prisma } from '@/lib/prisma'
import { requireClanFeature } from '@/lib/auth/admin-guards'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const TELEMETRY_RESYNC_QUEUE_ACTION = 'telemetry_resync_file'

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireClanFeature(request, parsedClanId, 'clan-telemetry-tools')
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

export const POST = withAdminActionLog('clans/[clanId]/telemetry/dead-letter', handlePost)
