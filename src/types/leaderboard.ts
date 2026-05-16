export type LeaderboardPeriod = 'week' | 'month' | 'all'
export type LeaderboardSortBy = 'kills' | 'damage' | 'winRate' | 'matches'

export interface PlayerStatsEntry {
  id: string
  memberId: number
  displayName: string
  period: string
  periodType: string

  totalKills: number
  totalDamage: number
  totalAssists: number
  totalRevives: number
  matchesPlayed: number
  matchesWon: number
  winRate: number
  avgKillsPerGame: number
  avgDamagePerGame: number

  badgeType: string | null
}

export interface LeaderboardHighlights {
  topKiller: PlayerStatsEntry | null
  topDamage: PlayerStatsEntry | null
  bestWinRate: PlayerStatsEntry | null
  mvp: PlayerStatsEntry | null
}

export interface WeeklyProgression {
  memberId: number
  displayName: string
  weeklyStats: Array<{
    period: string
    week: number
    year: number
    totalKills: number
    totalDamage: number
    winRate: number
    matchesPlayed: number
  }>
}

export interface LeaderboardResponse {
  clanId: number
  period: LeaderboardPeriod
  sortBy: LeaderboardSortBy
  leaderboard: PlayerStatsEntry[]
  highlights: LeaderboardHighlights
  progression: WeeklyProgression[]
}
