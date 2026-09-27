import { getClanLeague } from '@/lib/clan-league-service'

/**
 * Ligue des clans : classement des clans suivis au Power score, recalculé à la volée depuis les parties officielles
 * (`clan-league-service.ts`, depuis le 2026-09-27 ; auparavant `ClanComparatorCache`). Seuls les clans qui ont joué sur
 * la période sont classés. Partagé par l'annuaire des clans et la vitrine de la vue d'ensemble (rang du clan).
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

export { clanPowerScore } from '@/lib/clan-league'

export async function computeClansLeaderboard(period: ClansLeaderboardPeriod): Promise<ClanLeaderboardEntry[]> {
  const league = await getClanLeague(period)
  return league.standings.map((entry) => ({
    clanId: entry.clanId,
    name: entry.name,
    tag: entry.tag,
    activeMembers: entry.activeMembers,
    matches: entry.matches,
    winRate: entry.winRate,
    avgDamage: entry.avgDamage,
    avgKills: entry.avgKills,
    avgKnocks: entry.avgKnocks,
    powerScore: entry.powerScore,
    rank: entry.rank,
  }))
}
