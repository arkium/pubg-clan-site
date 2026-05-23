export type ReportType = 'weekly' | 'monthly'
export type ReportFilterType = ReportType | 'all'
export type ReportExportFormat = 'html' | 'json' | 'pdf'

export interface ReportProgressDelta {
  kills: number
  damage: number
  assists: number
  matches: number
  winRate: number
}

export interface ReportPlayerStats {
  memberId: number
  displayName: string
  avatarUrl?: string | null
  matches: number
  kills: number
  damage: number
  assists: number
  revives: number
  wins: number
  winRate: number
  avgKills: number
  avgDamage: number
  mvpScore: number
  progression: ReportProgressDelta
}

export interface ReportHighlightEntry {
  memberId: number | null
  displayName: string
  value: number
  subtitle: string
}

export interface ReportHighlightsData {
  topKiller: ReportHighlightEntry | null
  topDamage: ReportHighlightEntry | null
  bestWinRate: ReportHighlightEntry | null
  mvp: ReportHighlightEntry | null
}

export interface ReportSummary {
  id: string
  clanId: number
  clanName: string
  type: ReportType
  periodStart: string
  periodEnd: string
  totalMatches: number
  totalKills: number
  totalDamage: number
  avgTeamSize: number
  avgWinRate: number
  createdAt: string
  highlights: ReportHighlightsData
}

export interface ReportListResponse {
  reports: ReportSummary[]
  totalCount: number
}

export interface ReportTimelinePoint {
  label: string
  kills: number
  damage: number
}

export interface ReportPlayerComparisonPoint {
  memberId: number
  displayName: string
  kills: number
  damage: number
}

export interface ReportModeBreakdownPoint {
  label: string
  value: number
}

export interface ReportHeatmapCell {
  day: string
  hour: number
  count: number
}

export interface ReportChartsData {
  timeline: ReportTimelinePoint[]
  playerComparison: ReportPlayerComparisonPoint[]
  modeBreakdown: ReportModeBreakdownPoint[]
  activityHeatmap: ReportHeatmapCell[]
}

export interface ReportProgressionData {
  comparisonLabel: string
  aggregateDelta: ReportProgressDelta & {
    totalMatches: number
  }
  players: ReportPlayerStats[]
}

export interface ReportSectionItem {
  id: string
  sectionType: string
  title: string
  content: unknown
}

export interface ReportDetailResponse {
  report: ReportSummary & {
    playerStats: ReportPlayerStats[]
  }
  sections: ReportSectionItem[]
  insights: string[]
}
