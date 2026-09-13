import { describe, expect, it } from 'vitest'

import {
  addBodyZoneHit,
  mergeBodyZoneBreakdowns,
  resolveBodyZone,
  serializeBodyZones,
  summarizeBodyZones,
  totalLocalizedHits,
  type BodyZoneAccumulator,
} from './body-zones'

describe('summarizeBodyZones', () => {
  it('sépare les dégâts localisés des dégâts non localisés et calcule la part de tête', () => {
    const summary = summarizeBodyZones([
      { zone: 'head', damage: 120, hits: 3 },
      { zone: 'torso', damage: 180.5, hits: 6 },
      { zone: 'legs', damage: 40, hits: 3 },
      { zone: 'other', damage: 75, hits: 20 },
    ])

    expect(summary.localizedDamage).toBeCloseTo(340.5)
    expect(summary.localizedHits).toBe(12)
    expect(summary.unlocalizedDamage).toBe(75)
    expect(summary.headHitRate).toBe(25)
  })

  it('ne calcule aucune part de tête sans touche localisée', () => {
    expect(summarizeBodyZones([{ zone: 'other', damage: 30, hits: 4 }]).headHitRate).toBeNull()
    expect(summarizeBodyZones(undefined)).toEqual({
      localizedDamage: 0,
      localizedHits: 0,
      unlocalizedDamage: 0,
      headHitRate: null,
    })
  })
})

describe('resolveBodyZone', () => {
  it('mappe les cinq zones localisées de PUBG', () => {
    expect(resolveBodyZone('HeadShot')).toBe('head')
    expect(resolveBodyZone('TorsoShot')).toBe('torso')
    expect(resolveBodyZone('PelvisShot')).toBe('pelvis')
    expect(resolveBodyZone('ArmShot')).toBe('arms')
    expect(resolveBodyZone('LegShot')).toBe('legs')
  })

  it('renvoie other pour les dégâts non localisés au lieu d’inventer une zone', () => {
    expect(resolveBodyZone('NonSpecific')).toBe('other')
    expect(resolveBodyZone('None')).toBe('other')
    expect(resolveBodyZone('SimulateAIBeKilled')).toBe('other')
    expect(resolveBodyZone('')).toBe('other')
    expect(resolveBodyZone(undefined)).toBe('other')
  })
})

describe('addBodyZoneHit / serializeBodyZones', () => {
  it('cumule dégâts et touches par zone', () => {
    const accumulator: BodyZoneAccumulator = {}
    addBodyZoneHit(accumulator, 'head', 89.5)
    addBodyZoneHit(accumulator, 'head', 10.5)
    addBodyZoneHit(accumulator, 'legs', 23)

    expect(serializeBodyZones(accumulator)).toEqual([
      { zone: 'head', damage: 100, hits: 2 },
      { zone: 'legs', damage: 23, hits: 1 },
    ])
  })

  it('compte la touche même quand les dégâts sont nuls (tir bloqué par le gilet)', () => {
    const accumulator: BodyZoneAccumulator = {}
    addBodyZoneHit(accumulator, 'torso', 0)

    expect(serializeBodyZones(accumulator)).toEqual([{ zone: 'torso', damage: 0, hits: 1 }])
  })

  it('ignore une valeur de dégâts non finie sans perdre la touche', () => {
    const accumulator: BodyZoneAccumulator = {}
    addBodyZoneHit(accumulator, 'arms', Number.NaN)

    expect(serializeBodyZones(accumulator)).toEqual([{ zone: 'arms', damage: 0, hits: 1 }])
  })

  it('n’émet aucune ligne pour les zones jamais touchées', () => {
    expect(serializeBodyZones({})).toEqual([])
  })

  it('conserve l’ordre anatomique canonique', () => {
    const accumulator: BodyZoneAccumulator = {}
    addBodyZoneHit(accumulator, 'legs', 10)
    addBodyZoneHit(accumulator, 'head', 10)
    addBodyZoneHit(accumulator, 'other', 10)
    addBodyZoneHit(accumulator, 'torso', 10)

    expect(serializeBodyZones(accumulator).map((row) => row.zone)).toEqual([
      'head',
      'torso',
      'legs',
      'other',
    ])
  })
})

describe('mergeBodyZoneBreakdowns', () => {
  it('agrège plusieurs membres d’escouade', () => {
    const merged = mergeBodyZoneBreakdowns([
      [
        { zone: 'head', damage: 100, hits: 1 },
        { zone: 'torso', damage: 50, hits: 2 },
      ],
      [{ zone: 'torso', damage: 30, hits: 1 }],
    ])

    expect(merged).toEqual([
      { zone: 'head', damage: 100, hits: 1 },
      { zone: 'torso', damage: 80, hits: 3 },
    ])
  })

  it('tolère les entrées absentes des anciens snapshots', () => {
    expect(mergeBodyZoneBreakdowns([undefined, null, []])).toEqual([])
  })

  it('reclasse une zone inconnue en other plutôt que de la perdre', () => {
    const merged = mergeBodyZoneBreakdowns([
      [{ zone: 'neck' as never, damage: 12, hits: 1 }],
    ])

    expect(merged).toEqual([{ zone: 'other', damage: 12, hits: 1 }])
  })
})

describe('totalLocalizedHits', () => {
  it('exclut les touches non localisées du total silhouette', () => {
    expect(
      totalLocalizedHits([
        { zone: 'head', damage: 100, hits: 2 },
        { zone: 'other', damage: 40, hits: 5 },
      ])
    ).toBe(2)
  })

  it('renvoie 0 sur une ventilation absente', () => {
    expect(totalLocalizedHits(undefined)).toBe(0)
  })
})
