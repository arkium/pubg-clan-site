import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { sortDropPressureRanking } from '@/lib/drop-pressure-ranking'
import type {
  DropPressureDashboardStats,
  DropPressurePeriod,
  DropPressureRankingEntry,
} from '@/types/drop-pressure'

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
}): Promise<DropPressureDashboardStats> {
  const matchDate = getPeriodBounds(input.period)
  const where: Prisma.DropPressureStatWhereInput = {
    ...(input.memberId ? { memberId: input.memberId } : {}),
    ...(input.clanId ? { member: { clanId: input.clanId } } : {}),
    ...(matchDate ? { matchDate } : {}),
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
}): Promise<DropPressureRankingEntry[]> {
  const matchDate = getPeriodBounds(input.period)
  const where: Prisma.DropPressureStatWhereInput = {
    member: { clanId: input.clanId, isActive: true },
    ...(matchDate ? { matchDate } : {}),
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