import { describe, expect, it } from 'vitest'

import {
  jumpProfile,
  levelOfAverage,
  locationForPoint,
  mapsByJumps,
  memberColor,
  memberJumpSummaries,
  neighbourMap,
  pressureCountOf,
  pressureDistribution,
  spotBackgroundPosition,
  spotStats,
  type LandingPoint,
} from './drop-zones-view'
import type { MapLocation } from './map-location-service'

const location = (id: string, xPct: number, yPct: number, radiusPct = 5, enabled = true): MapLocation => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  mapName: 'Baltic_Main',
  xPct,
  yPct,
  radiusPct,
  enabled,
})

const LOCATIONS = [location('pochinki', 45, 49), location('school', 52, 42, 3), location('fermee', 80, 80, 5, false)]

let seq = 0
function point(overrides: Partial<LandingPoint> = {}): LandingPoint {
  seq += 1
  return {
    memberId: 1,
    memberName: 'Joueur Alpha',
    matchId: `m${seq}`,
    mapName: 'Baltic_Main',
    x: 0,
    y: 0,
    xPct: 45,
    yPct: 49,
    nearbyPlayerCount250m: 4,
    nearbyOpponentCount250m: 1,
    pressureLevel: 'calm',
    ...overrides,
  }
}

describe('villes et cartes', () => {
  it('ville d’un saut : la plus proche qui le contient, jamais une ville désactivée', () => {
    expect(locationForPoint({ xPct: 46, yPct: 50 }, LOCATIONS)?.id).toBe('pochinki')
    // Dans les deux périmètres : la plus proche relativement à son rayon l'emporte.
    expect(locationForPoint({ xPct: 51, yPct: 43 }, LOCATIONS)?.id).toBe('school')
    expect(locationForPoint({ xPct: 10, yPct: 10 }, LOCATIONS)).toBeNull()
    expect(spotStats([point({ xPct: 80, yPct: 80 })], LOCATIONS)).toEqual([])
  })

  it('cartes triées par nombre de sauts, voisines en boucle', () => {
    const maps = mapsByJumps([point({ mapName: 'Desert_Main' }), point(), point(), point({ mapName: 'Savage_Main' })])
    expect(maps).toEqual(['Baltic_Main', 'Desert_Main', 'Savage_Main'])
    expect(neighbourMap(maps, 'Baltic_Main', 'prev')).toBe('Savage_Main')
    expect(neighbourMap(maps, 'Savage_Main', 'next')).toBe('Baltic_Main')
    expect(neighbourMap([], 'Baltic_Main', 'next')).toBeNull()
  })
})

describe('pression', () => {
  it('adversaires d’abord, tous les joueurs si les équipes sont inconnues', () => {
    expect(pressureCountOf(point({ nearbyOpponentCount250m: 2, nearbyPlayerCount250m: 6 }))).toBe(2)
    expect(pressureCountOf(point({ nearbyOpponentCount250m: null, nearbyPlayerCount250m: 6 }))).toBe(6)
  })

  it('répartition sur 4 niveaux et profil de saut', () => {
    const points = [
      point({ pressureLevel: 'calm', nearbyOpponentCount250m: 0 }),
      point({ pressureLevel: 'contested', nearbyOpponentCount250m: 4 }),
      point({ pressureLevel: 'hot', nearbyOpponentCount250m: 10 }),
      point({ pressureLevel: 'very_hot', nearbyOpponentCount250m: 18, matchId: 'm-same' }),
      point({ pressureLevel: 'very_hot', nearbyOpponentCount250m: 20, matchId: 'm-same', memberId: 2 }),
    ]
    expect(pressureDistribution(points).map((entry) => [entry.level, entry.share])).toEqual([
      ['calm', 20],
      ['contested', 20],
      ['hot', 20],
      ['very_hot', 40],
    ])
    expect(jumpProfile(points)).toMatchObject({ jumps: 5, matches: 4, average: 10.4, maximum: 20, hotDropShare: 60 })
    expect(pressureDistribution([]).every((entry) => entry.share === 0)).toBe(true)
  })

  it('niveau d’une moyenne arrondie', () => {
    expect([0, 2.4, 2.6, 7.4, 8, 15.4, 15.6].map(levelOfAverage)).toEqual(['calm', 'calm', 'contested', 'contested', 'hot', 'hot', 'very_hot'])
  })
})

describe('spots et joueurs', () => {
  const points = [
    point({ memberId: 1, memberName: 'Joueur Alpha', nearbyOpponentCount250m: 9, pressureLevel: 'hot' }),
    point({ memberId: 1, memberName: 'Joueur Alpha', nearbyOpponentCount250m: 9, pressureLevel: 'hot' }),
    point({ memberId: 2, memberName: 'Joueur Bravo', nearbyOpponentCount250m: 9, pressureLevel: 'hot' }),
    point({ memberId: 2, memberName: 'Joueur Bravo', xPct: 52, yPct: 42, nearbyOpponentCount250m: 1 }),
    point({ memberId: 3, memberName: 'Joueur Charlie', xPct: 10, yPct: 10, nearbyOpponentCount250m: 0 }),
  ]

  it('top des spots : fréquentation, part, pression moyenne, roi du spot', () => {
    const spots = spotStats(points, LOCATIONS)
    expect(spots.map((spot) => [spot.location.id, spot.count, spot.share])).toEqual([
      ['pochinki', 3, 60],
      ['school', 1, 20],
    ])
    expect(spots[0]).toMatchObject({ average: 9, averageLevel: 'hot', hotDropShare: 100, king: { memberId: 1, count: 2 } })
  })

  it('qui saute où : une ligne par joueur, spot préféré ou aucun', () => {
    const summaries = memberJumpSummaries(points, LOCATIONS)
    expect(summaries.map((entry) => [entry.name, entry.jumps, entry.favorite?.name ?? null])).toEqual([
      ['Joueur Alpha', 2, 'Pochinki'],
      ['Joueur Bravo', 2, 'Pochinki'],
      ['Joueur Charlie', 1, null],
    ])
    expect(summaries[1]).toMatchObject({ average: 5, level: 'contested' })
  })

  it('couleur stable par joueur et cadrage du gros plan', () => {
    expect(memberColor(3)).toBe(memberColor(13))
    expect(spotBackgroundPosition(50, 50)).toBe('50% 50%')
    expect(spotBackgroundPosition(0, 100)).toBe('0% 100%')
  })
})
