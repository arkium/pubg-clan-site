import { describe, expect, it } from 'vitest'

import type { MapLocation } from './map-location-service'
import {
  buildMemberBreakdown,
  cellCenter,
  dotSize,
  eventTitle,
  forceReport,
  glowIntensity,
  kingOf,
  locationCounts,
  memberEventSummary,
  POSITION_EVENTS,
  positionEvent,
  type MemberMetricCell,
} from './positions-view'

const GRID = 40
const loc = (id: string, xPct: number, yPct: number, radiusPct: number, enabled = true): MapLocation => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  mapName: 'Baltic_Main',
  xPct,
  yPct,
  radiusPct,
  enabled,
})
// Pochinki couvre la cellule (18, 19) ; School la cellule (22, 16).
const LOCATIONS = [loc('pochinki', 46.25, 48.75, 3), loc('school', 56.25, 41.25, 2), loc('fermee', 10, 10, 5, false)]
const cell = (xIndex: number, yIndex: number, count: number) => ({ xIndex, yIndex, count })

describe('événements', () => {
  it('7 événements, les sens seulement quand l’événement en a', () => {
    expect(POSITION_EVENTS.map((event) => event.label)).toEqual(['Kills', 'KO', 'Dégâts', 'Tirs', 'Revives', 'Véhicules', 'Morts'])
    expect(eventTitle(positionEvent('ko'), 1)).toBe('KO reçus')
    expect(eventTitle(positionEvent('revive'), 0)).toBe('Revives donnés')
    expect(eventTitle(positionEvent('kill'), 0)).toBe('Kills')
    expect(positionEvent('damage').dots).toBe(false)
  })

  it('centre d’une cellule en % de la carte', () => {
    expect(cellCenter({ xIndex: 0, yIndex: 39 }, GRID)).toEqual({ xPct: 1.25, yPct: 98.75 })
  })
})

describe('villes', () => {
  it('répartition par ville et hors ville, villes désactivées ignorées', () => {
    const { cities, outside, total } = locationCounts([cell(18, 19, 5), cell(22, 16, 2), cell(3, 3, 4), cell(30, 30, 1)], LOCATIONS, GRID)
    expect(cities.map((city) => [city.location.id, city.count, Math.round(city.share)])).toEqual([
      ['pochinki', 5, 42],
      ['school', 2, 17],
    ])
    expect(outside).toBe(5)
    expect(total).toBe(12)
  })

  it('rapport de force : verdict selon kills par mort, villes les plus disputées d’abord', () => {
    const report = forceReport([cell(18, 19, 6), cell(22, 16, 1)], [cell(18, 19, 2), cell(22, 16, 3)], LOCATIONS, GRID)
    expect(report.map((row) => [row.location.id, row.kills, row.deaths, row.verdict])).toEqual([
      ['pochinki', 6, 2, 'win'],
      ['school', 1, 3, 'avoid'],
    ])
    expect(report[0].killShare).toBe(75)
  })
})

describe('rendu', () => {
  it('pastilles : racine du nombre ; halos : échelle logarithmique', () => {
    expect(dotSize(0, 10, false)).toBe(9)
    expect(dotSize(10, 10, false)).toBe(25)
    expect(dotSize(10, 10, true)).toBe(19)
    expect(glowIntensity(10, 10)).toBe(1)
    expect(glowIntensity(0, 10)).toBe(0)
    expect(glowIntensity(1, 0)).toBe(0)
  })
})

describe('répartition par joueur', () => {
  const cells: MemberMetricCell[] = [
    { memberKey: 'a', metric: 'kill', ...cell(18, 19, 4) },
    { memberKey: 'a', metric: 'death', ...cell(18, 19, 1) },
    { memberKey: 'a', metric: 'kill', ...cell(3, 3, 2) },
    { memberKey: 'b', metric: 'kill', ...cell(18, 19, 5) },
    { memberKey: 'b', metric: 'death', ...cell(22, 16, 5) },
  ]
  const breakdown = buildMemberBreakdown(cells, LOCATIONS, GRID, (key) => (key === 'a' ? 'Joueur Alpha' : 'Joueur Bravo'))

  it('totaux et villes par joueur, trié par nom', () => {
    expect(breakdown.map((member) => member.memberLabel)).toEqual(['Joueur Alpha', 'Joueur Bravo'])
    expect(breakdown[0]).toEqual({
      memberKey: 'a',
      memberLabel: 'Joueur Alpha',
      totals: { kill: 6, death: 1 },
      byLocation: { kill: { pochinki: 4 }, death: { pochinki: 1 } },
    })
  })

  it('roi du coin et carte « Qui … où »', () => {
    expect(kingOf(breakdown, 'kill', 'pochinki')).toEqual({ memberKey: 'b', name: 'Joueur Bravo', count: 5 })
    expect(kingOf(breakdown, 'revive_given', 'pochinki')).toBeNull()
    expect(memberEventSummary(breakdown[0], 'kill', LOCATIONS)).toEqual({ count: 6, topLocation: { name: 'Pochinki', count: 4 }, kd: 6 })
    expect(memberEventSummary(breakdown[1], 'kill', LOCATIONS).kd).toBe(1)
    expect(memberEventSummary(breakdown[1], 'shot', LOCATIONS)).toEqual({ count: 0, topLocation: null, kd: 1 })
  })
})
