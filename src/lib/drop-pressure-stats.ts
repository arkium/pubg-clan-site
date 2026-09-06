import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { sortDropPressureRanking } from '@/lib/drop-pressure-ranking'
import {
  buildDropPressureWeeklyTimeline,
  getDropPressureTimelineStart,
} from '@/lib/drop-pressure-timeline'
import type {
  DropPressureDashboardStats,
  DropPressurePeriod,
  DropPressureRankingEntry,
  DropPressureTimelinePoint,
} from '@/types/drop-pressure'
import type { ClanMatchTypeFilter, ClanTeamModeFilter } from '@/types/squad-matches'
import { teamModeFromMemberCount } from '@/lib/team-mode'

function buildMatchTypeWhere(matchType: ClanMatchTypeFilter): Prisma.DropPressureStatWhereInput {
  if (matchType === 'official') return { squadMatch: { matchType: 'official' } }
  if (matchType === 'casual') return { squadMatch: { matchType: { in: ['casual', 'airoyale'] } } }
  if (matchType === 'custom') return { squadMatch: { matchType: 'custom' } }
  return {}
}

// DropPressureStat n'a pas de colonne de mode d'équipe, et SquadMatch ne le
// stocke pas non plus — seulement dérivable du nombre de SquadMember scopés
// au clan (voir teamModeFromMemberCount). On résout donc dynamiquement les
// squadMatchId correspondant au mode demandé plutôt que d'ajouter une colonne.
export async function getSquadMatchIdsForTeamMode(
  clanId: number,
  mode: ClanTeamModeFilter
): Promise<string[] | null> {
  if (mode === 'all') return null

  const matches = await prisma.squadMatch.findMany({
    where: { members: { some: { member: { clanId, isActive: true, joinStatus: 'active' } } } },
    select: {
      id: true,
      members: { where: { member: { clanId, isActive: true, joinStatus: 'active' } }, select: { id: true } },
    },
  })

  return matches.filter((m) => teamModeFromMemberCount(m.members.length) === mode).map((m) => m.id)
}

async function buildTeamModeWhere(
  clanId: number | undefined,
  mode: ClanTeamModeFilter | undefined
): Promise<Prisma.DropPressureStatWhereInput> {
  if (!clanId || !mode || mode === 'all') return {}
  const squadMatchIds = await getSquadMatchIdsForTeamMode(clanId, mode)
  if (!squadMatchIds) return {}
  return { squadMatchId: { in: squadMatchIds } }
}

function getPeriodBounds(period: DropPressurePeriod, now = new Date()) {
  if (period === 'all') return null
  if (period === 'month') {
    return {
      gte: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    }
  }

  const start = new Date(now)
  const day = start.getDay()
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1))
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { gte: start, lte: end }
}

export async function getDropPressureDashboardStats(input: {
  period: DropPressurePeriod
  memberId?: number
  clanId?: number
  matchType?: ClanMatchTypeFilter
  mode?: ClanTeamModeFilter
}): Promise<DropPressureDashboardStats> {
  const matchDate = getPeriodBounds(input.period)
  const where: Prisma.DropPressureStatWhereInput = {
    ...(input.memberId ? { memberId: input.memberId } : {}),
    ...(input.clanId ? { member: { clanId: input.clanId } } : {}),
    ...(matchDate ? { matchDate } : {}),
    ...buildMatchTypeWhere(input.matchType ?? 'all'),
    ...(await buildTeamModeWhere(input.clanId, input.mode)),
  }

  const [aggregate, opponentAggregate, hotDropCount, matchRows, levelRows] = await Promise.all([
    prisma.dropPressureStat.aggregate({
      where,
      _count: { _all: true },
      _avg: { nearbyPlayerCount250m: true },
      _max: { nearbyPlayerCount250m: true },
    }),
    prisma.dropPressureStat.aggregate({
      where: { ...where, nearbyOpponentCount250m: { not: null } },
      _avg: { nearbyOpponentCount250m: true },
    }),
    prisma.dropPressureStat.count({
      where: { ...where, pressureLevel: { in: ['hot', 'very_hot'] } },
    }),
    prisma.dropPressureStat.findMany({
      where,
      select: { squadMatchId: true },
      distinct: ['squadMatchId'],
    }),
    prisma.dropPressureStat.groupBy({
      by: ['pressureLevel'],
      where,
      _count: { _all: true },
    }),
  ])

  const levelCounts = { calm: 0, contested: 0, hot: 0, veryHot: 0 }
  for (const row of levelRows) {
    if (row.pressureLevel === 'calm') levelCounts.calm = row._count._all
    if (row.pressureLevel === 'contested') levelCounts.contested = row._count._all
    if (row.pressureLevel === 'hot') levelCounts.hot = row._count._all
    if (row.pressureLevel === 'very_hot') levelCounts.veryHot = row._count._all
  }

  const dropCount = aggregate._count._all
  return {
    dropCount,
    matchCount: matchRows.length,
    averageNearbyPlayers250m: aggregate._avg.nearbyPlayerCount250m ?? 0,
    averageNearbyOpponents250m: opponentAggregate._avg.nearbyOpponentCount250m,
    maximumNearbyPlayers250m: aggregate._max.nearbyPlayerCount250m ?? 0,
    hotDropCount,
    hotDropShare: dropCount > 0 ? (hotDropCount / dropCount) * 100 : 0,
    levelCounts,
  }
}

export async function getDropPressureMemberRanking(input: {
  clanId: number
  period: DropPressurePeriod
  matchType?: ClanMatchTypeFilter
  mode?: ClanTeamModeFilter
}): Promise<DropPressureRankingEntry[]> {
  const matchDate = getPeriodBounds(input.period)
  const where: Prisma.DropPressureStatWhereInput = {
    member: { clanId: input.clanId, isActive: true },
    ...(matchDate ? { matchDate } : {}),
    ...buildMatchTypeWhere(input.matchType ?? 'all'),
    ...(await buildTeamModeWhere(input.clanId, input.mode)),
  }

  const [aggregates, hotRows] = await Promise.all([
    prisma.dropPressureStat.groupBy({
      by: ['memberId'],
      where,
      _count: { _all: true },
      _avg: {
        nearbyPlayerCount250m: true,
        nearbyOpponentCount250m: true,
      },
      _max: { nearbyPlayerCount250m: true },
    }),
    prisma.dropPressureStat.groupBy({
      by: ['memberId'],
      where: { ...where, pressureLevel: { in: ['hot', 'very_hot'] } },
      _count: { _all: true },
    }),
  ])

  const members = await prisma.clanMember.findMany({
    where: { id: { in: aggregates.map((row) => row.memberId) } },
    select: {
      id: true,
      displayName: true,
      identities: {
        select: { user: { select: { avatarUrl: true } } },
        take: 1,
      },
    },
  })
  const memberById = new Map(members.map((member) => [member.id, member]))
  const hotCountByMemberId = new Map(
    hotRows.map((row) => [row.memberId, row._count._all])
  )

  return sortDropPressureRanking(
    aggregates.flatMap((row) => {
      const member = memberById.get(row.memberId)
      if (!member) return []
      const dropCount = row._count._all
      const hotDropCount = hotCountByMemberId.get(row.memberId) ?? 0
      return [{
        memberId: row.memberId,
        displayName: member.displayName,
        avatarUrl: member.identities[0]?.user.avatarUrl ?? null,
        dropCount,
        averageNearbyPlayers250m: row._avg.nearbyPlayerCount250m ?? 0,
        averageNearbyOpponents250m: row._avg.nearbyOpponentCount250m,
        maximumNearbyPlayers250m: row._max.nearbyPlayerCount250m ?? 0,
        hotDropShare: dropCount > 0 ? (hotDropCount / dropCount) * 100 : 0,
      }]
    }),
    'averageNearbyOpponents250m'
  )
}

export async function getDropPressureTimeline(input: {
  memberId?: number
  clanId?: number
  weekCount?: number
  matchType?: ClanMatchTypeFilter
  mode?: ClanTeamModeFilter
}): Promise<DropPressureTimelinePoint[]> {
  const weekCount = Math.max(1, Math.min(input.weekCount ?? 8, 52))
  const now = new Date()
  const rows = await prisma.dropPressureStat.findMany({
    where: {
      ...(input.memberId ? { memberId: input.memberId } : {}),
      ...(input.clanId ? { member: { clanId: input.clanId, isActive: true } } : {}),
      matchDate: { gte: getDropPressureTimelineStart(now, weekCount) },
      ...buildMatchTypeWhere(input.matchType ?? 'all'),
      ...(await buildTeamModeWhere(input.clanId, input.mode)),
    },
    select: {
      matchDate: true,
      nearbyPlayerCount250m: true,
      nearbyOpponentCount250m: true,
      pressureLevel: true,
    },
  })

  return buildDropPressureWeeklyTimeline(rows, now, weekCount)
}