/** Mêmes périodes que le tableau de bord clan (`SquadPeriod`). */
export type CityInsightsPeriod = 'week' | 'month' | 'month-1' | 'month-2' | 'all'

/** Familles d'événements proposées au basculement sur les tableaux de bord. */
export type CityMetricKey = 'presence' | 'kill' | 'damage' | 'revive'

export type CityEntry = {
  locationId: string
  name: string
  mapName: string
  mapLabel: string
  events: number
  /** Part de la métrique courante parmi les événements rattachés à une ville. */
  share: number
  byMetric: Record<CityMetricKey, number>
  /** Part du clan sur cette ville, quand l'échantillon des deux côtés est suffisant (vue membre). */
  clanShare: number | null
}

export type CityTimelinePoint = {
  period: string
  label: string
  startDate: string
  presence: number
  kill: number
  damage: number
  revive: number
}

export type CityInsights = {
  period: CityInsightsPeriod
  /** Événements rattachés à une ville, par métrique. */
  cityTotals: Record<CityMetricKey, number>
  /** Tous les événements de la métrique, villes ou pas. */
  metricTotals: Record<CityMetricKey, number>
  matchCount: number
  top: Record<CityMetricKey, CityEntry[]>
  favoriteCity: CityEntry | null
  favoriteCombatCity: CityEntry | null
  timeline: CityTimelinePoint[]
  /** Date du plus ancien match couvert : les positions antérieures ont été purgées. */
  dataStart: string | null
  mainMapName: string | null
  mainMapLabel: string | null
}
