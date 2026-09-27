export type DashboardPeriod = 'week' | 'month' | 'all'
export type DashboardMatchSortKey = 'pubgCreatedAt' | 'kills' | 'damageDealt' | 'placement'
export type DashboardMatchSortDirection = 'asc' | 'desc'

export interface ClanAverage {
  avgKills: number
  avgDamage: number
  avgWinRate: number
  avgMatches: number
  avgAssists: number
  avgRevives: number
}

export interface DashboardMatch {
  id: string
  pubgMatchId: string
  clanMode: 'solo' | 'duo' | 'trio' | 'squad'
  mapName: string
  gameMode: string
  matchType?: string
  duration: number
  placement: number
  kills: number
  damageDealt: number
  assists: number
  revives: number
  pubgCreatedAt: string
  squad: string[]
  clanId?: number | null
  squadMatchId?: string | null
  telemetryAvailable?: boolean
}

export interface MatchesResponse {
  matches: DashboardMatch[]
  totalCount: number
  mapLabels: Record<string, string>
}

// ── Tableau de bord joueur, refonte du 2026-09-27 (docs/features/membres.md) ──────────────────────────

export type PlayerPlaystyleScores = { aggression: number; support: number; zoneDiscipline: number }

export interface PlayerPlaystyle {
  /** `null` : aucune partie mesurée par la télémétrie sur la période. */
  current:
    | (PlayerPlaystyleScores & {
        safeZonePercent: number
        /** Part des dégâts reçus compensée par les soins ; `null` sans dégâts reçus mesurés. */
        healCoveragePercent: number | null
        firstContactPhase: number | null
        matchesPlayed: number
      })
    | null
  /** Période précédente (tendance) ; `null` pour « Tous » ou sans mesure. */
  previous: PlayerPlaystyleScores | null
  /** Moyenne des membres actifs mesurés du clan. */
  clan: PlayerPlaystyleScores | null
}

export interface PlayerDashboardResponse {
  period: DashboardPeriod
  member: {
    id: number
    displayName: string
    pubgPlayerName: string
    avatarUrl: string | null
    /** Ajout du joueur au site (« suivi depuis »), pas son entrée dans le clan PUBG. */
    createdAt: string
    lastMatchAt: string | null
    clan: { id: number; name: string; tag: string } | null
  }
  stats: {
    totalKills: number
    totalDamage: number
    totalAssists: number
    totalRevives: number
    matchesPlayed: number
    matchesWon: number
    /** Fraction (0–1). */
    winRate: number
  } | null
  clanAverage: ClanAverage | null
  activity: {
    unit: 'day' | 'week'
    buckets: Array<{ key: string; label: string; kills: number; damage: number; matches: number; wins: number }>
  }
  bestMatch: {
    mapName: string
    mapLabel: string
    gameMode: string
    kills: number
    damage: number
    placement: number
    createdAt: string
    timeSurvived: number | null
    teammates: string[]
    debriefHref: string | null
  } | null
  playstyle: PlayerPlaystyle
  mates: Array<{
    memberId: number
    displayName: string
    avatarUrl: string | null
    matchCount: number
    /** Fraction (0–1). */
    winRate: number
    sharedPlayTimeSeconds: number
    role: 'fragger' | 'medic' | 'ghost' | null
  }>
}
