import { prisma } from '@/lib/prisma'

const TELEMETRY_RESYNC_QUEUE_ACTION = 'telemetry_resync_file'

export async function reorderQueueByPriority(clanId: number): Promise<{
  reordered: number
  summary: string
}> {
  // Get all queued jobs with their match details
  const queuedJobs = await prisma.cronExecution.findMany({
    where: {
      clanId,
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'queued',
    },
    select: {
      id: true,
      details: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  if (queuedJobs.length === 0) {
    return { reordered: 0, summary: 'No queued jobs to reorder' }
  }

  // For each job, we need to get the squad match details to know creation time
  // We'll use the job.details which should contain squadMatchId
  const jobsWithMatchAge: Array<{
    id: string
    matchAge: number
    jobAge: number
  }> = []

  for (const job of queuedJobs) {
    if (!job.details || typeof job.details !== 'object') {
      continue
    }

    const details = job.details as Record<string, unknown>
    const matchId = details.squadMatchId as string | undefined

    if (!matchId) {
      continue
    }

    // Try to get match creation time
    const match = await prisma.squadMatch.findUnique({
      where: { id: matchId },
      select: { createdAt: true },
    })

    if (match) {
      const matchAge = Date.now() - match.createdAt.getTime()
      const jobAge = Date.now() - job.createdAt.getTime()

      jobsWithMatchAge.push({
        id: job.id,
        matchAge,
        jobAge,
      })
    }
  }

  // Sort by match age (recent first), then by job age (oldest first)
  jobsWithMatchAge.sort((a, b) => {
    const matchComparison = a.matchAge - b.matchAge
    if (matchComparison !== 0) {
      return matchComparison
    }
    return a.jobAge - b.jobAge
  })

  // Assign new priorities by updating startedAt (used in orderBy)
  // More recent jobs get earlier startedAt timestamps
  const now = Date.now()
  const updates = jobsWithMatchAge.map((job, index) => {
    // Spread timestamps over next 24 hours (for stable ordering)
    const priority = index / jobsWithMatchAge.length
    const newStartedAt = new Date(now - 24 * 60 * 60 * 1000 * (1 - priority))

    return prisma.cronExecution.update({
      where: { id: job.id },
      data: {
        startedAt: newStartedAt,
        message: `Reordered to position ${index + 1} of ${jobsWithMatchAge.length}`,
      },
    })
  })

  await Promise.all(updates)

  return {
    reordered: jobsWithMatchAge.length,
    summary: `Reordered ${jobsWithMatchAge.length} queued jobs by match recency`,
  }
}

export async function getQueuePriority(clanId: number): Promise<{
  queuedCount: number
  nextJobId: string | null
  nextJobMatchId: string | null
}> {
  const nextJob = await prisma.cronExecution.findFirst({
    where: {
      clanId,
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'queued',
    },
    select: {
      id: true,
      details: true,
    },
    orderBy: {
      startedAt: 'asc',
    },
  })

  const queuedCount = await prisma.cronExecution.count({
    where: {
      clanId,
      action: TELEMETRY_RESYNC_QUEUE_ACTION,
      status: 'queued',
    },
  })

  let nextMatchId: string | null = null
  if (nextJob && nextJob.details && typeof nextJob.details === 'object') {
    const details = nextJob.details as Record<string, unknown>
    nextMatchId = (details.squadMatchId as string) || null
  }

  return {
    queuedCount,
    nextJobId: nextJob?.id ?? null,
    nextJobMatchId: nextMatchId,
  }
}
