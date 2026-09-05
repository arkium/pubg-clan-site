import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type ClanQuickStats = {
  matchesCount: number
  killsCount: number
  winsCount: number
  timePlayedSeconds: number
  activeDays: number
  lastMatchAt: string | null
  computedAt: string
}

/**
 * Calcule les statistiques rapides pour un clan à partir des membres actifs.
 */
export async function computeClanQuickStats(clanId: number): Promise<ClanQuickStats> {
  const members = await prisma.clanMember.findMany({
    where: { clanId, isActive: true },
    select: { id: true },
  })

  if (members.length === 0) {
    return {
      matchesCount: 0,
      killsCount: 0,
      winsCount: 0,
      timePlayedSeconds: 0,
      activeDays: 0,
      lastMatchAt: null,
      computedAt: new Date().toISOString(),
    }
  }

  const memberIds = members.map((m) => m.id)

  const [matchAgg, winCount, playerStats] = await Promise.all([
    prisma.match.aggregate({
      where: {
        memberId: { in: memberIds },
        matchType: 'official',
      },
      _count: { id: true },
      _sum: { kills: true },
      _max: { pubgCreatedAt: true },
    }),
    prisma.match.count({
      where: {
        memberId: { in: memberIds },
        matchType: 'official',
        placement: 1,
      },
    }),
    prisma.playerStats.findMany({
      where: {
        period: 'all-time',
        memberId: { in: memberIds },
      },
      select: {
        timePlayedSeconds: true,
        activeDays: true,
      },
    }),
  ])

  let timePlayedSeconds = 0
  let activeDays = 0
  for (const ps of playerStats) {
    timePlayedSeconds += ps.timePlayedSeconds ?? 0
    activeDays = Math.max(activeDays, ps.activeDays ?? 0)
  }

  return {
    matchesCount: matchAgg._count.id ?? 0,
    killsCount: matchAgg._sum.kills ?? 0,
    winsCount: winCount ?? 0,
    timePlayedSeconds,
    activeDays,
    lastMatchAt: matchAgg._max.pubgCreatedAt ? matchAgg._max.pubgCreatedAt.toISOString() : null,
    computedAt: new Date().toISOString(),
  }
}

/**
 * Met à jour le champ clanStats.quickStats pour un clan en base de données.
 */
export async function updateClanQuickStats(clanId: number): Promise<ClanQuickStats> {
  const quickStats = await computeClanQuickStats(clanId)

  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { clanStats: true },
  })

  const existingStats =
    clan?.clanStats && typeof clan.clanStats === 'object'
      ? (clan.clanStats as Record<string, unknown>)
      : {}

  const updatedStats = {
    ...existingStats,
    quickStats,
  }

  await prisma.clan.update({
    where: { id: clanId },
    data: {
      clanStats: updatedStats as unknown as Prisma.InputJsonValue,
    },
  })

  return quickStats
}

/**
 * Recalcule et persiste les statistiques de l'ensemble des clans actifs.
 */
export async function recalculateAllClansQuickStats(): Promise<number> {
  const clans = await prisma.clan.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  })

  for (const clan of clans) {
    try {
      await updateClanQuickStats(clan.id)
    } catch (err) {
      console.error(
        `[clan-stats-cache] Échec de calcul pour le clan "${clan.name}" (${clan.id}) :`,
        err
      )
    }
  }

  return clans.length
}
