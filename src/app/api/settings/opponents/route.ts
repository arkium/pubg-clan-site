import { Prisma } from '@prisma/client'

import { requireSuperUser } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 10

const CLAN_SORT_KEYS = ['name', 'members', 'encounters', 'lastMatch'] as const
type ClanSortKey = (typeof CLAN_SORT_KEYS)[number]

const OPPONENT_SORT_KEYS = ['opponent', 'asOpponent', 'asTeammate', 'lastSeen'] as const
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
  return CLAN_SORT_KEYS.includes(value as ClanSortKey) ? (value as ClanSortKey) : 'encounters'
}

function parseOpponentSortKey(value: string | null): OpponentSortKey {
  return OPPONENT_SORT_KEYS.includes(value as OpponentSortKey) ? (value as OpponentSortKey) : 'asOpponent'
}

type TrackedClanRow = {
  id: number
  name: string
  tag: string
  membersCount: number
  encounterCount: number
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
  lastSeenAt: string
  trackedClanTags: string[]
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

  const encounterAggregates = await prisma.$queryRaw<Array<{ clanId: number; total: bigint }>>(
    Prisma.sql`
      SELECT ce.clanId as clanId, SUM(ce.encounterCount) as total
      FROM ClanEncounter ce
      WHERE 1=1 ${periodFilter}
      GROUP BY ce.clanId
    `
  )
  const encountersByClanId = new Map(encounterAggregates.map((row) => [row.clanId, Number(row.total)]))

  const missingMembersAggregates = await prisma.$queryRaw<Array<{ clanId: number; missingCount: bigint }>>(
    Prisma.sql`
      SELECT c.id as clanId, COUNT(DISTINCT p.id) as missingCount
      FROM Clan c
      INNER JOIN OpponentClan oc ON oc.pubgClanId = c.pubgClanId AND oc.platformShard = c.platformShard
      INNER JOIN Player p ON p.opponentClanId = oc.id
      WHERE c.pubgClanId IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ClanMember cm WHERE cm.clanId = c.id AND cm.pubgAccountId = p.pubgAccountId
        )
      GROUP BY c.id
    `
  )
  const missingMembersByClanId = new Map(
    missingMembersAggregates.map((row) => [row.clanId, Number(row.missingCount)])
  )

  let trackedClanRows: TrackedClanRow[] = clans.map((clan) => ({
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    membersCount: clan._count.members,
    encounterCount: encountersByClanId.get(clan.id) ?? 0,
    lastMatchAt: lastMatchByClanId.get(clan.id)?.toISOString() ?? null,
    missingMembersCount: missingMembersByClanId.get(clan.id) ?? 0,
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
        return row.encounterCount
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
        ? Prisma.sql`asTeammateCount`
        : opponentsSortBy === 'lastSeen'
          ? Prisma.sql`lastSeenAt`
          : Prisma.sql`asOpponentCount`
  const opponentSortDirSql = opponentsSortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`

  const opponentClanRowsRaw = await prisma.$queryRaw<
    Array<{
      id: string
      tag: string | null
      name: string | null
      isFavorite: number
      asOpponentCount: bigint
      asTeammateCount: bigint
      lastSeenAt: Date
    }>
  >(
    Prisma.sql`
      SELECT
        oc.id as id,
        oc.tag as tag,
        oc.name as name,
        oc.isFavorite as isFavorite,
        SUM(ce.encounterCount - ce.teammateEncounterCount) as asOpponentCount,
        SUM(ce.teammateEncounterCount) as asTeammateCount,
        MAX(ce.lastSeenAt) as lastSeenAt
      FROM ClanEncounter ce
      INNER JOIN Player p ON p.id = ce.playerId
      INNER JOIN OpponentClan oc ON oc.id = p.opponentClanId
      WHERE 1=1 ${periodFilter} ${opponentSearchFilter}
      GROUP BY oc.id
      ORDER BY oc.isFavorite DESC, ${opponentSortColumn} ${opponentSortDirSql}
    `
  )

  const opponentClanIds = opponentClanRowsRaw.map((row) => row.id)
  const trackedClanTagsByOpponentId = new Map<string, string[]>()
  if (opponentClanIds.length > 0) {
    const trackedClanLinks = await prisma.$queryRaw<Array<{ opponentClanId: string; tag: string }>>(
      Prisma.sql`
        SELECT DISTINCT p.opponentClanId as opponentClanId, c.tag as tag
        FROM ClanEncounter ce
        INNER JOIN Player p ON p.id = ce.playerId
        INNER JOIN Clan c ON c.id = ce.clanId
        WHERE p.opponentClanId IN (${Prisma.join(opponentClanIds)})
      `
    )
    for (const link of trackedClanLinks) {
      const list = trackedClanTagsByOpponentId.get(link.opponentClanId) ?? []
      list.push(link.tag)
      trackedClanTagsByOpponentId.set(link.opponentClanId, list)
    }
  }

  const opponentClanRows: OpponentClanRow[] = opponentClanRowsRaw.map((row) => ({
    id: row.id,
    tag: row.tag,
    name: row.name,
    isFavorite: Boolean(row.isFavorite),
    asOpponentCount: Number(row.asOpponentCount),
    asTeammateCount: Number(row.asTeammateCount),
    lastSeenAt: row.lastSeenAt.toISOString(),
    trackedClanTags: trackedClanTagsByOpponentId.get(row.id) ?? [],
  }))

  const opponentsTotal = opponentClanRows.length
  const opponentsTotalPages = Math.max(1, Math.ceil(opponentsTotal / PAGE_SIZE))
  const opponentsPageClamped = Math.min(opponentsPage, opponentsTotalPages)
  const opponentClanRowsPage = opponentClanRows.slice(
    (opponentsPageClamped - 1) * PAGE_SIZE,
    opponentsPageClamped * PAGE_SIZE
  )

  const [noClanAggregate] = await prisma.$queryRaw<Array<{ playerCount: bigint }>>(
    Prisma.sql`
      SELECT COUNT(DISTINCT p.id) as playerCount
      FROM ClanEncounter ce
      INNER JOIN Player p ON p.id = ce.playerId
      WHERE p.opponentClanId IS NULL ${periodFilter}
    `
  )

  const totalEncountersAggregate = await prisma.clanEncounter.aggregate({
    where: periodStart ? { lastSeenAt: { gte: periodStart } } : undefined,
    _sum: { encounterCount: true },
  })

  return Response.json({
    counters: {
      trackedClanCount: clans.length,
      opponentClanCount: opponentClanRows.length,
      totalEncounters: totalEncountersAggregate._sum.encounterCount ?? 0,
      noClanPlayerCount: Number(noClanAggregate?.playerCount ?? 0),
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
