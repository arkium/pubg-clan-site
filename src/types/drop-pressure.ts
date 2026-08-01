export type DropPressurePeriod = 'week' | 'month' | 'all'

export type DropPressureDashboardStats = {
  dropCount: number
  matchCount: number
  averageNearbyPlayers250m: number
  averageNearbyOpponents250m: number | null
  maximumNearbyPlayers250m: number
  hotDropCount: number
  hotDropShare: number
  levelCounts: {
    calm: number
    contested: number
    hot: number
    veryHot: number
  }
}

export type DropPressureRankingSortKey =
  | 'dropCount'
  | 'averageNearbyPlayers250m'
  | 'averageNearbyOpponents250m'
  | 'maximumNearbyPlayers250m'
  | 'hotDropShare'

export type DropPressureRankingEntry = {
  memberId: number
  displayName: string
  avatarUrl: string | null
  dropCount: number
  averageNearbyPlayers250m: number
  averageNearbyOpponents250m: number | null
  maximumNearbyPlayers250m: number
  hotDropShare: number
}