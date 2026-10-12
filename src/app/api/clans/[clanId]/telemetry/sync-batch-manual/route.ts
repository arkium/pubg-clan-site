import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'

/**
 * État de la file de retraitement de fichiers d'un clan (`telemetry_resync_file`) et ses 20 derniers jobs, lu par
 * « Santé des données », « Récupérations › Échecs » et la soirée (docs/telemetry/dashboard.md). Le POST, qui mettait
 * des parties en file depuis l'onglet Synchronisation, a été retiré avec lui (docs/TODO/administration.md §8).
 */

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

    const roleError = await requirePlatformAdmin(request)
    if (roleError) {
      return roleError
    }

    // Get queue stats
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

    // Get recent jobs
    const recentJobs = await prisma.cronExecution.findMany({
      where: {
        clanId: parsedClanId,
        action: 'telemetry_resync_file',
      },
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return Response.json({
      ok: true,
      clanId: parsedClanId,
      queue: {
        queued,
        running,
        success,
        failed,
        total: queued + running + success + failed,
      },
      recentJobs: recentJobs.map((job) => ({
        id: job.id,
        status: job.status,
        message: job.message,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        duration: job.finishedAt && job.startedAt ?
          (job.finishedAt.getTime() - job.startedAt.getTime()) / 1000 :
          null,
      })),
    })
  } catch (error) {
    console.error('Batch sync status failed:', error)
    return Response.json(
      { error: 'Failed to fetch batch sync status' },
      { status: 500 }
    )
  }
}
