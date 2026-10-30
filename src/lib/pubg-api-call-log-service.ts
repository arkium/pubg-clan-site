import { prisma } from '@/lib/prisma'
import {
  categorizePubgApiCall,
  classifyPubgApiFailure,
  emptyPubgApiFailureCounts,
  PUBG_API_CALL_CATEGORIES,
  PUBG_API_CALL_CATEGORY_LABELS,
  PUBG_API_FAILURE_CLASSES,
  pubgApiPriorityOfSource,
  type PubgApiCallCategory,
  type PubgApiFailureClass,
  type PubgApiFailureCounts,
} from '@/lib/pubg-api-call-category'

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

export async function purgePubgApiCallLogHistory() {
  const result = await prisma.pubgApiCallLog.deleteMany({})
  return result.count
}

export async function getLatestPubgRateLimitSnapshot() {
  const latestRateLimitRow = await prisma.pubgApiCallLog.findFirst({
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
  })

  if (!latestRateLimitRow) {
    return null
  }

  return {
    limit: latestRateLimitRow.rateLimitLimit,
    remaining: latestRateLimitRow.rateLimitRemaining,
    resetAt: latestRateLimitRow.rateLimitResetAt,
    observedAt: latestRateLimitRow.startedAt,
  }
}

export async function getPubgApiCallsOverview(params?: {
  windowMinutes?: number
  historyPage?: number
  historyPageSize?: number
  errorsOnly?: boolean
  historyQuery?: string
  historyClanId?: number
}) {
  const windowMinutes = 24 * 60
  const bucketMinutes = 30
  const bucketMs = bucketMinutes * 60_000
  const trendDays = 14
  const historyPage = Math.max(1, params?.historyPage ?? 1)
  const historyPageSize = Math.max(10, Math.min(100, params?.historyPageSize ?? 15))
  const errorsOnly = params?.errorsOnly === true
  const historyQuery = params?.historyQuery?.trim() || undefined
  const historyClanId = params?.historyClanId

  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart.getTime() + windowMinutes * 60_000)
  const trendStart = new Date(dayStart.getTime() - (trendDays - 1) * 24 * 60 * 60_000)

  const historyConditions = [
    errorsOnly
      ? {
          OR: [
            { success: false },
            { statusCode: 429 },
            { errorMessage: { not: null } },
          ],
        }
      : undefined,
    historyQuery
      ? {
          OR: [
            { endpoint: { contains: historyQuery } },
            { source: { contains: historyQuery } },
          ],
        }
      : undefined,
    typeof historyClanId === 'number' && Number.isFinite(historyClanId)
      ? { clanId: historyClanId }
      : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined)

  const historyWhere = historyConditions.length > 0 ? { AND: historyConditions } : undefined

  const hourAgo = new Date(Date.now() - 60 * 60_000)
  const [dayRows, trendRows, historyRows, historyTotal, latestRateLimitRow, lastHourBySource] = await Promise.all([
    prisma.pubgApiCallLog.findMany({
      where: {
        startedAt: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      orderBy: { startedAt: 'asc' },
      select: {
        startedAt: true,
        success: true,
        statusCode: true,
        durationMs: true,
        source: true,
        endpoint: true,
        retryCount: true,
        errorMessage: true,
        clanId: true,
        memberId: true,
        rateLimitLimit: true,
      },
    }),
    prisma.pubgApiCallLog.findMany({
      where: {
        startedAt: {
          gte: trendStart,
          lt: dayEnd,
        },
      },
      orderBy: { startedAt: 'asc' },
      select: {
        startedAt: true,
        success: true,
        statusCode: true,
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
    // Quota : appels limités (en-tête X-RateLimit présent) de la dernière heure, par origine (~550 lignes).
    prisma.pubgApiCallLog.groupBy({
      by: ['source'],
      where: { startedAt: { gte: hourAgo }, rateLimitLimit: { not: null } },
      _count: { _all: true },
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

  // Certains appels ne portent que `memberId` (routes membre) sans `clanId` direct sur la ligne :
  // on resout le clan via ClanMember plutot que d'exiger que chaque site d'appel connaisse son clanId.
  const dayRowMemberIds = Array.from(
    new Set(
      dayRows
        .filter((row) => row.clanId === null && typeof row.memberId === 'number')
        .map((row) => row.memberId as number)
    )
  )

  const memberClanRows =
    dayRowMemberIds.length > 0
      ? await prisma.clanMember.findMany({
          where: { id: { in: dayRowMemberIds } },
          select: { id: true, clanId: true },
        })
      : []

  const memberIdToClanId = new Map(memberClanRows.map((member) => [member.id, member.clanId]))

  function resolveClanIdForRow(row: { clanId: number | null; memberId: number | null }) {
    if (row.clanId !== null) return row.clanId
    if (typeof row.memberId === 'number') return memberIdToClanId.get(row.memberId) ?? null
    return null
  }

  const minuteBuckets = new Map<string, {
    minute: string
    total: number
    success: number
    rateLimited: number
    errors: number
  } & PubgApiFailureCounts>()

  for (let offsetMs = 0; offsetMs < windowMinutes * 60_000; offsetMs += bucketMs) {
    const minuteDate = new Date(dayStart.getTime() + offsetMs)
    const minute = minuteDate.toISOString()
    minuteBuckets.set(minute, {
      minute,
      total: 0,
      success: 0,
      errors: 0,
      ...emptyPubgApiFailureCounts(),
    })
  }

  // Échecs du jour par classe (attendu, passager, 429, à traiter), puis regroupés par classe, code et type d'appel :
  // un message par partie (« … /matches/<id> ») ne disait rien à la lecture.
  const failures = emptyPubgApiFailureCounts()
  const failureGroups = new Map<
    string,
    { failureClass: PubgApiFailureClass; statusCode: number | null; category: PubgApiCallCategory; count: number; example: string | null }
  >()

  let total = 0
  let success = 0
  let rateLimited = 0
  let errors = 0
  let durationTotal = 0
  let retriesTotal = 0

  const categoryStats = new Map<
    PubgApiCallCategory,
    { count: number; success: number; errors: number; rateLimited: number; durationTotal: number }
  >(PUBG_API_CALL_CATEGORIES.map((category) => [category, { count: 0, success: 0, errors: 0, rateLimited: 0, durationTotal: 0 }]))

  const clanStats = new Map<
    number | null,
    { count: number; success: number; errors: number; rateLimited: number; durationTotal: number }
  >()

  for (const row of dayRows) {
    total += 1
    durationTotal += row.durationMs ?? 0
    retriesTotal += row.retryCount ?? 0

    if (row.success) {
      success += 1
    }

    if (row.statusCode === 429) {
      rateLimited += 1
    }

    if (!row.success) {
      errors += 1
    }

    const category = categorizePubgApiCall(row.source, row.endpoint)
    const categoryStat = categoryStats.get(category)
    if (categoryStat) {
      categoryStat.count += 1
      categoryStat.durationTotal += row.durationMs ?? 0
      if (row.success) categoryStat.success += 1
      if (!row.success) categoryStat.errors += 1
      if (row.statusCode === 429) categoryStat.rateLimited += 1
    }

    const resolvedClanId = resolveClanIdForRow(row)
    const clanStat = clanStats.get(resolvedClanId) ?? {
      count: 0,
      success: 0,
      errors: 0,
      rateLimited: 0,
      durationTotal: 0,
    }
    clanStat.count += 1
    clanStat.durationTotal += row.durationMs ?? 0
    if (row.success) clanStat.success += 1
    if (!row.success) clanStat.errors += 1
    if (row.statusCode === 429) clanStat.rateLimited += 1
    clanStats.set(resolvedClanId, clanStat)

    const failureClass = row.success ? null : classifyPubgApiFailure(row.statusCode)
    if (failureClass) {
      failures[failureClass] += 1
      const groupKey = `${failureClass}:${row.statusCode ?? 'none'}:${category}`
      const group = failureGroups.get(groupKey) ?? {
        failureClass,
        statusCode: row.statusCode,
        category,
        count: 0,
        example: row.errorMessage,
      }
      group.count += 1
      failureGroups.set(groupKey, group)
    }

    const elapsedMs = new Date(row.startedAt).getTime() - dayStart.getTime()
    if (elapsedMs < 0 || elapsedMs >= windowMinutes * 60_000) {
      continue
    }

    const bucketIndex = Math.floor(elapsedMs / bucketMs)
    const bucketStart = new Date(dayStart.getTime() + bucketIndex * bucketMs)
    const minuteKey = bucketStart.toISOString()
    const bucket = minuteBuckets.get(minuteKey)

    if (!bucket) {
      continue
    }

    bucket.total += 1
    if (row.success) {
      bucket.success += 1
    }
    if (!row.success) {
      bucket.errors += 1
    }
    if (failureClass) {
      bucket[failureClass] += 1
    }
  }

  const byCategory = PUBG_API_CALL_CATEGORIES.map((category) => {
    const stat = categoryStats.get(category)!
    return {
      category,
      label: PUBG_API_CALL_CATEGORY_LABELS[category],
      count: stat.count,
      success: stat.success,
      errors: stat.errors,
      rateLimited: stat.rateLimited,
      avgDurationMs: stat.count > 0 ? Math.round(stat.durationTotal / stat.count) : null,
    }
  }).filter((entry) => entry.count > 0)

  // Quota (docs/TODO/fraicheur-des-parties.md, lot 2) : la dernière heure par priorité, et chaque heure du jour.
  const lastHour = { limited: 0, high: 0, normal: 0, low: 0 }
  for (const group of lastHourBySource) {
    lastHour.limited += group._count._all
    lastHour[pubgApiPriorityOfSource(group.source)] += group._count._all
  }
  const limitedByHour = new Map<string, number>()
  for (const row of dayRows) {
    if (row.rateLimitLimit === null) continue
    const hour = new Date(row.startedAt)
    hour.setMinutes(0, 0, 0)
    limitedByHour.set(hour.toISOString(), (limitedByHour.get(hour.toISOString()) ?? 0) + 1)
  }
  const byHour = Array.from(limitedByHour.entries()).map(([hour, limited]) => ({ hour, limited }))
  const peakHour = byHour.reduce<{ hour: string; limited: number } | null>((peak, entry) => (!peak || entry.limited > peak.limited ? entry : peak), null)

  const failureRank = (failureClass: PubgApiFailureClass) => PUBG_API_FAILURE_CLASSES.indexOf(failureClass)
  const topFailures = Array.from(failureGroups.values())
    .map((group) => ({
      ...group,
      label: `${group.statusCode ?? 'Sans réponse'} · ${PUBG_API_CALL_CATEGORY_LABELS[group.category]}`,
    }))
    .sort((a, b) => failureRank(a.failureClass) - failureRank(b.failureClass) || b.count - a.count)
    .slice(0, 8)

  const involvedClanIds = Array.from(clanStats.keys()).filter(
    (id): id is number => id !== null
  )
  const involvedClans =
    involvedClanIds.length > 0
      ? await prisma.clan.findMany({
          where: { id: { in: involvedClanIds } },
          select: { id: true, name: true, tag: true },
        })
      : []
  const clanLabelMap = new Map(involvedClans.map((clan) => [clan.id, `${clan.name} [${clan.tag}]`]))

  const byClan = Array.from(clanStats.entries())
    .map(([clanId, stat]) => ({
      clanId,
      label: clanId === null ? 'Sans clan' : (clanLabelMap.get(clanId) ?? `Clan #${clanId}`),
      count: stat.count,
      success: stat.success,
      errors: stat.errors,
      rateLimited: stat.rateLimited,
      avgDurationMs: stat.count > 0 ? Math.round(stat.durationTotal / stat.count) : null,
    }))
    .sort((a, b) => b.count - a.count)

  // Jours du fuseau du serveur, comme `dayStart` : une clé UTC rangeait mal les appels d'un serveur qui n'est pas en UTC
  // (aucun appel du jour dans la tendance d'un poste à l'heure de Paris). En production (UTC), rien ne change.
  const localDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const dailyBuckets = new Map<string, { date: string; total: number; success: number; errors: number } & PubgApiFailureCounts>()
  for (let offsetDays = 0; offsetDays < trendDays; offsetDays += 1) {
    const bucketDate = new Date(dayStart)
    bucketDate.setDate(dayStart.getDate() - (trendDays - 1 - offsetDays))
    const dateKey = localDateKey(bucketDate)
    dailyBuckets.set(dateKey, { date: dateKey, total: 0, success: 0, errors: 0, ...emptyPubgApiFailureCounts() })
  }

  for (const row of trendRows) {
    const dateKey = localDateKey(new Date(row.startedAt))
    const bucket = dailyBuckets.get(dateKey)
    if (!bucket) continue

    bucket.total += 1
    if (row.success) bucket.success += 1
    if (!row.success) {
      bucket.errors += 1
      bucket[classifyPubgApiFailure(row.statusCode)] += 1
    }
  }

  return {
    windowMinutes,
    totals: {
      total,
      success,
      rateLimited,
      errors,
      retriesTotal,
      avgDurationMs: total > 0 ? Math.round(durationTotal / total) : null,
      failures,
    },
    series: Array.from(minuteBuckets.values()),
    dailySeries: Array.from(dailyBuckets.values()),
    byCategory,
    byClan,
    topFailures,
    quota: { lastHour, peakHour, byHour },
    history: historyWithActor,
    historyPagination: {
      page: historyPage,
      pageSize: historyPageSize,
      total: historyTotal,
      totalPages: Math.max(1, Math.ceil(historyTotal / historyPageSize)),
      errorsOnly,
      query: historyQuery ?? null,
      clanId: historyClanId ?? null,
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
