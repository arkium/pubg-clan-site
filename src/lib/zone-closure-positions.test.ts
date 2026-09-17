import { describe, expect, it } from 'vitest'

import {
  buildZoneClosurePositionRows,
  detectZoneClosures,
  zoneBandForRatio,
} from './zone-closure-positions'

// Erangel : 819 200 unités de côté, centre à (409 600, 409 600).
const match = {
  id: 'sm-1',
  mapName: 'Baltic_Main',
  createdAt: new Date('2026-09-17T20:00:00Z'),
  members: [
    { memberId: 10, member: { clanId: 1, pubgAccountId: 'account.aaa', pubgPlayerName: 'Alpha' } },
    { memberId: 11, member: { clanId: 1, pubgAccountId: 'account.bbb', pubgPlayerName: 'Bravo' } },
  ],
}

// Suite réelle observée en production : x, puis x.5 pendant le rétrécissement, puis x+1 à la fermeture.
const phaseSnapshots = [
  { isGame: 1, timestampSeconds: 100, numAlivePlayers: 90, safetyZoneX: 409_600, safetyZoneY: 409_600, safetyZoneRadiusMeters: 582_000, poisonGasWarningRadiusMeters: 192_000 },
  { isGame: 1.5, timestampSeconds: 330, numAlivePlayers: 60, safetyZoneX: 409_600, safetyZoneY: 409_600, safetyZoneRadiusMeters: 567_000, poisonGasWarningRadiusMeters: 192_000 },
  { isGame: 2, timestampSeconds: 600, numAlivePlayers: 50, safetyZoneX: 400_000, safetyZoneY: 400_000, safetyZoneRadiusMeters: 100_000, poisonGasWarningRadiusMeters: 50_000 },
  { isGame: 2.5, timestampSeconds: 680, numAlivePlayers: 46, safetyZoneX: 400_000, safetyZoneY: 400_000, safetyZoneRadiusMeters: 98_000, poisonGasWarningRadiusMeters: 50_000 },
  { isGame: 3, timestampSeconds: 780, numAlivePlayers: 40, safetyZoneX: 390_000, safetyZoneY: 400_000, safetyZoneRadiusMeters: 50_000, poisonGasWarningRadiusMeters: 25_000 },
]

describe('detectZoneClosures', () => {
  it('retient les passages de x.5 à une phase entière, avec le nouveau cercle stable', () => {
    expect(detectZoneClosures(phaseSnapshots).map((closure) => [closure.phase, closure.timestampSeconds, closure.radius]))
      .toEqual([[2, 600, 100_000], [3, 780, 50_000]])
  })

  it('ignore la phase 1, les rayons nuls et le JSON illisible', () => {
    expect(detectZoneClosures([{ isGame: 1, timestampSeconds: 10, safetyZoneX: 1, safetyZoneY: 1, safetyZoneRadiusMeters: 5 }])).toEqual([])
    expect(detectZoneClosures([
      { isGame: 1.5, timestampSeconds: 10, safetyZoneX: 1, safetyZoneY: 1, safetyZoneRadiusMeters: 5 },
      { isGame: 2, timestampSeconds: 20, safetyZoneX: 1, safetyZoneY: 1, safetyZoneRadiusMeters: 0 },
    ])).toEqual([])
    expect(detectZoneClosures('pas du json')).toEqual([])
  })
})

describe('zoneBandForRatio', () => {
  it('sépare centre, bord intérieur et hors zone', () => {
    expect([0, 0.5, 0.51, 1, 1.2].map(zoneBandForRatio)).toEqual(['center', 'center', 'edge', 'edge', 'outside'])
  })
})

describe('buildZoneClosurePositionRows', () => {
  const positionSamples = [
    // Alpha : au centre à la fermeture 2, hors zone à la fermeture 3.
    { memberKey: 'account.aaa', phase: 1.5, timestampSeconds: 560, x: 400_000, y: 400_000, inVehicle: false },
    { memberKey: 'account.aaa', phase: 2.5, timestampSeconds: 770, x: 500_000, y: 400_000, inVehicle: false },
    // Bravo : présent à la fermeture 2 seulement (mort en phase 2).
    { memberKey: 'account.bbb', phase: 1.5, timestampSeconds: 590, x: 470_000, y: 400_000, inVehicle: false },
    { memberKey: 'account.bbb', phase: 2.5, timestampSeconds: 700, x: 460_000, y: 400_000, inVehicle: false },
    // Joueur hors clan : jamais retenu.
    { memberKey: 'account.zzz', phase: 1.5, timestampSeconds: 599, x: 400_000, y: 400_000, inVehicle: false },
  ]
  const deathSamples = [
    { memberKey: 'account.bbb', phase: 2, timestampSeconds: 1_789_000_000, x: 460_000, y: 400_000, inVehicle: false },
  ]

  const rows = buildZoneClosurePositionRows(match, { positionSamples, deathSamples, phaseSnapshots } as never)

  it('garde une position par membre et par fermeture, en excluant les morts', () => {
    expect(rows.map((row) => [row.phase, row.memberId, row.zoneBand])).toEqual([
      [2, 10, 'center'],
      [2, 11, 'edge'],
      [3, 10, 'outside'],
    ])
    expect(rows[0]).toMatchObject({ clanId: 1, squadMatchId: 'sm-1', survivorCount: 50, distanceRatio: 0 })
    expect(rows[1].distanceRatio).toBeCloseTo(0.7, 5)
  })

  it('ignore un échantillon trop ancien pour décrire la fermeture', () => {
    const stale = buildZoneClosurePositionRows(match, {
      positionSamples: [{ memberKey: 'account.aaa', phase: 1.5, timestampSeconds: 100, x: 400_000, y: 400_000, inVehicle: false }],
      deathSamples: [],
      phaseSnapshots,
    } as never)
    expect(stale).toEqual([])
  })
})
