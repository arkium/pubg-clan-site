import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import type { DashboardPeriod } from '@/types/dashboard'

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

function parsePeriod(value: string | null): DashboardPeriod {
  if (value === 'month' || value === 'all') return value
  return 'week'
}

function getPeriodKey(period: DashboardPeriod): string {
  const now = new Date()
  if (period === 'all') return 'all-time'
  if (period === 'month') {
    const month = now.getMonth() + 1
    return `month-${now.getFullYear()}-${String(month).padStart(2, '0')}`
  }
  // week: ISO week number
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `week-${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`
}

function getLastFourWeekKeys(): string[] {
  const keys: string[] = []
  const now = new Date()
  for (let i = 3; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i * 7)
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = utc.getUTCDay() || 7
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    keys.push(`week-${utc.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`)
  }
  return keys
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return NextResponse.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const period = parsePeriod(searchParams.get('period'))
    const periodKey = getPeriodKey(period)

    // 1. Fetch member
    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        displayName: true,
        pubgPlayerName: true,
        platformShard: true,
        createdAt: true,
        clanId: true,
      },
    })

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // 2. Fetch player stats for the period
    const playerStat = await prisma.playerStats.findUnique({
      where: { memberId_period: { memberId, period: periodKey } },
    })

    // 3. Fetch clan average
    let clanAverage = null
    if (member.clanId) {
      const clanStats = await prisma.playerStats.findMany({
        where: {
          member: { clanId: member.clanId, isActive: true },
          period: periodKey,
        },
      })

      if (clanStats.length > 0) {
        const count = clanStats.length
        clanAverage = {
          avgKills: clanStats.reduce((s, r) => s + r.totalKills, 0) / count,
          avgDamage: clanStats.reduce((s, r) => s + r.totalDamage, 0) / count,
          avgWinRate: clanStats.reduce((s, r) => s + r.winRate, 0) / count,
          avgMatches: clanStats.reduce((s, r) => s + r.matchesPlayed, 0) / count,
          avgAssists: clanStats.reduce((s, r) => s + r.totalAssists, 0) / count,
          avgRevives: clanStats.reduce((s, r) => s + r.totalRevives, 0) / count,
        }
      }
    }

    // 4. Progression: last 4 weeks
    const weekKeys = getLastFourWeekKeys()
    const progressionStats = await prisma.playerStats.findMany({
      where: { memberId, period: { in: weekKeys } },
    })

    const progressionMap = new Map(progressionStats.map((s) => [s.period, s]))
    const progression = weekKeys.map((key) => {
      const parts = key.split('-')
      const year = Number(parts[1])
      const week = Number(parts[2])
      const s = progressionMap.get(key)
      return {
        period: key,
        week,
        year,
        totalKills: s?.totalKills ?? 0,
        totalDamage: s?.totalDamage ?? 0,
        winRate: s?.winRate ?? 0,
        matchesPlayed: s?.matchesPlayed ?? 0,
      }
    })

    // 5. Top performances
    const topPerformances = await prisma.match.findMany({
      where: { memberId },
      orderBy: [{ kills: 'desc' }, { damageDealt: 'desc' }],
      take: 5,
      select: {
        id: true,
        pubgMatchId: true,
        mapName: true,
        gameMode: true,
        kills: true,
        damageDealt: true,
        placement: true,
        pubgCreatedAt: true,
      },
    })

    // 6. Squad frequency: find clan-mates who played most matches with this member
    const memberSquadMatches = await prisma.squadMember.findMany({
      where: { memberId },
      select: { squadMatchId: true },
    })

    const squadMatchIds = memberSquadMatches.map((s) => s.squadMatchId)

    let squads: Array<{
      memberId: number
      displayName: string
      matchCount: number
      totalKills: number
      totalDamage: number
      winRate: number
    }> = []

    if (squadMatchIds.length > 0) {
      const coPlayers = await prisma.squadMember.findMany({
        where: {
          squadMatchId: { in: squadMatchIds },
          memberId: { not: memberId },
        },
        include: {
          member: { select: { id: true, displayName: true } },
          squadMatch: { select: { placement: true } },
        },
      })

      const playerMap = new Map<
        number,
        { displayName: string; matchCount: number; kills: number; damage: number; wins: number }
      >()

      for (const cp of coPlayers) {
        const existing = playerMap.get(cp.memberId) ?? {
          displayName: cp.member.displayName,
          matchCount: 0,
          kills: 0,
          damage: 0,
          wins: 0,
        }
        existing.matchCount += 1
        existing.kills += cp.kills
        existing.damage += cp.damage
        if (cp.squadMatch.placement === 1) existing.wins += 1
        playerMap.set(cp.memberId, existing)
      }

      squads = Array.from(playerMap.entries())
        .map(([pid, data]) => ({
          memberId: pid,
          displayName: data.displayName,
          matchCount: data.matchCount,
          totalKills: data.kills,
          totalDamage: data.damage,
          winRate: data.matchCount > 0 ? data.wins / data.matchCount : 0,
        }))
        .sort((a, b) => b.matchCount - a.matchCount)
        .slice(0, 10)
    }

    return NextResponse.json({
      member: {
        id: member.id,
        displayName: member.displayName,
        pubgPlayerName: member.pubgPlayerName,
        platformShard: member.platformShard,
        createdAt: member.createdAt.toISOString(),
      },
      stats: playerStat
        ? {
            totalKills: playerStat.totalKills,
            totalDamage: playerStat.totalDamage,
            totalAssists: playerStat.totalAssists,
            totalRevives: playerStat.totalRevives,
            matchesPlayed: playerStat.matchesPlayed,
            matchesWon: playerStat.matchesWon,
            winRate: playerStat.winRate,
            avgKillsPerGame: playerStat.avgKillsPerGame,
            avgDamagePerGame: playerStat.avgDamagePerGame,
            badgeType: playerStat.badgeType,
          }
        : null,
      clanAverage,
      progression,
      topPerformances: topPerformances.map((m) => ({
        ...m,
        pubgCreatedAt: m.pubgCreatedAt.toISOString(),
      })),
      squads,
      period,
    })
  } catch (error) {
    console.error('Error fetching dashboard:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
