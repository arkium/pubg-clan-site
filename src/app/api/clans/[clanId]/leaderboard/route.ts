import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import type {
  LeaderboardHighlights,
  LeaderboardPeriod,
  LeaderboardResponse,
  LeaderboardSortBy,
  PlayerStatsEntry,
  WeeklyProgression,
} from '@/types/leaderboard'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): LeaderboardPeriod {
  if (value === 'month') return 'month'
  if (value === 'all') return 'all'
  return 'week'
}

function parseSortBy(value: string | null): LeaderboardSortBy {
  if (value === 'damage') return 'damage'
  if (value === 'winRate') return 'winRate'
  if (value === 'matches') return 'matches'
  return 'kills'
}

function getPeriodFilter(period: LeaderboardPeriod): string {
  if (period === 'all') return 'all-time'

  const now = new Date()

  if (period === 'week') {
    const week = getISOWeek(now)
    const year = now.getFullYear()
    return `week-${year}-${String(week).padStart(2, '0')}`
  }

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `month-${year}-${month}`
}

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

function sortLeaderboard(entries: PlayerStatsEntry[], sortBy: LeaderboardSortBy): PlayerStatsEntry[] {
  return [...entries].sort((a, b) => {
    switch (sortBy) {
      case 'damage':
        return b.totalDamage - a.totalDamage
      case 'winRate':
        return b.winRate - a.winRate
      case 'matches':
        return b.matchesPlayed - a.matchesPlayed
      default:
        return b.totalKills - a.totalKills
    }
  })
}

function buildHighlights(entries: PlayerStatsEntry[]): LeaderboardHighlights {
  const withMatches = entries.filter((e) => e.matchesPlayed > 0)
  const withMinMatches = entries.filter((e) => e.matchesPlayed >= 3)

  const topKiller = withMatches.length > 0
    ? withMatches.reduce((best, e) => (e.totalKills > best.totalKills ? e : best))
    : null

  const topDamage = withMatches.length > 0
    ? withMatches.reduce((best, e) => (e.totalDamage > best.totalDamage ? e : best))
    : null

  const bestWinRate = withMinMatches.length > 0
    ? withMinMatches.reduce((best, e) => (e.winRate > best.winRate ? e : best))
    : null

  const maxKills = Math.max(...withMatches.map((s) => s.totalKills), 1)
  const maxDamage = Math.max(...withMatches.map((s) => s.totalDamage), 1)

  const mvp = withMatches.length > 0
    ? withMatches.reduce((best, e) => {
        const scoreE = e.totalKills / maxKills + e.totalDamage / maxDamage + e.winRate
        const scoreBest = best.totalKills / maxKills + best.totalDamage / maxDamage + best.winRate
        return scoreE > scoreBest ? e : best
      })
    : null

  return { topKiller, topDamage, bestWinRate, mvp }
}

function getPastPeriods(period: LeaderboardPeriod): string[] {
  if (period === 'all') {
    return []
  }

  const periods: string[] = []
  const now = new Date()

  if (period === 'week') {
    for (let i = 0; i < 4; i += 1) {
      const d = new Date(now)
      d.setDate(d.getDate() - i * 7)
      const week = getISOWeek(d)
      const year = d.getFullYear()
      periods.push(`week-${year}-${String(week).padStart(2, '0')}`)
    }

    return periods
  }

  for (let i = 0; i < 4; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    periods.push(`month-${year}-${month}`)
  }

  return periods
}

function getDateRangeForPeriod(period: LeaderboardPeriod): { gte?: Date; lte?: Date } {
  if (period === 'all') {
    return {}
  }

  const now = new Date()

  if (period === 'week') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)

    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    return { gte: monday, lte: sunday }
  }

  const startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  return { gte: startDate, lte: endDate }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const period = parsePeriod(request.nextUrl.searchParams.get('period'))
    const sortBy = parseSortBy(request.nextUrl.searchParams.get('sortBy'))
    const periodKey = getPeriodFilter(period)

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: { id: true },
    })

    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    const statsRows = await prisma.playerStats.findMany({
      where: {
        period: periodKey,
        member: { clanId: parsedClanId, isActive: true },
      },
      include: {
        member: {
          select: {
            id: true,
            displayName: true,
            identities: {
              select: {
                user: {
                  select: {
                    avatarUrl: true,
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
    })

    const leaderboard: PlayerStatsEntry[] = statsRows.map((row) => ({
      id: row.id,
      memberId: row.member.id,
      displayName: row.member.displayName,
      avatarUrl: row.member.identities[0]?.user.avatarUrl ?? null,
      period: row.period,
      periodType: row.periodType,
      totalKills: row.totalKills,
      totalDamage: row.totalDamage,
      totalAssists: row.totalAssists,
      totalRevives: row.totalRevives,
      matchesPlayed: row.matchesPlayed,
      matchesWon: row.matchesWon,
      winRate: row.winRate,
      avgKillsPerGame: row.avgKillsPerGame,
      avgDamagePerGame: row.avgDamagePerGame,
      soloKills: 0,
      duoClanKills: 0,
      trioClanKills: 0,
      squadClanKills: 0,
      badgeType: row.badgeType,
    }))

    const memberIds = leaderboard.map((entry) => entry.memberId)
    const dateRange = getDateRangeForPeriod(period)

    const [soloMatches, squadMembers] = await Promise.all([
      prisma.match.findMany({
        where: {
          memberId: { in: memberIds },
          gameMode: {
            startsWith: 'solo',
          },
          ...(dateRange.gte || dateRange.lte
            ? {
                pubgCreatedAt: {
                  ...(dateRange.gte ? { gte: dateRange.gte } : {}),
                  ...(dateRange.lte ? { lte: dateRange.lte } : {}),
                },
              }
            : {}),
        },
        select: {
          memberId: true,
          kills: true,
        },
      }),
      prisma.squadMember.findMany({
        where: {
          memberId: { in: memberIds },
          ...(dateRange.gte || dateRange.lte
            ? {
                squadMatch: {
                  createdAt: {
                    ...(dateRange.gte ? { gte: dateRange.gte } : {}),
                    ...(dateRange.lte ? { lte: dateRange.lte } : {}),
                  },
                },
              }
            : {}),
        },
        select: {
          memberId: true,
          kills: true,
          squadMatch: {
            select: {
              _count: {
                select: {
                  members: true,
                },
              },
            },
          },
        },
      }),
    ])

    const soloKillsByMember = new Map<number, number>()
    for (const row of soloMatches) {
      const current = soloKillsByMember.get(row.memberId) ?? 0
      soloKillsByMember.set(row.memberId, current + row.kills)
    }

    const clanBreakdownByMember = new Map<
      number,
      { duoClanKills: number; trioClanKills: number; squadClanKills: number }
    >()

    for (const row of squadMembers) {
      const current = clanBreakdownByMember.get(row.memberId) ?? {
        duoClanKills: 0,
        trioClanKills: 0,
        squadClanKills: 0,
      }
      const clanMemberCount = row.squadMatch._count.members

      if (clanMemberCount <= 2) {
        current.duoClanKills += row.kills
      } else if (clanMemberCount === 3) {
        current.trioClanKills += row.kills
      } else {
        current.squadClanKills += row.kills
      }

      clanBreakdownByMember.set(row.memberId, current)
    }

    for (const entry of leaderboard) {
      const originalTotalKills = entry.totalKills
      const soloKills = soloKillsByMember.get(entry.memberId) ?? 0
      const breakdown = clanBreakdownByMember.get(entry.memberId)
      const duoClanKills = breakdown?.duoClanKills ?? 0
      const trioClanKills = breakdown?.trioClanKills ?? 0
      const squadClanKills = breakdown?.squadClanKills ?? 0

      entry.soloKills = soloKills
      entry.duoClanKills = duoClanKills
      entry.trioClanKills = trioClanKills
      entry.squadClanKills = squadClanKills

      // Keep the displayed/ranked clan kills consistent with mode breakdown columns.
      entry.totalKills = duoClanKills + trioClanKills + squadClanKills

      if (originalTotalKills !== entry.totalKills) {
        console.warn('[Leaderboard] Kills mismatch detected', {
          clanId: parsedClanId,
          memberId: entry.memberId,
          memberName: entry.displayName,
          period,
          periodKey,
          originalTotalKills,
          computedClanKills: entry.totalKills,
          duoClanKills,
          trioClanKills,
          squadClanKills,
        })
      }
    }

    const lastUpdated = statsRows.reduce<Date | null>((latest, row) => {
      if (!latest || row.updatedAt > latest) {
        return row.updatedAt
      }

      return latest
    }, null)

    const sortedLeaderboard = sortLeaderboard(leaderboard, sortBy)
    const highlights = buildHighlights(leaderboard)

    // Progression: follows selected period (4 weeks or 4 months)
    const top5Ids = sortLeaderboard(leaderboard, 'kills')
      .slice(0, 5)
      .map((e) => e.memberId)

    const pastPeriods = getPastPeriods(period)

    const progressionRows =
      pastPeriods.length === 0 || top5Ids.length === 0
        ? []
        : await prisma.playerStats.findMany({
            where: {
              period: { in: pastPeriods },
              memberId: { in: top5Ids },
            },
            include: {
              member: { select: { id: true, displayName: true } },
            },
            orderBy: { period: 'asc' },
          })

    const progressionByMember = new Map<
      number,
      { displayName: string; weeklyStats: WeeklyProgression['weeklyStats'] }
    >()

    for (const row of progressionRows) {
      const existing = progressionByMember.get(row.memberId) ?? {
        displayName: row.member.displayName,
        weeklyStats: [],
      }

      const parts = row.period.split('-')
      const year = parts[1] ? Number(parts[1]) : 0
      const week = parts[2] ? Number(parts[2]) : 0

      existing.weeklyStats.push({
        period: row.period,
        week,
        year,
        totalKills: row.totalKills,
        totalDamage: row.totalDamage,
        winRate: row.winRate,
        matchesPlayed: row.matchesPlayed,
        matchesWon: row.matchesWon,
      })

      progressionByMember.set(row.memberId, existing)
    }

    const progression: WeeklyProgression[] = Array.from(progressionByMember.entries()).map(
      ([memberId, data]) => ({
        memberId,
        displayName: data.displayName,
        weeklyStats: data.weeklyStats.sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year
          return a.week - b.week
        }),
      })
    )

    const payload: LeaderboardResponse = {
      clanId: parsedClanId,
      period,
      sortBy,
      lastUpdatedAt: lastUpdated ? lastUpdated.toISOString() : null,
      leaderboard: sortedLeaderboard,
      highlights,
      progression,
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
