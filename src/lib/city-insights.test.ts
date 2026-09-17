import { describe, expect, it } from 'vitest'

import {
  aggregateCityCells,
  buildCityGrid,
  buildCityTimeline,
  cellCenterPercent,
  getCityTimelineStart,
  pickFavoriteCombatCity,
  rankCities,
  withClanComparison,
  type CityMetricCellRow,
} from './city-insights'
import type { MapLocations } from '@/lib/map-location-service'
import type { CityInsights } from '@/types/city-insights'

const locations: MapLocations = {
  Baltic_Main: [
    { id: 'pochinki', name: 'Pochinki', mapName: 'Baltic_Main', xPct: 50, yPct: 50, radiusPct: 4, enabled: true },
    { id: 'school', name: 'École', mapName: 'Baltic_Main', xPct: 55, yPct: 50, radiusPct: 2, enabled: true },
    { id: 'ferme', name: 'Ferme', mapName: 'Baltic_Main', xPct: 10, yPct: 10, radiusPct: 3, enabled: false },
  ],
}

const grid = buildCityGrid(locations)

// La grille fait 40 × 40 : la case 19/19 est centrée sur 48,75 % (Pochinki), la case 21/19 sur 53,75 % (École).
const cell = (metric: string, xIndex: number, yIndex: number, events: number, weekStart?: Date): CityMetricCellRow => ({
  mapName: 'Baltic_Main',
  metric,
  xIndex,
  yIndex,
  events,
  weekStart: weekStart ?? null,
})

describe('aggregateCityCells', () => {
  it('rattache chaque cellule à sa ville et laisse le reste hors ville', () => {
    const aggregation = aggregateCityCells({
      rows: [
        cell('position', 19, 19, 100),
        cell('kill', 19, 19, 5),
        cell('kill', 21, 19, 3),
        cell('position', 0, 0, 40), // hors de tout cercle
        cell('rotation', 19, 19, 999), // métrique non exposée
      ],
      grid,
    })

    expect(aggregation.metricTotals).toMatchObject({ presence: 140, kill: 8 })
    expect(aggregation.cityTotals).toMatchObject({ presence: 100, kill: 8 })
    expect(aggregation.cities.map((city) => city.name).sort()).toEqual(['Pochinki', 'École'])
    expect(aggregation.mainMapName).toBe('Baltic_Main')
  })

  it('ignore les villes désactivées', () => {
    const aggregation = aggregateCityCells({ rows: [cell('position', 4, 4, 10)], grid })
    expect(aggregation.cityTotals.presence).toBe(0)
    expect(aggregation.metricTotals.presence).toBe(10)
  })
})

describe('rankCities et zone de combat', () => {
  const aggregation = aggregateCityCells({
    rows: [cell('position', 19, 19, 60), cell('position', 21, 19, 40), cell('kill', 21, 19, 4), cell('damage_dealt', 21, 19, 200)],
    grid,
  })

  it('classe par événements et calcule la part sur les villes', () => {
    const ranked = rankCities(aggregation.cities, 'presence', aggregation.cityTotals)
    expect(ranked.map((city) => [city.name, city.events, Math.round(city.share)])).toEqual([
      ['Pochinki', 60, 60],
      ['École', 40, 40],
    ])
  })

  it('retient la ville où les combats cumulent le plus d’événements', () => {
    expect(pickFavoriteCombatCity(aggregation.cities)?.name).toBe('École')
    expect(pickFavoriteCombatCity([])).toBeNull()
  })
})

describe('buildCityTimeline', () => {
  it('garde les semaines sans match', () => {
    const now = new Date('2026-09-17T12:00:00Z')
    const start = getCityTimelineStart(now)
    const timeline = buildCityTimeline([cell('position', 19, 19, 25, new Date(start))], grid, now)

    expect(timeline).toHaveLength(8)
    expect(timeline[0].presence).toBe(25)
    expect(timeline.slice(1).every((point) => point.presence === 0)).toBe(true)
    expect(cellCenterPercent(19, 19)).toEqual({ x: 48.75, y: 48.75 })
  })
})

describe('withClanComparison', () => {
  const clanAggregation = aggregateCityCells({ rows: [cell('position', 19, 19, 500), cell('position', 21, 19, 500)], grid })

  function memberInsights(events: number): CityInsights {
    const aggregation = aggregateCityCells({ rows: [cell('position', 19, 19, events)], grid })
    return {
      period: 'all',
      cityTotals: aggregation.cityTotals,
      metricTotals: aggregation.metricTotals,
      matchCount: 1,
      top: { presence: rankCities(aggregation.cities, 'presence', aggregation.cityTotals), kill: [], damage: [], revive: [] },
      favoriteCity: null,
      favoriteCombatCity: null,
      timeline: [],
      dataStart: null,
      mainMapName: 'Baltic_Main',
      mainMapLabel: 'Erangel',
    }
  }

  it('compare seulement au-delà du seuil d’échantillon', () => {
    expect(withClanComparison(memberInsights(120), clanAggregation).top.presence[0].clanShare).toBe(50)
    expect(withClanComparison(memberInsights(5), clanAggregation).top.presence[0].clanShare).toBeNull()
  })
})
