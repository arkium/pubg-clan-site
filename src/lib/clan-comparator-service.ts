import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { SquadPeriod } from '@/types/squad-matches'

const CACHE_PERIODS: Array<'week' | 'month' | 'all'> = ['week', 'month', 'all']

function getPeriodBounds(period: 'week' | 'month' | 'all', referenceDate = new Date()): { gte: Date; lte: Date } | null {
  if (period === 'all') return null

  if (period === 'month') {
    const startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0)
    const endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999)
    return { gte: startDate, lte: endDate }
  }

  const day = referenceDate.getDay()
  const diff = referenceDate.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(referenceDate)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { gte: monday, lte: sunday }
}

function getPeriodKey(period: 'week' | 'month' | 'all', referenceDate = new Date()): string {
  if (period === 'all') return 'all-time'
  if (period === 'week') {
    const tmp = new Date(referenceDate.getTime())
    tmp.setHours(0, 0, 0, 0)
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
    const week1 = new Date(tmp.getFullYear(), 0, 4)
    const week = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
    return `week-${referenceDate.getFullYear()}-${String(week).padStart(2, '0')}`
  }
  return `month-${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`
}

function teamModeFromMemberCount(memberCount: number): 'solo' | 'duo' | 'trio' | 'squad' {
  if (memberCount <= 1) return 'solo'
  if (memberCount === 2) return 'duo'
  if (memberCount === 3) return 'trio'
  return 'squad'
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export type ClanComparatorPayload = {
  pulse: {
    activityByDayHour: number[][] // [dayOfWeek 0-6][hour 0-23] = match count
    squadSizeDistribution: { solo: number; duo: number; trio: number; squad: number }
    rosterHealth: { activeMembers: number; totalMembers: number; participationRate: number }
    dailyMatchCounts: Array<{ date: string; matches: number }>
    modePerformance: Array<{
      mode: 'duo' | 'trio' | 'squad'
      matches: number
      wins: number
      winRate: number
      totalKills: number
    }>
  }
  dna: {
    hotDropSharePercent: number
    hotDropCount: number
    dropCount: number
    avgDamagePerMatch: number
    avgKillsPerMatch: number
    avgTimeSurvivedSeconds: number
    revivesGiven: number
    knockoutsTaken: number
    teamplayRatio: number | null
  }
  performance: {
    matchCount: number
    wins: number
    winRate: number
    top10Count: number
    top10Rate: number
    avgDamagePerMatch: number
    avgKillsPerMatch: number
  }
}

export async function computeClanComparatorStats(clanId: number, referenceDate = new Date()): Promise<void> {
  for (const period of CACHE_PERIODS) {
    try {
      const payload = await buildClanComparatorPayload(clanId, period, referenceDate)
      const periodKey = getPeriodKey(period, referenceDate)

      await prisma.clanComparatorCache.upsert({
        where: { clanId_period: { clanId, period } },
        create: { clanId, period, periodKey, payload: payload as unknown as Prisma.InputJsonValue, computedAt: new Date() },
        update: { periodKey, payload: payload as unknown as Prisma.InputJsonValue, computedAt: new Date() },
      })
    } catch (err) {
      console.error(`[clan-comparator] Failed to precompute ${period} for clan ${clanId}`, err)
    }
  }
}

async function buildClanComparatorPayload(
  clanId: number,
  period: 'week' | 'month' | 'all',
  referenceDate: Date
): Promise<ClanComparatorPayload> {
  const bounds = getPeriodBounds(period, referenceDate)

  // Isolation stricte : toutes les requêtes ci-dessous filtrent explicitement
  // member.isActive/joinStatus plutôt que de s'appuyer sur le clanId dénormalisé
  // (PositionMetricCell.clanId, DropPressureStat) — sinon les membres en simple
  // watchlist (joinStatus: 'tracked') polluent les stats du comparateur. Voir
  // tracked-isolation.test.ts et la décision "clans actifs uniquement" du todo.
  const activeMemberFilter = { clanId, isActive: true, joinStatus: 'active' } as const

  const [squadMatches, dropPressureAgg, hotDropCount, knockoutsTakenAgg, totalMembers] = await Promise.all([
    prisma.squadMatch.findMany({
      where: {
        ...(bounds ? { createdAt: { gte: bounds.gte, lte: bounds.lte } } : {}),
        members: { some: { member: activeMemberFilter } },
      },
      select: {
        placement: true,
        createdAt: true,
        // La taille d'équipe (duo/trio/squad) doit refléter la composition réelle
        // du match : on inclut tous les membres du clan (isActive, peu importe
        // joinStatus) pour ce calcul. Filtrer sur joinStatus:'active' ici sous-
        // comptait l'effectif dès qu'un coéquipier n'était qu'auto-détecté
        // ('tracked') — un vrai squad de 4 se retrouvait classé "solo" (bug
        // constaté sur FR-Alliance-BE : 42 matchs joués, 0 comptés en duo/trio/
        // squad). L'agrégation des stats individuelles (kills/dégâts/revives)
        // reste en revanche filtrée sur joinStatus:'active' via `isCountedActive`
        // ci-dessous, pour conserver l'isolation watchlist sur les chiffres
        // attribués au clan.
        members: {
          where: { member: { clanId, isActive: true } },
          select: {
            memberId: true,
            damage: true,
            kills: true,
            revives: true,
            timeSurvived: true,
            member: { select: { joinStatus: true } },
          },
        },
      },
    }),
    prisma.dropPressureStat.aggregate({
      where: {
        member: activeMemberFilter,
        ...(bounds ? { matchDate: { gte: bounds.gte, lte: bounds.lte } } : {}),
      },
      _count: { _all: true },
    }),
    prisma.dropPressureStat.count({
      where: {
        member: activeMemberFilter,
        pressureLevel: { in: ['hot', 'very_hot'] },
        ...(bounds ? { matchDate: { gte: bounds.gte, lte: bounds.lte } } : {}),
      },
    }),
    prisma.positionMetricCell.aggregate({
      where: {
        member: activeMemberFilter,
        metric: 'knockout_taken',
        ...(bounds ? { matchDate: { gte: bounds.gte, lte: bounds.lte } } : {}),
      },
      _sum: { eventCount: true },
    }),
    prisma.clanMember.count({ where: activeMemberFilter }),
  ])

  const dropCount = dropPressureAgg._count._all

  const activityByDayHour: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  const squadSizeDistribution = { solo: 0, duo: 0, trio: 0, squad: 0 }
  const dailyMatchCountsMap = new Map<string, number>()
  const activeMemberIds = new Set<number>()
  const modePerformanceMap = {
    duo: { mode: 'duo' as const, matches: 0, wins: 0, totalKills: 0 },
    trio: { mode: 'trio' as const, matches: 0, wins: 0, totalKills: 0 },
    squad: { mode: 'squad' as const, matches: 0, wins: 0, totalKills: 0 },
  }

  let matchCount = 0
  let wins = 0
  let top10Count = 0
  let totalDamage = 0
  let totalKills = 0
  let totalTimeSurvived = 0
  let sampleCount = 0
  let revivesGiven = 0

  for (const match of squadMatches) {
    if (match.members.length === 0) continue

    matchCount++
    if (match.placement === 1) wins++
    if (match.placement <= 10) top10Count++

    const dayOfWeek = match.createdAt.getDay()
    const hour = match.createdAt.getHours()
    activityByDayHour[dayOfWeek][hour]++

    const dateKey = toDateKey(match.createdAt)
    dailyMatchCountsMap.set(dateKey, (dailyMatchCountsMap.get(dateKey) ?? 0) + 1)

    // Taille d'équipe : composition réelle du squad (tous les membres présents).
    const mode = teamModeFromMemberCount(match.members.length)
    squadSizeDistribution[mode]++

    let matchKills = 0
    for (const member of match.members) {
      // Agrégation des stats individuelles : seuls les membres officiellement
      // actifs comptent, pour ne pas attribuer au clan les stats de coéquipiers
      // simplement auto-détectés (joinStatus 'tracked').
      if (member.member.joinStatus !== 'active') continue

      activeMemberIds.add(member.memberId)
      totalDamage += member.damage
      totalKills += member.kills
      matchKills += member.kills
      totalTimeSurvived += member.timeSurvived
      revivesGiven += member.revives
      sampleCount++
    }

    if (mode === 'duo' || mode === 'trio' || mode === 'squad') {
      const bucket = modePerformanceMap[mode]
      bucket.matches++
      bucket.totalKills += matchKills
      if (match.placement === 1) bucket.wins++
    }
  }

  const knockoutsTaken = knockoutsTakenAgg._sum.eventCount ?? 0

  return {
    pulse: {
      activityByDayHour,
      squadSizeDistribution,
      rosterHealth: {
        activeMembers: activeMemberIds.size,
        totalMembers,
        participationRate: totalMembers > 0 ? activeMemberIds.size / totalMembers : 0,
      },
      dailyMatchCounts: Array.from(dailyMatchCountsMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, matches]) => ({ date, matches })),
      modePerformance: (['duo', 'trio', 'squad'] as const).map((mode) => {
        const bucket = modePerformanceMap[mode]
        return { ...bucket, winRate: bucket.matches > 0 ? bucket.wins / bucket.matches : 0 }
      }),
    },
    dna: {
      hotDropSharePercent: dropCount > 0 ? (hotDropCount / dropCount) * 100 : 0,
      hotDropCount,
      dropCount,
      avgDamagePerMatch: sampleCount > 0 ? totalDamage / matchCount : 0,
      avgKillsPerMatch: sampleCount > 0 ? totalKills / matchCount : 0,
      avgTimeSurvivedSeconds: sampleCount > 0 ? totalTimeSurvived / sampleCount : 0,
      revivesGiven,
      knockoutsTaken,
      teamplayRatio: knockoutsTaken > 0 ? revivesGiven / knockoutsTaken : null,
    },
    performance: {
      matchCount,
      wins,
      winRate: matchCount > 0 ? wins / matchCount : 0,
      top10Count,
      top10Rate: matchCount > 0 ? top10Count / matchCount : 0,
      avgDamagePerMatch: matchCount > 0 ? totalDamage / matchCount : 0,
      avgKillsPerMatch: matchCount > 0 ? totalKills / matchCount : 0,
    },
  }
}

export async function getClanComparatorStats(
  clanIds: number[],
  period: SquadPeriod
): Promise<Array<{ clanId: number; clanName: string; clanTag: string; computedAt: Date | null } & Partial<ClanComparatorPayload>>> {
  const cachePeriod: 'week' | 'month' | 'all' = period === 'week' ? 'week' : period === 'all' ? 'all' : 'month'

  const [clans, cacheRows] = await Promise.all([
    prisma.clan.findMany({
      where: { id: { in: clanIds }, isActive: true },
      select: { id: true, name: true, tag: true },
    }),
    prisma.clanComparatorCache.findMany({
      where: { clanId: { in: clanIds }, period: cachePeriod },
    }),
  ])

  const cacheByClanId = new Map(cacheRows.map((row) => [row.clanId, row]))

  return clans.map((clan) => {
    const cached = cacheByClanId.get(clan.id)
    const payload = (cached?.payload as unknown as ClanComparatorPayload | undefined) ?? undefined
    return {
      clanId: clan.id,
      clanName: clan.name,
      clanTag: clan.tag,
      computedAt: cached?.computedAt ?? null,
      ...payload,
    }
  })
}
