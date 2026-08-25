import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ClanComparatorPayload } from '@/lib/clan-comparator-service'

export interface ClanLeaderboardEntry {
  clanId: number
  name: string
  tag: string
  activeMembers: number
  matches: number
  winRate: number
  avgDamage: number
  avgKills: number
  avgKnocks: number
  powerScore: number
  rank: number
}

export interface ClansLeaderboardResponse {
  period: 'week' | 'month' | 'all'
  leaderboard: ClanLeaderboardEntry[]
}

function parsePeriod(value: string | null): 'week' | 'month' | 'all' {
  if (value === 'week') return 'week'
  if (value === 'month') return 'month'
  return 'all'
}

export async function GET(request: NextRequest) {
  try {
    const period = parsePeriod(request.nextUrl.searchParams.get('period'))

    const cacheRows = await prisma.clanComparatorCache.findMany({
      where: { period, clan: { isActive: true, pubgClanId: { not: null } } },
      include: {
        clan: {
          select: { name: true, tag: true }
        }
      }
    })

    const entries: ClanLeaderboardEntry[] = []

    for (const row of cacheRows) {
      const payload = row.payload as unknown as ClanComparatorPayload
      
      // Skip clans with no matches if we are not looking at 'all' period? 
      // Actually, if matchCount is 0, they shouldn't rank high anyway.
      const winRate = payload.performance?.winRate ?? 0
      const avgDamage = payload.performance?.avgDamagePerMatch ?? 0
      const avgKills = payload.performance?.avgKillsPerMatch ?? 0
      const avgKnocks = payload.performance?.avgKnockoutsPerMatch ?? 0
      
      // ((WinRate * 100) * 100) + (AvgDamagePerMatch) + (KillsPerMatch * 10) + (KnocksPerMatch * 5)
      // Ex: a 12.5% win rate (0.125) gives 12.5 * 100 = 1250 pts
      const powerScore = ((winRate * 100) * 100) + avgDamage + (avgKills * 10) + (avgKnocks * 5)

      entries.push({
        clanId: row.clanId,
        name: row.clan.name,
        tag: row.clan.tag,
        activeMembers: payload.pulse?.rosterHealth?.activeMembers ?? 0,
        matches: payload.performance?.matchCount ?? 0,
        winRate,
        avgDamage,
        avgKills,
        avgKnocks,
        powerScore,
        rank: 0,
      })
    }

    // Sort by powerScore descending
    entries.sort((a, b) => b.powerScore - a.powerScore)

    // Assign rank
    entries.forEach((entry, idx) => {
      entry.rank = idx + 1
    })

    return Response.json({
      period,
      leaderboard: entries
    })
  } catch (error) {
    console.error('Error fetching clans leaderboard:', error)
    return Response.json({ error: 'Failed to fetch clans leaderboard' }, { status: 500 })
  }
}
