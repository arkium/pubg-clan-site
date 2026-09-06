import type { ClanMatchTypeFilter } from '@/types/squad-matches'

export type LeaderboardPeriod = 'week' | 'month' | 'all'
export type LeaderboardSortBy = 'kills' | 'damage' | 'winRate' | 'matches' | 'kpm' | 'timePlayed' | 'activeDays'
export type LeaderboardTeamMode = 'all' | 'solo' | 'duo' | 'trio' | 'squad'
export type LeaderboardKillsView = 'clan' | 'withSolo'

export interface PlayerStatsEntry {
  id: string
  memberId: number
  displayName: string
  avatarUrl?: string | null
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

  soloKills: number
  duoClanKills: number
  trioClanKills: number
  squadClanKills: number

  timePlayedSeconds: number
  activeDays: number

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
    matchesWon: number
  }>
}

export interface LeaderboardResponse {
  clanId: number
  period: LeaderboardPeriod
  sortBy: LeaderboardSortBy
  matchType?: ClanMatchTypeFilter
  mode?: LeaderboardTeamMode
  lastUpdatedAt: string | null
  leaderboard: PlayerStatsEntry[]
  highlights: LeaderboardHighlights
  progression: WeeklyProgression[]
}

