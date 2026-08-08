import { prisma } from '@/lib/prisma'
import { SquadPeriod } from '@/types/squad-matches'

function getPeriodBounds(period: SquadPeriod, referenceDate = new Date()): { gte: Date; lte: Date } {
  if (period === 'week') {
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

  if (period === 'month') {
    const startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0)
    const endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999)
    return { gte: startDate, lte: endDate }
  }

  // all-time
  return { gte: new Date(0), lte: new Date('9999-12-31') }
}

function getPeriodKey(period: SquadPeriod, referenceDate = new Date()): string {
  if (period === 'all') {
    return 'all-time'
  }
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

function teamModeFromMemberCount(memberCount: number) {
  if (memberCount <= 2) return 'duo'
  if (memberCount === 3) return 'trio'
  return 'squad'
}

function buildWinRate(wins: number, matchesPlayed: number) {
  return matchesPlayed > 0 ? wins / matchesPlayed : 0
}

function buildSynergyKey(memberIds: number[]) {
  return memberIds.join(':')
}

export type CachedClanMatchesPayload = {
  globalStats: {
    totalKills: number
    totalDamage: number
    winRate: number
    matchCount: number
    wins: number
    totalAssists: number
  }
  modePerformance: Array<{
    mode: 'duo' | 'trio' | 'squad'
    matches: number
    kills: number
    wins: number
    losses: number
    damage: number
    assists: number
    durationSeconds: number
  }>
  rosterStats: Array<{
    memberId: number
    displayName: string
    matchesPlayed: number
    totalKills: number
    totalAssists: number
    totalDamage: number
    wins: number
  }>
  byMode: Record<
    'all' | 'duo' | 'trio' | 'squad',
    {
      synergies: {
        topPairs: any[]
        topSquads: any[]
      }
      topPerformers: {
        kills: any[]
        damage: any[]
        survival: any[]
        winRate: any[]
        assists: any[]
        revives: any[]
      }
    }
  >
}

export async function precomputeClanMatchesStats(clanId: number) {
  const periods: SquadPeriod[] = ['week', 'month', 'all']
  const referenceDate = new Date()

  for (const period of periods) {
    try {
      const bounds = getPeriodBounds(period, referenceDate)
      const periodKey = getPeriodKey(period, referenceDate)

      const squadMatches = await prisma.squadMatch.findMany({
        where: {
          createdAt: { gte: bounds.gte, lte: bounds.lte },
          members: { some: { member: { clanId, isActive: true, joinStatus: 'active' } } },
        },
        include: {
          members: {
            include: { member: { select: { id: true, displayName: true } } },
            orderBy: { memberId: 'asc' },
          },
        },
      })

      const payload = processMatchesForCache(squadMatches)

      await prisma.clanMatchesCache.upsert({
        where: { clanId_period: { clanId, period } },
        create: {
          clanId,
          period,
          periodKey,
          payload: payload as any,
          computedAt: new Date(),
        },
        update: {
          periodKey,
          payload: payload as any,
          computedAt: new Date(),
        },
      })
    } catch (err) {
      console.error(`[matches-cache] Failed to precompute ${period} for clan ${clanId}`, err)
    }
  }
}

function processMatchesForCache(matches: any[]): CachedClanMatchesPayload {
  const globalStats = { totalKills: 0, totalDamage: 0, wins: 0, matchCount: 0, totalAssists: 0, winRate: 0 }
  
  const modePerformance = {
    duo: { mode: 'duo' as const, matches: 0, kills: 0, wins: 0, losses: 0, damage: 0, assists: 0, durationSeconds: 0 },
    trio: { mode: 'trio' as const, matches: 0, kills: 0, wins: 0, losses: 0, damage: 0, assists: 0, durationSeconds: 0 },
    squad: { mode: 'squad' as const, matches: 0, kills: 0, wins: 0, losses: 0, damage: 0, assists: 0, durationSeconds: 0 },
  }

  const rosterMap = new Map<number, any>()
  
  const modes = ['all', 'duo', 'trio', 'squad'] as const
  const stateByMode = Object.fromEntries(
    modes.map((m) => [
      m,
      {
        pairs: new Map(),
        squads: new Map(),
        performers: new Map(),
      },
    ])
  ) as any

  for (const match of matches) {
    const isWin = match.placement === 1
    const mode = teamModeFromMemberCount(match.members.length) as 'duo' | 'trio' | 'squad'

    globalStats.matchCount++
    globalStats.totalKills += match.totalKills
    globalStats.totalDamage += match.totalDamage
    globalStats.totalAssists += match.totalAssists
    if (isWin) globalStats.wins++

    const mp = modePerformance[mode]
    mp.matches++
    mp.kills += match.totalKills
    mp.damage += match.totalDamage
    mp.assists += match.totalAssists
    if (isWin) mp.wins++
    else mp.losses++

    const targetModes = ['all', mode]

    for (const member of match.members) {
      // Global roster stats
      if (!rosterMap.has(member.memberId)) {
        rosterMap.set(member.memberId, {
          memberId: member.memberId,
          displayName: member.member.displayName,
          matchesPlayed: 0,
          totalKills: 0,
          totalAssists: 0,
          totalDamage: 0,
          wins: 0,
        })
      }
      const r = rosterMap.get(member.memberId)
      r.matchesPlayed++
      r.totalKills += member.kills
      r.totalAssists += member.assists
      r.totalDamage += member.damage
      if (isWin) r.wins++

      // Mode-specific performers
      for (const tMode of targetModes) {
        const perfMap = stateByMode[tMode].performers
        if (!perfMap.has(member.memberId)) {
          perfMap.set(member.memberId, {
            memberId: member.memberId,
            displayName: member.member.displayName,
            matchesPlayed: 0,
            totalKills: 0,
            totalDamage: 0,
            totalAssists: 0,
            totalRevives: 0,
            placementTotal: 0,
            wins: 0
          })
        }
        const p = perfMap.get(member.memberId)
        p.matchesPlayed++
        p.totalKills += member.kills
        p.totalDamage += member.damage
        p.totalAssists += member.assists
        p.totalRevives += member.revives
        p.placementTotal += match.placement
        if (isWin) p.wins++
      }
    }

    // Pairs
    if (match.members.length >= 2) {
      for (let left = 0; left < match.members.length - 1; left++) {
        for (let right = left + 1; right < match.members.length; right++) {
          const pairMembers = [match.members[left], match.members[right]].sort((a, b) => a.memberId - b.memberId)
          const memberIds = pairMembers.map(m => m.memberId)
          const key = buildSynergyKey(memberIds)
          
          for (const tMode of targetModes) {
            const pairMap = stateByMode[tMode].pairs
            if (!pairMap.has(key)) {
              pairMap.set(key, {
                memberIds,
                memberNames: pairMembers.map(m => m.member.displayName),
                matchesPlayed: 0,
                wins: 0,
                totalKills: 0,
                totalDamage: 0,
              })
            }
            const p = pairMap.get(key)
            p.matchesPlayed++
            if (isWin) p.wins++
            p.totalKills += pairMembers[0].kills + pairMembers[1].kills
            p.totalDamage += pairMembers[0].damage + pairMembers[1].damage
          }
        }
      }
    }

    // Squads
    if (match.members.length >= 3 && match.members.length <= 4) {
      const squadMembers = [...match.members].sort((a, b) => a.memberId - b.memberId)
      const memberIds = squadMembers.map(m => m.memberId)
      const key = buildSynergyKey(memberIds)

      for (const tMode of targetModes) {
        const squadMap = stateByMode[tMode].squads
        if (!squadMap.has(key)) {
          squadMap.set(key, {
            memberIds,
            memberNames: squadMembers.map(m => m.member.displayName),
            matchesPlayed: 0,
            wins: 0,
            totalKills: 0,
            totalDamage: 0,
          })
        }
        const s = squadMap.get(key)
        s.matchesPlayed++
        if (isWin) s.wins++
        s.totalKills += match.totalKills
        s.totalDamage += match.totalDamage
      }
    }
  }

  globalStats.winRate = buildWinRate(globalStats.wins, globalStats.matchCount)

  const byMode: any = {}
  for (const m of modes) {
    const state = stateByMode[m]
    
    const synergies = {
      topPairs: Array.from(state.pairs.values()).map((p: any) => ({
        ...p,
        winRate: buildWinRate(p.wins, p.matchesPlayed)
      })).sort((a: any, b: any) => b.matchesPlayed - a.matchesPlayed || b.winRate - a.winRate || b.totalKills - a.totalKills).slice(0, 5),
      topSquads: Array.from(state.squads.values()).map((s: any) => ({
        ...s,
        winRate: buildWinRate(s.wins, s.matchesPlayed)
      })).sort((a: any, b: any) => b.matchesPlayed - a.matchesPlayed || b.winRate - a.winRate || b.totalKills - a.totalKills).slice(0, 5),
    }

    const perfList = Array.from(state.performers.values()).map((p: any) => ({
      memberId: p.memberId,
      displayName: p.displayName,
      matchesPlayed: p.matchesPlayed,
      totalKills: p.totalKills,
      totalDamage: p.totalDamage,
      totalAssists: p.totalAssists,
      totalRevives: p.totalRevives,
      averagePlacement: p.matchesPlayed > 0 ? p.placementTotal / p.matchesPlayed : 0,
      winRate: buildWinRate(p.wins, p.matchesPlayed)
    }))

    const sortPerf = (metric: string) => [...perfList].sort((a: any, b: any) => {
      if (metric === 'kills') return b.totalKills - a.totalKills || b.matchesPlayed - a.matchesPlayed
      if (metric === 'damage') return b.totalDamage - a.totalDamage || b.matchesPlayed - a.matchesPlayed
      if (metric === 'survival') return a.averagePlacement - b.averagePlacement || b.matchesPlayed - a.matchesPlayed
      if (metric === 'winRate') return b.winRate - a.winRate || b.matchesPlayed - a.matchesPlayed
      if (metric === 'assists') return b.totalAssists - a.totalAssists || b.matchesPlayed - a.matchesPlayed
      if (metric === 'revives') return b.totalRevives - a.totalRevives || b.matchesPlayed - a.matchesPlayed
      return 0
    })

    byMode[m] = {
      synergies,
      topPerformers: {
        kills: sortPerf('kills').slice(0, 5),
        damage: sortPerf('damage').slice(0, 5),
        survival: sortPerf('survival').slice(0, 5),
        winRate: sortPerf('winRate').slice(0, 5),
        assists: sortPerf('assists').slice(0, 5),
        revives: sortPerf('revives').slice(0, 5),
      }
    }
  }

  return {
    globalStats,
    modePerformance: [modePerformance.duo, modePerformance.trio, modePerformance.squad],
    rosterStats: Array.from(rosterMap.values()).sort((a: any, b: any) => b.matchesPlayed - a.matchesPlayed),
    byMode
  }
}
