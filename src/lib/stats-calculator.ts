import { prisma } from '@/lib/prisma'

export type StatsPeriod = 'week' | 'month' | 'all'

function getISOWeek(date: Date): number {
  const tmp = new Date(date.getTime())
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  )
}

function getPeriodKey(period: StatsPeriod, referenceDate: Date = new Date()): string {
  if (period === 'all') {
    return 'all-time'
  }

  if (period === 'week') {
    const week = getISOWeek(referenceDate)
    const year = referenceDate.getFullYear()
    return `week-${year}-${String(week).padStart(2, '0')}`
  }

  const year = referenceDate.getFullYear()
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0')
  return `month-${year}-${month}`
}

function getPeriodBounds(period: StatsPeriod, referenceDate: Date = new Date()): {
  startDate: Date
  endDate: Date
} {
  const now = referenceDate

  if (period === 'all') {
    return {
      startDate: new Date(0),
      endDate: new Date('9999-12-31'),
    }
  }

  if (period === 'week') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)

    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    return { startDate: monday, endDate: sunday }
  }

  const startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  return { startDate, endDate }
}

export async function calculatePlayerStats(memberId: number, period: StatsPeriod): Promise<void> {
  const { startDate, endDate } = getPeriodBounds(period)
  const periodKey = getPeriodKey(period)

  const squadMembers = await prisma.squadMember.findMany({
    where: {
      memberId,
      squadMatch: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    },
    include: {
      squadMatch: {
        select: { placement: true },
      },
    },
  })

  const matchesPlayed = squadMembers.length
  const totalKills = squadMembers.reduce((sum, m) => sum + m.kills, 0)
  const totalDamage = squadMembers.reduce((sum, m) => sum + m.damage, 0)
  const totalAssists = squadMembers.reduce((sum, m) => sum + m.assists, 0)
  const totalRevives = squadMembers.reduce((sum, m) => sum + m.revives, 0)
  const matchesWon = squadMembers.filter((m) => m.squadMatch.placement === 1).length

  const winRate = matchesPlayed > 0 ? matchesWon / matchesPlayed : 0
  const avgKillsPerGame = matchesPlayed > 0 ? totalKills / matchesPlayed : 0
  const avgDamagePerGame = matchesPlayed > 0 ? totalDamage / matchesPlayed : 0

  await prisma.playerStats.upsert({
    where: { memberId_period: { memberId, period: periodKey } },
    update: {
      totalKills,
      totalDamage,
      totalAssists,
      totalRevives,
      matchesPlayed,
      matchesWon,
      winRate,
      avgKillsPerGame,
      avgDamagePerGame,
      endDate,
    },
    create: {
      memberId,
      period: periodKey,
      periodType: period,
      startDate,
      endDate,
      totalKills,
      totalDamage,
      totalAssists,
      totalRevives,
      matchesPlayed,
      matchesWon,
      winRate,
      avgKillsPerGame,
      avgDamagePerGame,
    },
  })
}

export async function assignBadges(clanId: number, period: StatsPeriod): Promise<void> {
  const periodKey = getPeriodKey(period)

  const allStats = await prisma.playerStats.findMany({
    where: {
      period: periodKey,
      member: { clanId, isActive: true },
    },
    orderBy: { totalKills: 'desc' },
  })

  if (allStats.length === 0) {
    return
  }

  // Reset all badges for this period first
  await prisma.playerStats.updateMany({
    where: {
      period: periodKey,
      member: { clanId, isActive: true },
    },
    data: { badgeType: null },
  })

  const topKiller = allStats.sort((a, b) => b.totalKills - a.totalKills)[0]
  const topDamage = [...allStats].sort((a, b) => b.totalDamage - a.totalDamage)[0]
  const bestWr = [...allStats]
    .filter((s) => s.matchesPlayed >= 3)
    .sort((a, b) => b.winRate - a.winRate)[0]

  // MVP: highest combined score (normalized kills + damage + wr)
  const maxKills = Math.max(...allStats.map((s) => s.totalKills), 1)
  const maxDamage = Math.max(...allStats.map((s) => s.totalDamage), 1)
  const mvp = [...allStats].sort((a, b) => {
    const scoreA = a.totalKills / maxKills + a.totalDamage / maxDamage + a.winRate
    const scoreB = b.totalKills / maxKills + b.totalDamage / maxDamage + b.winRate
    return scoreB - scoreA
  })[0]

  const updates: Array<{ id: string; badgeType: string }> = []

  if (topKiller) {
    updates.push({ id: topKiller.id, badgeType: 'top_killer' })
  }

  if (topDamage && topDamage.id !== topKiller?.id) {
    updates.push({ id: topDamage.id, badgeType: 'top_damage' })
  }

  if (bestWr && bestWr.id !== topKiller?.id && bestWr.id !== topDamage?.id) {
    updates.push({ id: bestWr.id, badgeType: 'best_wr' })
  }

  if (
    mvp &&
    mvp.id !== topKiller?.id &&
    mvp.id !== topDamage?.id &&
    mvp.id !== bestWr?.id
  ) {
    updates.push({ id: mvp.id, badgeType: 'mvp' })
  }

  await Promise.all(
    updates.map(({ id, badgeType }) =>
      prisma.playerStats.update({ where: { id }, data: { badgeType } })
    )
  )
}

export async function recalculateStatsForClan(clanId: number): Promise<void> {
  const members = await prisma.clanMember.findMany({
    where: { clanId, isActive: true },
    select: { id: true },
  })

  for (const period of ['week', 'month', 'all'] as const) {
    for (const member of members) {
      await calculatePlayerStats(member.id, period)
    }

    await assignBadges(clanId, period)
  }

  // Delete stats older than 12 months
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)

  await prisma.playerStats.deleteMany({
    where: {
      member: { clanId },
      endDate: { lt: twelveMonthsAgo },
      periodType: { not: 'all' },
    },
  })
}
