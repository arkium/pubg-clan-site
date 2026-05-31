export type DashboardPeriod = 'week' | 'month' | 'all'
export type DashboardMatchSortKey = 'pubgCreatedAt' | 'kills' | 'damageDealt' | 'placement'
export type DashboardMatchSortDirection = 'asc' | 'desc'

export interface DashboardMember {
  id: number
  displayName: string
  avatarUrl?: string | null
  pubgPlayerName: string
  platformShard: string
  createdAt: string
}

export interface DashboardStats {
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

export interface ClanAverage {
  avgKills: number
  avgDamage: number
  avgWinRate: number
  avgMatches: number
  avgAssists: number
  avgRevives: number
}

export interface DashboardProgression {
  period: string
  week: number
  year: number
  totalKills: number
  totalDamage: number
  winRate: number
  matchesPlayed: number
}

export interface TopPerformance {
  id: string
  pubgMatchId: string
  mapName: string
  gameMode: string
  kills: number
  damageDealt: number
  placement: number
  pubgCreatedAt: string
}

export interface SquadFrequencyEntry {
  memberId: number
  displayName: string
  avatarUrl?: string | null
  matchCount: number
  totalKills: number
  totalDamage: number
  winRate: number
}

export interface DashboardResponse {
  member: DashboardMember
  stats: DashboardStats | null
  clanAverage: ClanAverage | null
  progression: DashboardProgression[]
  topPerformances: TopPerformance[]
  squads: SquadFrequencyEntry[]
  mapLabels: Record<string, string>
  period: DashboardPeriod
}

export interface DashboardMatch {
  id: string
  pubgMatchId: string
  clanMode: 'solo' | 'duo' | 'trio' | 'squad'
  mapName: string
  gameMode: string
  duration: number
  placement: number
  kills: number
  damageDealt: number
  assists: number
  revives: number
  pubgCreatedAt: string
  squad: string[]
}

export interface MatchesResponse {
  matches: DashboardMatch[]
  totalCount: number
  mapLabels: Record<string, string>
}
