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

function getPast4WeekPeriods(): string[] {
  const periods: string[] = []
  const now = new Date()

  for (let i = 0; i < 4; i += 1) {
    const d = new Date(now)
    d.setDate(d.getDate() - i * 7)
    const week = getISOWeek(d)
    const year = d.getFullYear()
    periods.push(`week-${year}-${String(week).padStart(2, '0')}`)
  }

  return periods
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
        member: { select: { id: true, displayName: true } },
      },
    })

    const leaderboard: PlayerStatsEntry[] = statsRows.map((row) => ({
      id: row.id,
      memberId: row.member.id,
      displayName: row.member.displayName,
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
      badgeType: row.badgeType,
    }))

    const sortedLeaderboard = sortLeaderboard(leaderboard, sortBy)
    const highlights = buildHighlights(leaderboard)

    // Progression: last 4 weeks for top-5 players by kills
    const top5Ids = sortLeaderboard(leaderboard, 'kills')
      .slice(0, 5)
      .map((e) => e.memberId)

    const past4Periods = getPast4WeekPeriods()

    const progressionRows = await prisma.playerStats.findMany({
      where: {
        period: { in: past4Periods },
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
