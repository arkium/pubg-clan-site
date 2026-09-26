import { prisma } from '@/lib/prisma'
import type { ClanComparatorPayload } from '@/lib/clan-comparator-service'

/**
 * Ligue des clans : classement des clans actifs par « power score », calculé depuis `ClanComparatorCache`.
 * Partagé par `GET /api/clans-leaderboard` et la vitrine de la vue d'ensemble d'un clan (rang du clan).
 */

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

export type ClansLeaderboardPeriod = 'week' | 'month' | 'all'

/** ((WinRate × 100) × 100) + dégâts moyens + kills moyens × 10 + mises à terre moyennes × 5. */
export function clanPowerScore(input: { winRate: number; avgDamage: number; avgKills: number; avgKnocks: number }): number {
  return input.winRate * 100 * 100 + input.avgDamage + input.avgKills * 10 + input.avgKnocks * 5
}

export async function computeClansLeaderboard(period: ClansLeaderboardPeriod): Promise<ClanLeaderboardEntry[]> {
  const cacheRows = await prisma.clanComparatorCache.findMany({
    where: { period, clan: { isActive: true, pubgClanId: { not: null } } },
    include: { clan: { select: { name: true, tag: true } } },
  })

  const entries: ClanLeaderboardEntry[] = cacheRows.map((row) => {
    const payload = row.payload as unknown as ClanComparatorPayload
    const winRate = payload.performance?.winRate ?? 0
    const avgDamage = payload.performance?.avgDamagePerMatch ?? 0
    const avgKills = payload.performance?.avgKillsPerMatch ?? 0
    const avgKnocks = payload.performance?.avgKnockoutsPerMatch ?? 0
    return {
      clanId: row.clanId,
      name: row.clan.name,
      tag: row.clan.tag,
      activeMembers: payload.pulse?.rosterHealth?.activeMembers ?? 0,
      matches: payload.performance?.matchCount ?? 0,
      winRate,
      avgDamage,
      avgKills,
      avgKnocks,
      powerScore: clanPowerScore({ winRate, avgDamage, avgKills, avgKnocks }),
      rank: 0,
    }
  })

  entries.sort((a, b) => b.powerScore - a.powerScore)
  entries.forEach((entry, index) => {
    entry.rank = index + 1
  })
  return entries
}
