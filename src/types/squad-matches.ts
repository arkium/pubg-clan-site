export type SquadPeriod = 'week' | 'month' | 'month-1' | 'month-2' | 'all'

export interface SquadMatchMember {
  memberId: number
  displayName: string
  kills: number
  damage: number
  assists: number
  revives: number
  placement: number
}

export interface SquadMatchTelemetrySummary {
  totalEvents: number
  killEvents: number
  reviveEvents: number
  damageEvents: number
  knockoutEvents: number
  itemUseEvents: number
  vehicleEvents: number
  positionEvents: number
  phaseChangeEvents: number
  blueZoneEvents: number
  distinctEventTypes: number
}

export interface SquadMatchTelemetryWeaponStat {
  weaponName: string
  kills: number
  headshots: number
  damageDealt: number
}

export interface SquadMatchTelemetryMemberStat {
  memberKey: string
  teamId?: number
  teamPlacement?: number
  firstKillPhase: number
  kills: number
  headshots: number
  damageDealt: number
  damageTaken: number
  onFootDistanceMeters: number
  vehicleDistanceMeters: number
  revives: number
  knockouts: number
  deaths: number
  blueZoneHits: number
  vehicleRideEvents: number
  vehicleLeaveEvents: number
  positionEvents: number
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
  telemetry?: {
    status: 'success' | 'failed' | 'pending'
    parserVersion: string | null
    parsedAt: string | null
    bytesDownloaded: number | null
    summary: SquadMatchTelemetrySummary | null
    topWeapons: SquadMatchTelemetryWeaponStat[]
    memberStats: SquadMatchTelemetryMemberStat[]
    errorCode: string | null
    errorMessage: string | null
  }
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
  totalDurationSeconds: number
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

export interface ClanModePerformanceEntry {
  mode: 'duo' | 'trio' | 'squad'
  matches: number
  kills: number
  wins: number
  losses: number
  damage: number
  assists: number
  durationSeconds: number
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
  modePerformance: ClanModePerformanceEntry[]
  sessions: SessionRecapItem[]
  synergies: SquadSynergiesData
  topPerformers: TopPerformersData
}
