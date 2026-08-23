import { prisma } from '@/lib/prisma'
import { getMapLabels } from '@/lib/map-label-service'
import { getLastWeekKeys } from '@/lib/dashboard-progression'

import type { DashboardPeriod } from '@/types/dashboard'
import { requireSameClanAsMember } from '@/middleware/auth-permission'
import {
  getDropPressureDashboardStats,
  getDropPressureMemberRanking,
  getDropPressureTimeline,
} from '@/lib/drop-pressure-stats'

type ClanMode = 'solo' | 'duo' | 'trio' | 'squad'

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

function parsePeriod(value: string | null): DashboardPeriod {
  if (value === 'month' || value === 'all') return value
  return 'week'
}

function clanModeFromClanMemberCount(memberCount: number | null | undefined): ClanMode {
  if (!memberCount || memberCount <= 1) {
    return 'solo'
  }

  if (memberCount <= 2) {
    return 'duo'
  }

  if (memberCount === 3) {
    return 'trio'
  }

  return 'squad'
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

function getDateRangeForDashboardPeriod(period: DashboardPeriod): {
  startDate: Date
  endDate: Date
} | null {
  if (period === 'all') {
    return null
  }

  const now = new Date()

  if (period === 'month') {
    return {
      startDate: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    }
  }

  const currentDay = now.getDay()
  const distanceFromMonday = currentDay === 0 ? 6 : currentDay - 1
  const startDate = new Date(now)
  startDate.setDate(now.getDate() - distanceFromMonday)
  startDate.setHours(0, 0, 0, 0)

  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 6)
  endDate.setHours(23, 59, 59, 999)

  return { startDate, endDate }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const period = parsePeriod(searchParams.get('period'))
    const periodKey = getPeriodKey(period)
    const dateRange = getDateRangeForDashboardPeriod(period)
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
    })

    if (!member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    const [dropPressure, dropPressureRanking, dropPressureTimeline] = await Promise.all([
      getDropPressureDashboardStats({ memberId, period }),
      member.clanId
        ? getDropPressureMemberRanking({ clanId: member.clanId, period })
        : Promise.resolve([]),
      getDropPressureTimeline({ memberId }),
    ])

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

    // 4. Progression: last 8 weeks
    const weekKeys = getLastWeekKeys()
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

    // 5. Top performances (sans solo clan)
    const topPerformanceCandidates = await prisma.match.findMany({
      where: {
        memberId,
        ...(dateRange
          ? {
              pubgCreatedAt: {
                gte: dateRange.startDate,
                lte: dateRange.endDate,
              },
            }
          : {}),
      },
      orderBy: [{ kills: 'desc' }, { damageDealt: 'desc' }],
      take: 50,
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

    const candidateMatchIds = topPerformanceCandidates.map((match) => match.pubgMatchId)
    const squadMembersForCandidates = candidateMatchIds.length
      ? await prisma.squadMember.findMany({
          where: {
            memberId,
            squadMatch: {
              pubgMatchId: { in: candidateMatchIds },
            },
          },
          select: {
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
        })
      : []

    const clanMemberCountByMatchId = new Map<string, number>()
    for (const squadMember of squadMembersForCandidates) {
      clanMemberCountByMatchId.set(
        squadMember.squadMatch.pubgMatchId,
        squadMember.squadMatch._count.members
      )
    }

    const topPerformances = topPerformanceCandidates
      .filter(
        (match) =>
          clanModeFromClanMemberCount(clanMemberCountByMatchId.get(match.pubgMatchId)) !== 'solo'
      )
      .slice(0, 5)

    // 6. Squad frequency: find clan-mates who played most matches with this member
    const memberSquadMatches = await prisma.squadMember.findMany({
      where: {
        memberId,
        ...(dateRange
          ? {
              squadMatch: {
                createdAt: {
                  gte: dateRange.startDate,
                  lte: dateRange.endDate,
                },
              },
            }
          : {}),
      },
      select: { squadMatchId: true, kills: true, timeSurvived: true },
    })

    const squadMatchIds = memberSquadMatches.map((s) => s.squadMatchId)
    const memberKillsBySquadMatchId = new Map(
      memberSquadMatches.map((entry) => [entry.squadMatchId, entry.kills])
    )
    const memberPlayTimeBySquadMatchId = new Map(
      memberSquadMatches.map((entry) => [entry.squadMatchId, entry.timeSurvived])
    )

    let squads: Array<{
      memberId: number
      displayName: string
      avatarUrl: string | null
      matchCount: number
      totalKills: number
      totalDamage: number
      winRate: number
      sharedPlayTimeSeconds: number
    }> = []

    if (squadMatchIds.length > 0) {
      const coPlayers = await prisma.squadMember.findMany({
        where: {
          squadMatchId: { in: squadMatchIds },
          memberId: { not: memberId },
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
          squadMatch: { select: { placement: true } },
        },
      })

      const playerMap = new Map<
        number,
        {
          displayName: string
          avatarUrl: string | null
          matchCount: number
          kills: number
          damage: number
          wins: number
          sharedPlayTimeSeconds: number
        }
      >()

      for (const cp of coPlayers) {
        const existing = playerMap.get(cp.memberId) ?? {
          displayName: cp.member.displayName,
          avatarUrl: cp.member.identities[0]?.user.avatarUrl ?? null,
          matchCount: 0,
          kills: 0,
          damage: 0,
          wins: 0,
          sharedPlayTimeSeconds: 0,
        }
        existing.matchCount += 1
        existing.kills += cp.kills + (memberKillsBySquadMatchId.get(cp.squadMatchId) ?? 0)
        existing.damage += cp.damage
        const memberPlayTime = memberPlayTimeBySquadMatchId.get(cp.squadMatchId) ?? 0
        existing.sharedPlayTimeSeconds += Math.min(memberPlayTime, cp.timeSurvived)
        if (cp.squadMatch.placement === 1) existing.wins += 1
        playerMap.set(cp.memberId, existing)
      }

      squads = Array.from(playerMap.entries())
        .map(([pid, data]) => ({
          memberId: pid,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
          matchCount: data.matchCount,
          totalKills: data.kills,
          totalDamage: data.damage,
          winRate: data.matchCount > 0 ? data.wins / data.matchCount : 0,
          sharedPlayTimeSeconds: data.sharedPlayTimeSeconds,
        }))
        .sort((a, b) => b.matchCount - a.matchCount)
    }

    return Response.json({
      member: {
        id: member.id,
        displayName: member.displayName,
        avatarUrl: member.identities[0]?.user.avatarUrl ?? null,
        pubgPlayerName: member.pubgPlayerName,
        platformShard: member.platformShard,
        createdAt: member.createdAt.toISOString(),
        clanId: member.clanId,
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
      dropPressure,
      dropPressureRanking,
      dropPressureTimeline,
      mapLabels: await getMapLabels(),
      period,
    })
  } catch (error) {
    console.error('Error fetching dashboard:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
