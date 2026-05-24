export type SquadPeriod = 'week' | 'month'

export interface SquadMatchMember {
  memberId: number
  displayName: string
  kills: number
  damage: number
  assists: number
  revives: number
  placement: number
}

export interface SquadMatch {
  id: string
  pubgMatchId: string
  gameMode: string
  mapName: string
  placement: number
  createdAt: string
  durationSeconds: number
  totalKills: number
  totalDamage: number
  totalAssists: number
  totalRevives: number
  members: SquadMatchMember[]
  isWin: boolean
}

export interface ClanMatchStats {
  totalKills: number
  totalDamage: number
  winRate: number
  matchCount: number
}

export interface SquadSynergyEntry {
  memberIds: number[]
  memberNames: string[]
  matchesPlayed: number
  totalKills: number
  totalDamage: number
  winRate: number
}

export interface SquadSynergiesData {
  topPairs: SquadSynergyEntry[]
  topSquads: SquadSynergyEntry[]
}

export interface SessionRecapItem {
  date: string
  matches: SquadMatch[]
  totalDuration: number
  totalKills: number
  totalDamage: number
  winRate: number
  members: Array<{
    memberId: number
    displayName: string
  }>
}

export interface PerformerEntry {
  memberId: number
  displayName: string
  matchesPlayed: number
  totalKills: number
  totalDamage: number
  averagePlacement: number
}

export interface TopPerformersData {
  kills: PerformerEntry[]
  damage: PerformerEntry[]
  survival: PerformerEntry[]
}

export interface ClanMatchesResponse {
  clanId: number
  clanName: string
  period: SquadPeriod
  gameMode?: string
  availableModes: string[]
  mapLabels: Record<string, string>
  squads: SquadMatch[]
  stats: ClanMatchStats
  sessions: SessionRecapItem[]
  synergies: SquadSynergiesData
  topPerformers: TopPerformersData
}
