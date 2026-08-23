import { NextRequest, NextResponse } from 'next/server'

import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import type {
  LeaderboardHighlights,
  LeaderboardKillsView,
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
  if (value === 'kpm') return 'kpm'
  if (value === 'timePlayed') return 'timePlayed'
  if (value === 'activeDays') return 'activeDays'
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
      case 'kpm':
        return b.avgKillsPerGame - a.avgKillsPerGame
      case 'winRate':
        return b.winRate - a.winRate
      case 'matches':
        return b.matchesPlayed - a.matchesPlayed
      case 'timePlayed':
        return b.timePlayedSeconds - a.timePlayedSeconds
      case 'activeDays':
        return b.activeDays - a.activeDays
      default:
        return b.totalKills - a.totalKills
    }
  })
}

type MatchActivityRow = {
  memberId: number
  pubgMatchId: string
  kills: number
  damageDealt: number
  assists: number
  revives: number
  placement: number
}

type SquadMemberRow = {
  memberId: number
  kills: number
  damage: number
  assists: number
  revives: number
  placement: number
  squadMatch: {
    pubgMatchId: string
    _count: {
      members: number
    }
  }
}

type MemberProfile = {
  id: number
  displayName: string
  avatarUrl: string | null
}

type PeriodRange = {
  gte?: Date
  lte?: Date
}

function parseKillsView(value: string | null): LeaderboardKillsView {
  return value === 'withSolo' ? 'withSolo' : 'clan'
}

function getMonthRange(year: number, month: number): { gte: Date; lte: Date } {
  const gte = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const lte = new Date(year, month, 0, 23, 59, 59, 999)
  return { gte, lte }
}

function getISOWeekStart(year: number, week: number): Date {
  const fourthJanuary = new Date(year, 0, 4)
  const day = fourthJanuary.getDay() || 7
  const mondayOfWeek1 = new Date(fourthJanuary)
  mondayOfWeek1.setDate(fourthJanuary.getDate() - day + 1)
  mondayOfWeek1.setHours(0, 0, 0, 0)

  const start = new Date(mondayOfWeek1)
  start.setDate(mondayOfWeek1.getDate() + (week - 1) * 7)
  return start
}

function getDateRangeForPeriodKey(periodKey: string): PeriodRange | null {
  if (periodKey === 'all-time') {
    return null
  }

  const [kind, yearPart, valuePart] = periodKey.split('-')
  const year = Number(yearPart)
  const value = Number(valuePart)

  if (!Number.isInteger(year) || !Number.isInteger(value)) {
    return null
  }

  if (kind === 'week') {
    const gte = getISOWeekStart(year, value)
    const lte = new Date(gte)
    lte.setDate(gte.getDate() + 6)
    lte.setHours(23, 59, 59, 999)
    return { gte, lte }
  }

  if (kind === 'month') {
    return getMonthRange(year, value)
  }

  return null
}

function getPeriodLabelParts(periodKey: string): { year: number; value: number } | null {
  if (periodKey === 'all-time') {
    return null
  }

  const [kind, yearPart, valuePart] = periodKey.split('-')
  const year = Number(yearPart)
  const value = Number(valuePart)

  if (!Number.isInteger(year) || !Number.isInteger(value) || (kind !== 'week' && kind !== 'month')) {
    return null
  }

  return { year, value }
}

function createEmptyStats(member: MemberProfile, period: LeaderboardPeriod, periodKey: string): PlayerStatsEntry {
  return {
    id: String(member.id),
    memberId: member.id,
    displayName: member.displayName,
    avatarUrl: member.avatarUrl,
    period: periodKey,
    periodType: period,
    totalKills: 0,
    totalDamage: 0,
    totalAssists: 0,
    totalRevives: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    winRate: 0,
    avgKillsPerGame: 0,
    avgDamagePerGame: 0,
    soloKills: 0,
    duoClanKills: 0,
    trioClanKills: 0,
    squadClanKills: 0,
    timePlayedSeconds: 0,
    activeDays: 0,
    badgeType: null,
  }
}

function aggregateLeaderboardEntries({
  members,
  matchRows,
  squadMembers,
  period,
  periodKey,
  killsView,
}: {
  members: MemberProfile[]
  matchRows: MatchActivityRow[]
  squadMembers: SquadMemberRow[]
  period: LeaderboardPeriod
  periodKey: string
  killsView: LeaderboardKillsView
}) {
  const entriesByMember = new Map<number, PlayerStatsEntry>()

  for (const member of members) {
    entriesByMember.set(member.id, createEmptyStats(member, period, periodKey))
  }

  const getOrCreateEntry = (memberId: number) => {
    const existing = entriesByMember.get(memberId)
    if (existing) {
      return existing
    }

    const fallback: PlayerStatsEntry = {
      id: String(memberId),
      memberId,
      displayName: `Membre ${memberId}`,
      avatarUrl: null,
      period: periodKey,
      periodType: period,
      totalKills: 0,
      totalDamage: 0,
      totalAssists: 0,
      totalRevives: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      winRate: 0,
      avgKillsPerGame: 0,
      avgDamagePerGame: 0,
      soloKills: 0,
      duoClanKills: 0,
      trioClanKills: 0,
      squadClanKills: 0,
      timePlayedSeconds: 0,
      activeDays: 0,
      badgeType: null,
    }

    entriesByMember.set(memberId, fallback)
    return fallback
  }

  const groupedClanMatchKeys = new Set<string>()

  for (const row of squadMembers) {
    const entry = getOrCreateEntry(row.memberId)
    groupedClanMatchKeys.add(`${row.memberId}:${row.squadMatch.pubgMatchId}`)

    entry.totalKills += row.kills
    entry.totalDamage += row.damage
    entry.totalAssists += row.assists
    entry.totalRevives += row.revives
    entry.matchesPlayed += 1
    entry.matchesWon += row.placement === 1 ? 1 : 0

    const clanMemberCount = row.squadMatch._count.members
    if (clanMemberCount <= 2) {
      entry.duoClanKills += row.kills
    } else if (clanMemberCount === 3) {
      entry.trioClanKills += row.kills
    } else {
      entry.squadClanKills += row.kills
    }
  }

  for (const row of matchRows) {
    const entry = getOrCreateEntry(row.memberId)
    const matchKey = `${row.memberId}:${row.pubgMatchId}`

    if (groupedClanMatchKeys.has(matchKey)) {
      continue
    }

    entry.soloKills += row.kills

    if (killsView !== 'withSolo') {
      continue
    }

    entry.totalKills += row.kills
    entry.totalDamage += row.damageDealt
    entry.totalAssists += row.assists
    entry.totalRevives += row.revives
    entry.matchesPlayed += 1
    entry.matchesWon += row.placement === 1 ? 1 : 0
  }

  const entries = Array.from(entriesByMember.values()).map((entry) => {
    const matchesPlayed = entry.matchesPlayed
    entry.winRate = matchesPlayed > 0 ? entry.matchesWon / matchesPlayed : 0
    entry.avgKillsPerGame = matchesPlayed > 0 ? entry.totalKills / matchesPlayed : 0
    entry.avgDamagePerGame = matchesPlayed > 0 ? entry.totalDamage / matchesPlayed : 0
    return entry
  })

  return entries
}

async function fetchLeaderboardActivity(
  memberIds: number[],
  dateRange: PeriodRange | null
): Promise<{ matchRows: MatchActivityRow[]; squadMembers: SquadMemberRow[] }> {
  const rangeFilter = dateRange
    ? {
        ...(dateRange.gte ? { gte: dateRange.gte } : {}),
        ...(dateRange.lte ? { lte: dateRange.lte } : {}),
      }
    : null

  const [matchRows, squadMembers] = await Promise.all([
    prisma.match.findMany({
      where: {
        memberId: { in: memberIds },
        matchType: 'official',
        ...(rangeFilter
          ? {
              pubgCreatedAt: rangeFilter,
            }
          : {}),
      },
      select: {
        memberId: true,
        pubgMatchId: true,
        kills: true,
        damageDealt: true,
        assists: true,
        revives: true,
        placement: true,
      },
    }),
    prisma.squadMember.findMany({
      where: {
        memberId: { in: memberIds },
        ...(rangeFilter
          ? {
              squadMatch: {
                createdAt: rangeFilter,
              },
            }
          : {}),
      },
      select: {
        memberId: true,
        kills: true,
        damage: true,
        assists: true,
        revives: true,
        placement: true,
        squadMatch: {
          select: {
            pubgMatchId: true,
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

  return { matchRows, squadMembers }
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

function applyLiveBadges(entries: PlayerStatsEntry[]): PlayerStatsEntry[] {
  if (entries.length === 0) {
    return entries
  }

  const nextEntries = entries.map<PlayerStatsEntry>((entry) => ({ ...entry, badgeType: null }))
  const withMatches = nextEntries.filter((entry) => entry.matchesPlayed > 0)
  const withMinMatches = nextEntries.filter((entry) => entry.matchesPlayed >= 3)

  if (withMatches.length === 0) {
    return nextEntries
  }

  const topKiller = [...withMatches].sort((a, b) => b.totalKills - a.totalKills)[0] ?? null
  const topDamage = [...withMatches].sort((a, b) => b.totalDamage - a.totalDamage)[0] ?? null
  const bestWr = [...withMinMatches].sort((a, b) => b.winRate - a.winRate)[0] ?? null

  const maxKills = Math.max(...withMatches.map((entry) => entry.totalKills), 1)
  const maxDamage = Math.max(...withMatches.map((entry) => entry.totalDamage), 1)
  const mvp = [...withMatches].sort((a, b) => {
    const scoreA = a.totalKills / maxKills + a.totalDamage / maxDamage + a.winRate
    const scoreB = b.totalKills / maxKills + b.totalDamage / maxDamage + b.winRate
    return scoreB - scoreA
  })[0] ?? null

  const marathon = [...withMatches].sort((a, b) => b.timePlayedSeconds - a.timePlayedSeconds)[0] ?? null
  const regular = [...withMatches].sort((a, b) => b.activeDays - a.activeDays)[0] ?? null

  const assigned = new Set<number>()

  if (topKiller) {
    topKiller.badgeType = 'top_killer'
    assigned.add(topKiller.memberId)
  }

  if (topDamage && !assigned.has(topDamage.memberId)) {
    topDamage.badgeType = 'top_damage'
    assigned.add(topDamage.memberId)
  }

  if (bestWr && !assigned.has(bestWr.memberId)) {
    bestWr.badgeType = 'best_wr'
    assigned.add(bestWr.memberId)
  }

  if (marathon && !assigned.has(marathon.memberId) && marathon.timePlayedSeconds > 0) {
    marathon.badgeType = 'marathon'
    assigned.add(marathon.memberId)
  }

  if (regular && !assigned.has(regular.memberId) && regular.activeDays > 0) {
    regular.badgeType = 'regular'
    assigned.add(regular.memberId)
  }

  if (mvp && !assigned.has(mvp.memberId)) {
    mvp.badgeType = 'mvp'
  }

  return nextEntries
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

    const roleError = await requireNavPermission('clan.leaderboard')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    const period = parsePeriod(request.nextUrl.searchParams.get('period'))
    const sortBy = parseSortBy(request.nextUrl.searchParams.get('sortBy'))
    const killsView = parseKillsView(request.nextUrl.searchParams.get('killsView'))
    const periodKey = getPeriodFilter(period)

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: { id: true },
    })

    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    const members = await prisma.clanMember.findMany({
      where: {
        clanId: parsedClanId,
        isActive: true,
      },
      include: {
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
      orderBy: { id: 'asc' },
    })

    const dateRange = getDateRangeForPeriod(period)
    const membersWithProfiles: MemberProfile[] = members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      avatarUrl: member.identities[0]?.user.avatarUrl ?? null,
    }))

    const memberIds = membersWithProfiles.map((member) => member.id)
    const statsRows = await prisma.playerStats.findMany({
      where: {
        period: periodKey,
        member: { clanId: parsedClanId, isActive: true },
      },
      select: {
        memberId: true,
        updatedAt: true,
        timePlayedSeconds: true,
        activeDays: true,
      },
    })

    const { matchRows, squadMembers } = await fetchLeaderboardActivity(memberIds, dateRange)
    const aggregatedLeaderboard = aggregateLeaderboardEntries({
      members: membersWithProfiles,
      matchRows,
      squadMembers,
      period,
      periodKey,
      killsView,
    })

    const statsByMember = new Map(statsRows.map((row) => [row.memberId, row]))
    for (const entry of aggregatedLeaderboard) {
      const stats = statsByMember.get(entry.memberId)
      if (stats) {
        entry.timePlayedSeconds = stats.timePlayedSeconds
        entry.activeDays = stats.activeDays
      }
    }

    const leaderboard = applyLiveBadges(aggregatedLeaderboard)

    const lastUpdated = statsRows.reduce<Date | null>((latest, row) => {
      if (!latest || row.updatedAt > latest) {
        return row.updatedAt
      }

      return latest
    }, null)

    const sortedLeaderboard = sortLeaderboard(leaderboard, sortBy)
    const highlights = buildHighlights(leaderboard)

    // Progression: follows selected period (4 weeks or 4 months) for all displayed players
    const leaderboardMemberIds = sortedLeaderboard.map((entry) => entry.memberId)

    const pastPeriods = getPastPeriods(period)

    const progressionByMember = new Map<
      number,
      { displayName: string; weeklyStats: WeeklyProgression['weeklyStats'] }
    >()

    if (pastPeriods.length > 0 && leaderboardMemberIds.length > 0) {
      const profileById = new Map(membersWithProfiles.map((member) => [member.id, member]))

      for (const periodItem of pastPeriods) {
        const periodRange = getDateRangeForPeriodKey(periodItem)
        if (!periodRange) {
          continue
        }

        const { matchRows: pastMatchRows, squadMembers: pastSquadMembers } = await fetchLeaderboardActivity(
          leaderboardMemberIds,
          periodRange
        )

        const pastEntries = aggregateLeaderboardEntries({
          members: leaderboardMemberIds.map((memberId) => {
            const profile = profileById.get(memberId)
            return profile ?? { id: memberId, displayName: `Membre ${memberId}`, avatarUrl: null }
          }),
          matchRows: pastMatchRows,
          squadMembers: pastSquadMembers,
          period,
          periodKey: periodItem,
          killsView,
        })

        const periodStatsParts = getPeriodLabelParts(periodItem)

        for (const entry of pastEntries) {
          const existing = progressionByMember.get(entry.memberId) ?? {
            displayName: entry.displayName,
            weeklyStats: [],
          }

          existing.weeklyStats.push({
            period: periodItem,
            week: periodStatsParts?.value ?? 0,
            year: periodStatsParts?.year ?? 0,
            totalKills: entry.totalKills,
            totalDamage: entry.totalDamage,
            winRate: entry.winRate,
            matchesPlayed: entry.matchesPlayed,
            matchesWon: entry.matchesWon,
          })

          progressionByMember.set(entry.memberId, existing)
        }
      }
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
