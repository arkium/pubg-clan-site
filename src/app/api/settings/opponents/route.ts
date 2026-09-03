import { Prisma } from '@prisma/client'

import { requireSuperUser } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 10

const CLAN_SORT_KEYS = ['name', 'members', 'encounters', 'lastMatch'] as const
type ClanSortKey = (typeof CLAN_SORT_KEYS)[number]

const OPPONENT_SORT_KEYS = [
  'opponent',
  'asOpponent',
  'asTeammate',
  'totalEncounters',
  'lastSeen',
  'memberCount',
  'trackedClansCount',
  'favorite',
] as const
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
  return OPPONENT_SORT_KEYS.includes(value as OpponentSortKey) ? (value as OpponentSortKey) : 'totalEncounters'
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
  totalEncountersCount: number
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
  const periodVal = url.searchParams.get('period') || 'all'

  const clansPage = parsePage(url.searchParams.get('clansPage'))
  const clansSortBy = parseClanSortKey(url.searchParams.get('clansSortBy'))
  const clansSortDir = parseSortDir(url.searchParams.get('clansSortDir'), 'desc')
  const clansQuery = (url.searchParams.get('clansQ') ?? '').trim().toLowerCase()

  const opponentsPage = parsePage(url.searchParams.get('opponentsPage'))
  const opponentsSortBy = parseOpponentSortKey(url.searchParams.get('opponentsSortBy'))
  const opponentsSortDir = parseSortDir(url.searchParams.get('opponentsSortDir'), 'desc')
  const opponentsQuery = (url.searchParams.get('opponentsQ') ?? '').trim()
  const opponentsFilter = url.searchParams.get('opponentsFilter') || 'all' // 'all' | 'favorites' | 'teammates'

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

  const opponentTypeFilter =
    opponentsFilter === 'favorites'
      ? Prisma.sql`AND oc.isFavorite = 1`
      : opponentsFilter === 'teammates'
      ? Prisma.sql`AND COALESCE(stats.asTeammateCount, 0) > 0`
      : Prisma.empty

  const opponentSortColumn =
    opponentsSortBy === 'opponent'
      ? Prisma.sql`COALESCE(oc.tag, oc.name)`
      : opponentsSortBy === 'asTeammate'
      ? Prisma.sql`COALESCE(stats.asTeammateCount, 0)`
      : opponentsSortBy === 'asOpponent'
      ? Prisma.sql`COALESCE(stats.asOpponentCount, 0)`
      : opponentsSortBy === 'totalEncounters'
      ? Prisma.sql`(COALESCE(stats.asOpponentCount, 0) + COALESCE(stats.asTeammateCount, 0))`
      : opponentsSortBy === 'lastSeen'
      ? Prisma.sql`COALESCE(stats.lastSeenAt, '1970-01-01')`
      : opponentsSortBy === 'memberCount'
      ? Prisma.sql`COALESCE(stats.memberCount, 0)`
      : opponentsSortBy === 'trackedClansCount'
      ? Prisma.sql`COALESCE(stats.trackedClansCount, 0)`
      : Prisma.sql`oc.isFavorite`

  const opponentSortDirSql = opponentsSortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`

  // Si le tri demandé est spécifiquement par favoris, on trie par isFavorite.
  // Sinon, le tri principal EST la colonne cliquée par l'utilisateur, avec isFavorite et name en second critère !
  const orderByClause =
    opponentsSortBy === 'favorite'
      ? Prisma.sql`ORDER BY oc.isFavorite ${opponentSortDirSql}, (COALESCE(stats.asOpponentCount, 0) + COALESCE(stats.asTeammateCount, 0)) DESC`
      : Prisma.sql`ORDER BY ${opponentSortColumn} ${opponentSortDirSql}, oc.isFavorite DESC, oc.name ASC`

  const opponentClanRowsRaw = await prisma.$queryRaw<
    Array<{
      id: string
      tag: string | null
      name: string | null
      isFavorite: number
      asOpponentCount: bigint
      asTeammateCount: bigint
      lastSeenAt: Date | null
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
        ${opponentTypeFilter}
        AND NOT EXISTS (
          SELECT 1 FROM Clan c 
          WHERE c.pubgClanId = oc.pubgClanId 
            AND c.platformShard = oc.platformShard
            AND c.isActive = 1
        )
      ${orderByClause}
    `
  )

  const opponentClanRows: OpponentClanRow[] = opponentClanRowsRaw.map((row) => {
    const opp = Number(row.asOpponentCount)
    const team = Number(row.asTeammateCount)
    return {
      id: row.id,
      tag: row.tag,
      name: row.name,
      isFavorite: Boolean(row.isFavorite),
      asOpponentCount: opp,
      asTeammateCount: team,
      totalEncountersCount: opp + team,
      lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      memberCount: Number(row.memberCount),
      trackedClansCount: Number(row.trackedClansCount),
    }
  })

  const opponentsTotal = opponentClanRows.length
  const opponentsTotalPages = Math.max(1, Math.ceil(opponentsTotal / PAGE_SIZE))
  const opponentsPageClamped = Math.min(opponentsPage, opponentsTotalPages)
  const opponentClanRowsPage = opponentClanRows.slice(
    (opponentsPageClamped - 1) * PAGE_SIZE,
    opponentsPageClamped * PAGE_SIZE
  )

  // Fetch system stats for the period
  const systemStats = await prisma.systemStatsCache.findUnique({
    where: { period: periodVal },
  })

  // Live total count for clans to ensure cards reflect active database reality
  const liveTrackedClanCount = clans.length
  const liveOpponentClanCount = await prisma.opponentClan.count().catch(() => opponentClanRows.length)

  return Response.json({
    counters: {
      trackedClanCount: liveTrackedClanCount,
      opponentClanCount:
        systemStats?.opponentClanCount && systemStats.opponentClanCount > 0
          ? systemStats.opponentClanCount
          : liveOpponentClanCount,
      totalEncounters: systemStats?.totalEncounters ?? 0,
      noClanPlayerCount: systemStats?.noClanPlayerCount ?? 0,
      lastComputedAt: systemStats?.computedAt?.toISOString() ?? null,
    },
    trackedClans: {
      rows: trackedClanRowsPage,
      pagination: {
        page: clansPageClamped,
        pageSize: PAGE_SIZE,
        total: clansTotal,
        totalPages: clansTotalPages,
      },
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
