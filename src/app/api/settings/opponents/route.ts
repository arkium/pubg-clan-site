import { Prisma } from '@prisma/client'

import { requireSuperUser } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 10

const CLAN_SORT_KEYS = ['name', 'members', 'encounters', 'lastMatch'] as const
type ClanSortKey = (typeof CLAN_SORT_KEYS)[number]

const OPPONENT_SORT_KEYS = ['opponent', 'asOpponent', 'asTeammate', 'lastSeen', 'memberCount', 'trackedClansCount'] as const
type OpponentSortKey = (typeof OPPONENT_SORT_KEYS)[number]

type SortDirection = 'asc' | 'desc'

function parsePeriod(value: string | null): Date | null {
  const now = new Date()
  if (value === 'week') {
    now.setDate(now.getDate() - 7)
    return now
  }
  if (value === 'month') {
    now.setDate(now.getDate() - 30)
    return now
  }
  return null
}

function parsePage(value: string | null): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function parseSortDir(value: string | null, fallback: SortDirection): SortDirection {
  return value === 'asc' || value === 'desc' ? value : fallback
}

function parseClanSortKey(value: string | null): ClanSortKey {
  return CLAN_SORT_KEYS.includes(value as ClanSortKey) ? (value as ClanSortKey) : 'name'
}

function parseOpponentSortKey(value: string | null): OpponentSortKey {
  return OPPONENT_SORT_KEYS.includes(value as OpponentSortKey) ? (value as OpponentSortKey) : 'asOpponent'
}

type TrackedClanRow = {
  id: number
  name: string
  tag: string
  membersCount: number
  lastMatchAt: string | null
  missingMembersCount: number
}

type OpponentClanRow = {
  id: string
  tag: string | null
  name: string | null
  isFavorite: boolean
  asOpponentCount: number
  asTeammateCount: number
  lastSeenAt: string | null
  memberCount: number
  trackedClansCount: number
}

export async function GET(request: Request) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) {
    return permissionError
  }

  const url = new URL(request.url)
  const periodStart = parsePeriod(url.searchParams.get('period'))

  const clansPage = parsePage(url.searchParams.get('clansPage'))
  const clansSortBy = parseClanSortKey(url.searchParams.get('clansSortBy'))
  const clansSortDir = parseSortDir(url.searchParams.get('clansSortDir'), 'desc')
  const clansQuery = (url.searchParams.get('clansQ') ?? '').trim().toLowerCase()

  const opponentsPage = parsePage(url.searchParams.get('opponentsPage'))
  const opponentsSortBy = parseOpponentSortKey(url.searchParams.get('opponentsSortBy'))
  const opponentsSortDir = parseSortDir(url.searchParams.get('opponentsSortDir'), 'desc')
  const opponentsQuery = (url.searchParams.get('opponentsQ') ?? '').trim()

  const periodFilter = periodStart ? Prisma.sql`AND ce.lastSeenAt >= ${periodStart}` : Prisma.empty

  // --- Tableau 1 : clans suivis --------------------------------------------
  const clans = await prisma.clan.findMany({
    where: { isActive: true },
    include: { _count: { select: { members: { where: { isActive: true } } } } },
  })

  const activeMembers = await prisma.clanMember.findMany({
    where: { isActive: true, clanId: { not: null } },
    select: { id: true, clanId: true },
  })
  const memberClanById = new Map(activeMembers.map((member) => [member.id, member.clanId]))

  const matchAggregates = await prisma.match.groupBy({
    by: ['memberId'],
    where: { memberId: { in: activeMembers.map((member) => member.id) } },
    _max: { pubgCreatedAt: true },
  })
  const lastMatchByClanId = new Map<number, Date>()
  for (const aggregate of matchAggregates) {
    const clanId = memberClanById.get(aggregate.memberId)
    const lastMatch = aggregate._max.pubgCreatedAt
    if (!clanId || !lastMatch) continue
    const current = lastMatchByClanId.get(clanId)
    if (!current || lastMatch > current) {
      lastMatchByClanId.set(clanId, lastMatch)
    }
  }

  // Removed encounterAggregates since the user requested to remove the 'Rencontres' column for tracked clans.

  // Removed missingMembersAggregates calculation, we now read missingMembersCount directly from Clan model

  let trackedClanRows: TrackedClanRow[] = clans.map((clan) => ({
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    membersCount: clan._count.members,
    lastMatchAt: lastMatchByClanId.get(clan.id)?.toISOString() ?? null,
    missingMembersCount: clan.missingMembersCount ?? 0,
  }))

  if (clansQuery) {
    trackedClanRows = trackedClanRows.filter(
      (row) => row.name.toLowerCase().includes(clansQuery) || row.tag.toLowerCase().includes(clansQuery)
    )
  }

  const clanSortValue = (row: TrackedClanRow): number | string => {
    switch (clansSortBy) {
      case 'name':
        return row.name.toLowerCase()
      case 'members':
        return row.membersCount
      case 'lastMatch':
        return row.lastMatchAt ? new Date(row.lastMatchAt).getTime() : 0
      case 'encounters':
      default:
        return row.name.toLowerCase()
    }
  }
  trackedClanRows.sort((a, b) => {
    const av = clanSortValue(a)
    const bv = clanSortValue(b)
    const comparison = av < bv ? -1 : av > bv ? 1 : 0
    return clansSortDir === 'asc' ? comparison : -comparison
  })

  const clansTotal = trackedClanRows.length
  const clansTotalPages = Math.max(1, Math.ceil(clansTotal / PAGE_SIZE))
  const clansPageClamped = Math.min(clansPage, clansTotalPages)
  const trackedClanRowsPage = trackedClanRows.slice(
    (clansPageClamped - 1) * PAGE_SIZE,
    clansPageClamped * PAGE_SIZE
  )

  // --- Tableau 2 : clans adversaires ---------------------------------------
  const opponentSearchFilter = opponentsQuery
    ? Prisma.sql`AND (oc.tag LIKE ${`%${opponentsQuery}%`} OR oc.name LIKE ${`%${opponentsQuery}%`})`
    : Prisma.empty

  const opponentSortColumn =
    opponentsSortBy === 'opponent'
      ? Prisma.sql`COALESCE(oc.tag, oc.name)`
      : opponentsSortBy === 'asTeammate'
        ? Prisma.sql`stats.asTeammateCount`
        : opponentsSortBy === 'lastSeen'
          ? Prisma.sql`stats.lastSeenAt`
          : opponentsSortBy === 'memberCount'
            ? Prisma.sql`stats.memberCount`
            : opponentsSortBy === 'trackedClansCount'
              ? Prisma.sql`stats.trackedClansCount`
              : Prisma.sql`stats.asOpponentCount`
  const opponentSortDirSql = opponentsSortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`

  // Use a fallback period if no period is selected, we assume 'all' by default in the cache
  const periodVal = url.searchParams.get('period') || 'all'

  const opponentClanRowsRaw = await prisma.$queryRaw<
    Array<{
      id: string
      tag: string | null
      name: string | null
      isFavorite: number
      asOpponentCount: bigint
      asTeammateCount: bigint
      lastSeenAt: Date
      memberCount: bigint
      trackedClansCount: bigint
    }>
  >(
    Prisma.sql`
      SELECT
        oc.id as id,
        oc.tag as tag,
        oc.name as name,
        oc.isFavorite as isFavorite,
        COALESCE(stats.asOpponentCount, 0) as asOpponentCount,
        COALESCE(stats.asTeammateCount, 0) as asTeammateCount,
        stats.lastSeenAt as lastSeenAt,
        COALESCE(stats.memberCount, 0) as memberCount,
        COALESCE(stats.trackedClansCount, 0) as trackedClansCount
      FROM OpponentClan oc
      LEFT JOIN OpponentClanStatsCache stats ON stats.opponentClanId = oc.id AND stats.period = ${periodVal}
      WHERE 1=1 
        ${opponentSearchFilter}
        AND NOT EXISTS (
          SELECT 1 FROM Clan c 
          WHERE c.pubgClanId = oc.pubgClanId 
            AND c.platformShard = oc.platformShard
            AND c.isActive = 1
        )
      ORDER BY oc.isFavorite DESC, ${opponentSortColumn} ${opponentSortDirSql}
    `
  )

  const opponentClanRows: OpponentClanRow[] = opponentClanRowsRaw.map((row) => ({
    id: row.id,
    tag: row.tag,
    name: row.name,
    isFavorite: Boolean(row.isFavorite),
    asOpponentCount: Number(row.asOpponentCount),
    asTeammateCount: Number(row.asTeammateCount),
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null, // It might be null if no cache is present
    memberCount: Number(row.memberCount),
    trackedClansCount: Number(row.trackedClansCount),
  }))

  const opponentsTotal = opponentClanRows.length
  const opponentsTotalPages = Math.max(1, Math.ceil(opponentsTotal / PAGE_SIZE))
  const opponentsPageClamped = Math.min(opponentsPage, opponentsTotalPages)
  const opponentClanRowsPage = opponentClanRows.slice(
    (opponentsPageClamped - 1) * PAGE_SIZE,
    opponentsPageClamped * PAGE_SIZE
  )

  const systemStats = await prisma.systemStatsCache.findUnique({
    where: { period: periodVal }
  })

  return Response.json({
    counters: {
      trackedClanCount: systemStats?.trackedClanCount ?? clans.length,
      opponentClanCount: systemStats?.opponentClanCount ?? opponentClanRows.length,
      totalEncounters: systemStats?.totalEncounters ?? 0,
      noClanPlayerCount: systemStats?.noClanPlayerCount ?? 0,
    },
    trackedClans: {
      rows: trackedClanRowsPage,
      pagination: { page: clansPageClamped, pageSize: PAGE_SIZE, total: clansTotal, totalPages: clansTotalPages },
    },
    opponentClans: {
      rows: opponentClanRowsPage,
      pagination: {
        page: opponentsPageClamped,
        pageSize: PAGE_SIZE,
        total: opponentsTotal,
        totalPages: opponentsTotalPages,
      },
    },
  })
}
