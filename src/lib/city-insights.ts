/**
 * Indicateurs de villes pour les tableaux de bord clan et membre, lus dans `PositionMetricCell`.
 *
 * Une cellule occupe une case de la grille 40 × 40 de la carte ; son centre est rattaché à la ville configurée
 * (`MapLocation`, cercle en pourcentage) qui le contient, la plus proche en cas de chevauchement — même règle que
 * le Top 5 de la page Positions. Les cellules hors de tout cercle restent comptées dans `metricTotals`, jamais
 * dans une ville.
 *
 * Fenêtre réelle : les positions brutes des matchs de plus de ~3 semaines ont été purgées, donc `dataStart` dit
 * depuis quand les données existent au lieu de laisser croire à un historique complet.
 */
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { MapLocation, MapLocations } from '@/lib/map-location-service'
import type {
  CityEntry,
  CityInsights,
  CityInsightsPeriod,
  CityMetricKey,
  CityTimelinePoint,
} from '@/types/city-insights'

export const CITY_GRID_SIZE = 40

/** Métriques `PositionMetricCell` derrière chaque famille proposée à l'écran. */
export const CITY_METRIC_SOURCES: Record<CityMetricKey, string[]> = {
  presence: ['position'],
  kill: ['kill'],
  damage: ['damage_dealt'],
  revive: ['revive_given'],
}

/** Ce qui définit une « zone de combat » : éliminations, dégâts infligés et mises à terre. */
const COMBAT_METRICS: CityMetricKey[] = ['kill', 'damage']

const METRIC_KEYS = Object.keys(CITY_METRIC_SOURCES) as CityMetricKey[]

const metricKeyBySource = new Map<string, CityMetricKey>(
  METRIC_KEYS.flatMap((key) => CITY_METRIC_SOURCES[key].map((source) => [source, key] as const))
)

/** Échantillons minimaux avant d'afficher une comparaison membre / clan (sinon une seule soirée ferait la moyenne). */
export const MEMBER_COMPARISON_MIN_EVENTS = 25
export const CLAN_COMPARISON_MIN_EVENTS = 100

export type CityMetricCellRow = {
  mapName: string
  metric: string
  xIndex: number
  yIndex: number
  events: number
  weekStart?: Date | null
}

function emptyTotals(): Record<CityMetricKey, number> {
  return { presence: 0, kill: 0, damage: 0, revive: 0 }
}

/** Centre de la cellule, en pourcentage de la carte — même repère que `MapLocation`. */
export function cellCenterPercent(xIndex: number, yIndex: number, gridSize = CITY_GRID_SIZE) {
  return {
    x: ((xIndex + 0.5) / gridSize) * 100,
    y: ((yIndex + 0.5) / gridSize) * 100,
  }
}

/** Ville contenant ce point, la plus proche en cas de cercles superposés (règle du Top 5 de la page Positions). */
export function locationForPercent(xPct: number, yPct: number, locations: MapLocation[]) {
  let closest: MapLocation | null = null
  let closestRatio = Number.POSITIVE_INFINITY

  for (const location of locations) {
    const ratio = Math.hypot(xPct - location.xPct, yPct - location.yPct) / location.radiusPct
    if (ratio <= 1 && ratio < closestRatio) {
      closest = location
      closestRatio = ratio
    }
  }

  return closest
}

/** Grille pré-calculée carte par carte : 1 600 cases, évite un test de cercle par cellule lue. */
export function buildCityGrid(locations: MapLocations, gridSize = CITY_GRID_SIZE) {
  const grid = new Map<string, MapLocation>()

  for (const [mapName, mapLocations] of Object.entries(locations)) {
    const enabled = mapLocations.filter((location) => location.enabled)
    if (enabled.length === 0) continue

    for (let xIndex = 0; xIndex < gridSize; xIndex += 1) {
      for (let yIndex = 0; yIndex < gridSize; yIndex += 1) {
        const center = cellCenterPercent(xIndex, yIndex, gridSize)
        const location = locationForPercent(center.x, center.y, enabled)
        if (location) grid.set(`${mapName}|${xIndex}|${yIndex}`, location)
      }
    }
  }

  return grid
}

type AggregateInput = {
  rows: CityMetricCellRow[]
  grid: Map<string, MapLocation>
  mapLabel?: (mapName: string) => string
}

export type CityAggregation = {
  cities: CityEntry[]
  cityTotals: Record<CityMetricKey, number>
  metricTotals: Record<CityMetricKey, number>
  mainMapName: string | null
}

export function aggregateCityCells({ rows, grid, mapLabel }: AggregateInput): CityAggregation {
  const cityTotals = emptyTotals()
  const metricTotals = emptyTotals()
  const eventsByMap = new Map<string, number>()
  const byCity = new Map<string, CityEntry>()

  for (const row of rows) {
    const metric = metricKeyBySource.get(row.metric)
    if (!metric) continue

    metricTotals[metric] += row.events
    eventsByMap.set(row.mapName, (eventsByMap.get(row.mapName) ?? 0) + row.events)

    const location = grid.get(`${row.mapName}|${row.xIndex}|${row.yIndex}`)
    if (!location) continue

    cityTotals[metric] += row.events
    const key = `${row.mapName}|${location.id}`
    const entry = byCity.get(key) ?? {
      locationId: location.id,
      name: location.name,
      mapName: row.mapName,
      mapLabel: mapLabel?.(row.mapName) ?? row.mapName,
      events: 0,
      share: 0,
      byMetric: emptyTotals(),
      clanShare: null,
    }
    entry.byMetric[metric] += row.events
    byCity.set(key, entry)
  }

  const mainMapName = [...eventsByMap.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null

  return { cities: [...byCity.values()], cityTotals, metricTotals, mainMapName }
}

/** Classement des villes pour une métrique, part calculée sur les seuls événements rattachés à une ville. */
export function rankCities(
  cities: CityEntry[],
  metric: CityMetricKey,
  cityTotals: Record<CityMetricKey, number>,
  limit = 5
): CityEntry[] {
  const total = cityTotals[metric]
  return cities
    .filter((city) => city.byMetric[metric] > 0)
    .sort((left, right) => right.byMetric[metric] - left.byMetric[metric])
    .slice(0, limit)
    .map((city) => ({
      ...city,
      events: city.byMetric[metric],
      share: total > 0 ? (city.byMetric[metric] / total) * 100 : 0,
    }))
}

/** Ville où le joueur ou le clan combat le plus : éliminations et dégâts infligés cumulés. */
export function pickFavoriteCombatCity(cities: CityEntry[]): CityEntry | null {
  const scored = cities
    .map((city) => ({
      city,
      score: COMBAT_METRICS.reduce((sum, metric) => sum + city.byMetric[metric], 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  const best = scored[0]
  return best ? { ...best.city, events: best.score, share: 0 } : null
}

function startOfIsoWeek(value: Date) {
  const start = new Date(value)
  const day = start.getUTCDay()
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1))
  start.setUTCHours(0, 0, 0, 0)
  return start
}

function isoWeekNumber(value: Date) {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

export function getCityTimelineStart(now = new Date(), weekCount = 8) {
  const start = startOfIsoWeek(now)
  start.setUTCDate(start.getUTCDate() - (Math.max(1, weekCount) - 1) * 7)
  return start
}

/**
 * Huit semaines glissantes, semaines vides conservées : une semaine sans match doit rester visible dans le
 * graphique, sinon la courbe donne l'illusion d'une activité continue.
 */
export function buildCityTimeline(
  rows: CityMetricCellRow[],
  grid: Map<string, MapLocation>,
  now = new Date(),
  weekCount = 8
): CityTimelinePoint[] {
  const count = Math.max(1, weekCount)
  const start = getCityTimelineStart(now, count)
  const buckets = new Map<string, CityTimelinePoint>()

  for (let index = 0; index < count; index += 1) {
    const bucketStart = new Date(start)
    bucketStart.setUTCDate(start.getUTCDate() + index * 7)
    buckets.set(bucketStart.toISOString().slice(0, 10), {
      period: bucketStart.toISOString().slice(0, 10),
      label: `S${isoWeekNumber(bucketStart)}`,
      startDate: bucketStart.toISOString(),
      presence: 0,
      kill: 0,
      damage: 0,
      revive: 0,
    })
  }

  for (const row of rows) {
    const metric = metricKeyBySource.get(row.metric)
    if (!metric || !row.weekStart) continue
    if (!grid.has(`${row.mapName}|${row.xIndex}|${row.yIndex}`)) continue

    const point = buckets.get(startOfIsoWeek(row.weekStart).toISOString().slice(0, 10))
    if (point) point[metric] += row.events
  }

  return [...buckets.values()]
}

export function getCityPeriodBounds(period: CityInsightsPeriod, now = new Date()) {
  if (period === 'all') return null
  if (period === 'month' || period === 'month-1' || period === 'month-2') {
    const offset = period === 'month' ? 0 : period === 'month-1' ? 1 : 2
    return {
      startDate: new Date(now.getFullYear(), now.getMonth() - offset, 1, 0, 0, 0, 0),
      endDate: new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999),
    }
  }

  const start = new Date(now)
  const day = start.getDay()
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1))
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { startDate: start, endDate: end }
}

type LoadInput = {
  clanId: number
  memberId?: number
  bounds: { startDate: Date; endDate: Date } | null
  squadMatchIds?: string[] | null
  matchType?: string[] | null
  withWeeks?: boolean
}

function loadFilters(input: LoadInput) {
  const filters = [Prisma.sql`c.clanId = ${input.clanId}`]
  if (input.memberId) filters.push(Prisma.sql`c.memberId = ${input.memberId}`)
  if (input.bounds) {
    filters.push(Prisma.sql`c.matchDate >= ${input.bounds.startDate} AND c.matchDate <= ${input.bounds.endDate}`)
  }
  if (input.squadMatchIds) {
    if (input.squadMatchIds.length === 0) return null
    filters.push(Prisma.sql`c.squadMatchId IN (${Prisma.join(input.squadMatchIds)})`)
  }
  if (input.matchType && input.matchType.length > 0) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM SquadMatch sm WHERE sm.id = c.squadMatchId AND sm.matchType IN (${Prisma.join(input.matchType)})
    )`)
  }
  const sources = METRIC_KEYS.flatMap((key) => CITY_METRIC_SOURCES[key])
  filters.push(Prisma.sql`c.metric IN (${Prisma.join(sources)})`)
  return Prisma.join(filters, ' AND ')
}

/**
 * Cellules agrégées sur la grille : au plus 1 600 cases × métriques × cartes (× semaines), la base rend donc
 * quelques milliers de lignes même sur « Tous les matchs ».
 */
export async function loadCityMetricCells(input: LoadInput): Promise<CityMetricCellRow[]> {
  const where = loadFilters(input)
  if (!where) return []

  const weekColumns = input.withWeeks
    ? Prisma.sql`, DATE(c.matchDate - INTERVAL WEEKDAY(c.matchDate) DAY) AS weekStart`
    : Prisma.empty
  const weekGroup = input.withWeeks ? Prisma.sql`, weekStart` : Prisma.empty

  return prisma.$queryRaw<CityMetricCellRow[]>(Prisma.sql`
    SELECT c.mapName, c.metric, c.xIndex, c.yIndex, SUM(c.eventCount) AS events ${weekColumns}
    FROM PositionMetricCell c
    WHERE ${where}
    GROUP BY c.mapName, c.metric, c.xIndex, c.yIndex ${weekGroup}
  `).then((rows) =>
    rows.map((row) => ({
      ...row,
      events: Number(row.events),
      weekStart: row.weekStart ? new Date(row.weekStart) : null,
    }))
  )
}

export async function loadCityMatchCoverage(input: LoadInput) {
  const where = loadFilters(input)
  if (!where) return { matchCount: 0, dataStart: null as Date | null }

  const [row] = await prisma.$queryRaw<Array<{ matchCount: bigint | number; dataStart: Date | null }>>(Prisma.sql`
    SELECT COUNT(DISTINCT c.squadMatchId) AS matchCount, MIN(c.matchDate) AS dataStart
    FROM PositionMetricCell c
    WHERE ${where}
  `)
  return { matchCount: Number(row?.matchCount ?? 0), dataStart: row?.dataStart ?? null }
}

export function buildCityInsights(input: {
  period: CityInsightsPeriod
  aggregation: CityAggregation
  timeline: CityTimelinePoint[]
  matchCount: number
  dataStart: Date | null
  mapLabel?: (mapName: string) => string
}): CityInsights {
  const { aggregation } = input
  const top = Object.fromEntries(
    METRIC_KEYS.map((metric) => [metric, rankCities(aggregation.cities, metric, aggregation.cityTotals)])
  ) as Record<CityMetricKey, CityEntry[]>

  return {
    period: input.period,
    cityTotals: aggregation.cityTotals,
    metricTotals: aggregation.metricTotals,
    matchCount: input.matchCount,
    top,
    favoriteCity: top.presence[0] ?? null,
    favoriteCombatCity: pickFavoriteCombatCity(aggregation.cities),
    timeline: input.timeline,
    dataStart: input.dataStart ? input.dataStart.toISOString() : null,
    mainMapName: aggregation.mainMapName,
    mainMapLabel: aggregation.mainMapName
      ? input.mapLabel?.(aggregation.mainMapName) ?? aggregation.mainMapName
      : null,
  }
}

/**
 * Ajoute à chaque ville du membre la part du clan sur la même ville, mais seulement quand les deux échantillons
 * sont suffisants : comparer 3 événements à la moyenne du clan n'apprend rien.
 */
export function withClanComparison(
  memberInsights: CityInsights,
  clanAggregation: CityAggregation
): CityInsights {
  const clanByCity = new Map(clanAggregation.cities.map((city) => [`${city.mapName}|${city.locationId}`, city]))

  const top = Object.fromEntries(
    METRIC_KEYS.map((metric) => [
      metric,
      memberInsights.top[metric].map((city) => {
        const clanCity = clanByCity.get(`${city.mapName}|${city.locationId}`)
        const clanTotal = clanAggregation.cityTotals[metric]
        const enoughMember = city.events >= MEMBER_COMPARISON_MIN_EVENTS
        const enoughClan = clanTotal >= CLAN_COMPARISON_MIN_EVENTS
        return {
          ...city,
          clanShare:
            enoughMember && enoughClan && clanCity ? (clanCity.byMetric[metric] / clanTotal) * 100 : null,
        }
      }),
    ])
  ) as Record<CityMetricKey, CityEntry[]>

  return { ...memberInsights, top, favoriteCity: top.presence[0] ?? memberInsights.favoriteCity }
}
