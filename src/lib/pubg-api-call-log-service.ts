import { prisma } from '@/lib/prisma'

export type PubgApiCallLogInput = {
  source?: string
  method: string
  endpoint: string
  shard?: string | null
  statusCode?: number | null
  success: boolean
  retryCount?: number
  startedAt: Date
  finishedAt: Date
  durationMs: number
  clanId?: number | null
  memberId?: number | null
  errorMessage?: string | null
  rateLimitLimit?: number | null
  rateLimitRemaining?: number | null
  rateLimitResetAt?: Date | null
}

export async function createPubgApiCallLog(input: PubgApiCallLogInput) {
  await prisma.pubgApiCallLog.create({
    data: {
      source: input.source ?? 'gateway',
      method: input.method,
      endpoint: input.endpoint,
      shard: input.shard ?? null,
      statusCode: input.statusCode ?? null,
      success: input.success,
      retryCount: input.retryCount ?? 0,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      clanId: input.clanId ?? null,
      memberId: input.memberId ?? null,
      errorMessage: input.errorMessage ? input.errorMessage.slice(0, 191) : null,
      rateLimitLimit: input.rateLimitLimit ?? null,
      rateLimitRemaining: input.rateLimitRemaining ?? null,
      rateLimitResetAt: input.rateLimitResetAt ?? null,
    },
  })
}

export async function getPubgApiCallsOverview(params?: {
  windowMinutes?: number
  historyPage?: number
  historyPageSize?: number
  errorsOnly?: boolean
}) {
  const windowMinutes = Math.max(5, Math.min(24 * 60, params?.windowMinutes ?? 60))
  const historyPage = Math.max(1, params?.historyPage ?? 1)
  const historyPageSize = Math.max(10, Math.min(100, params?.historyPageSize ?? 25))
  const errorsOnly = params?.errorsOnly === true

  const from = new Date(Date.now() - windowMinutes * 60_000)
  const historyWhere = errorsOnly
    ? {
        OR: [
          { success: false },
          { statusCode: 429 },
          { errorMessage: { not: null } },
        ],
      }
    : undefined

  const [windowRows, historyRows, historyTotal, latestRateLimitRow] = await Promise.all([
    prisma.pubgApiCallLog.findMany({
      where: { startedAt: { gte: from } },
      orderBy: { startedAt: 'asc' },
      select: {
        startedAt: true,
        success: true,
        statusCode: true,
        durationMs: true,
      },
    }),
    prisma.pubgApiCallLog.findMany({
      where: historyWhere,
      orderBy: { startedAt: 'desc' },
      skip: (historyPage - 1) * historyPageSize,
      take: historyPageSize,
      select: {
        id: true,
        source: true,
        method: true,
        endpoint: true,
        shard: true,
        statusCode: true,
        success: true,
        retryCount: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        clanId: true,
        memberId: true,
        errorMessage: true,
        rateLimitLimit: true,
        rateLimitRemaining: true,
        rateLimitResetAt: true,
      },
    }),
    prisma.pubgApiCallLog.count({ where: historyWhere }),
    prisma.pubgApiCallLog.findFirst({
      where: {
        OR: [
          { rateLimitRemaining: { not: null } },
          { rateLimitLimit: { not: null } },
          { rateLimitResetAt: { not: null } },
        ],
      },
      orderBy: { startedAt: 'desc' },
      select: {
        startedAt: true,
        rateLimitLimit: true,
        rateLimitRemaining: true,
        rateLimitResetAt: true,
      },
    }),
  ])

  const memberIds = Array.from(
    new Set(
      historyRows
        .map((row) => row.memberId)
        .filter((value): value is number => typeof value === 'number')
    )
  )

  const members =
    memberIds.length > 0
      ? await prisma.clanMember.findMany({
          where: { id: { in: memberIds } },
          select: {
            id: true,
            displayName: true,
            pubgPlayerName: true,
          },
        })
      : []

  const memberMap = new Map(
    members.map((member) => [member.id, member.displayName || member.pubgPlayerName || `Member #${member.id}`])
  )

  const historyWithActor = historyRows.map((row) => {
    const memberName = typeof row.memberId === 'number' ? memberMap.get(row.memberId) : null
    const actorLabel = memberName ? `${memberName} (membre #${row.memberId})` : `Source: ${row.source}`

    return {
      ...row,
      actorLabel,
    }
  })

  const minuteBuckets = new Map<string, {
    minute: string
    total: number
    success: number
    rateLimited: number
    errors: number
  }>()

  for (let i = windowMinutes - 1; i >= 0; i -= 1) {
    const minuteDate = new Date(Date.now() - i * 60_000)
    minuteDate.setSeconds(0, 0)
    const minute = minuteDate.toISOString()
    minuteBuckets.set(minute, {
      minute,
      total: 0,
      success: 0,
      rateLimited: 0,
      errors: 0,
    })
  }

  let total = 0
  let success = 0
  let rateLimited = 0
  let errors = 0
  let durationTotal = 0

  for (const row of windowRows) {
    total += 1
    durationTotal += row.durationMs ?? 0

    if (row.success) {
      success += 1
    }

    if (row.statusCode === 429) {
      rateLimited += 1
    }

    if (!row.success) {
      errors += 1
    }

    const bucketDate = new Date(row.startedAt)
    bucketDate.setSeconds(0, 0)
    const minuteKey = bucketDate.toISOString()
    const bucket = minuteBuckets.get(minuteKey)

    if (!bucket) {
      continue
    }

    bucket.total += 1
    if (row.success) {
      bucket.success += 1
    }
    if (row.statusCode === 429) {
      bucket.rateLimited += 1
    }
    if (!row.success) {
      bucket.errors += 1
    }
  }

  return {
    windowMinutes,
    totals: {
      total,
      success,
      rateLimited,
      errors,
      avgDurationMs: total > 0 ? Math.round(durationTotal / total) : null,
    },
    series: Array.from(minuteBuckets.values()),
    history: historyWithActor,
    historyPagination: {
      page: historyPage,
      pageSize: historyPageSize,
      total: historyTotal,
      totalPages: Math.max(1, Math.ceil(historyTotal / historyPageSize)),
      errorsOnly,
    },
    latestRateLimit: latestRateLimitRow
      ? {
          limit: latestRateLimitRow.rateLimitLimit,
          remaining: latestRateLimitRow.rateLimitRemaining,
          resetAt: latestRateLimitRow.rateLimitResetAt,
          observedAt: latestRateLimitRow.startedAt,
        }
      : null,
  }
}
