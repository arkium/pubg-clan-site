import { describe, expect, it } from 'vitest'

import { buildZoneReadingMatchRow, teamModeOfGameMode } from './zone-reading-match'

/**
 * Lecture de zone — ligne `ZoneReadingMatch` construite depuis la télémétrie (docs/features/lecture-de-zone.md) :
 * ligne de vol issue des sauts, cercles stables issus des fermetures de `phaseSnapshots`, zone finale = dernier cercle.
 */

const createdAt = new Date('2026-09-12T20:00:00Z')
const match = { id: 'sm-1', mapName: 'Baltic_Main', createdAt, gameMode: 'squad-fpp' }

const jump = (key: string, t: number, x: number) => ({
  memberKey: key,
  action: 'leave',
  vehicleType: 'TransportAircraft',
  timestampSeconds: t,
  x,
  y: 400000,
})

const vehicleSamples = [jump('a', 10, 100000), jump('b', 20, 200000), jump('c', 40, 400000)]

const phaseSnapshots = [
  { isGame: 1, timestampSeconds: 100, safetyZoneX: 409600, safetyZoneY: 409600, safetyZoneRadiusMeters: 600000 },
  { isGame: 1.5, timestampSeconds: 300, safetyZoneX: 409600, safetyZoneY: 409600, safetyZoneRadiusMeters: 400000 },
  { isGame: 2, timestampSeconds: 400, safetyZoneX: 380000, safetyZoneY: 420000, safetyZoneRadiusMeters: 192100 },
  { isGame: 2.5, timestampSeconds: 600, safetyZoneX: 380000, safetyZoneY: 420000, safetyZoneRadiusMeters: 150000 },
  { isGame: 3, timestampSeconds: 700, safetyZoneX: 390000, safetyZoneY: 430000, safetyZoneRadiusMeters: 105600 },
]

describe('teamModeOfGameMode', () => {
  it('garde le battle royale classique, FPP compris', () => {
    expect(teamModeOfGameMode('squad')).toBe('squad')
    expect(teamModeOfGameMode('duo-fpp')).toBe('duo')
    expect(teamModeOfGameMode('solo')).toBe('solo')
    expect(teamModeOfGameMode('normal-squad')).toBeNull()
    expect(teamModeOfGameMode('ibr')).toBeNull()
    expect(teamModeOfGameMode('tdm')).toBeNull()
  })
})

describe('buildZoneReadingMatchRow', () => {
  it('ligne de vol depuis les sauts, prolongée jusqu’aux bords ; cercles et zone finale en centimètres', () => {
    const row = buildZoneReadingMatchRow(match, { vehicleSamples, landingSamples: [], phaseSnapshots })
    expect(row).toMatchObject({
      squadMatchId: 'sm-1',
      mapName: 'Baltic_Main',
      matchDate: createdAt,
      teamMode: 'squad',
      flightSource: 'jumps',
      lineStartX: 0,
      lineStartY: 400000,
      lineEndX: 819200,
      lineEndY: 400000,
      circleCount: 2,
      finalX: 390000,
      finalY: 430000,
    })
    expect(row?.circles).toEqual([
      { x: 380000, y: 420000, r: 192100 },
      { x: 390000, y: 430000, r: 105600 },
    ])
  })

  it('rien pour un mode hors battle royale, le camp d’entraînement, ou sans axe ni cercle', () => {
    expect(buildZoneReadingMatchRow({ ...match, gameMode: 'tdm' }, { vehicleSamples, landingSamples: [], phaseSnapshots })).toBeNull()
    expect(buildZoneReadingMatchRow({ ...match, mapName: 'Range_Main' }, { vehicleSamples, landingSamples: [], phaseSnapshots })).toBeNull()
    expect(buildZoneReadingMatchRow(match, { vehicleSamples: [], landingSamples: [], phaseSnapshots })).toBeNull()
    expect(buildZoneReadingMatchRow(match, { vehicleSamples, landingSamples: [], phaseSnapshots: phaseSnapshots.slice(0, 2) })).toBeNull()
  })

  it('lit aussi les colonnes restées en JSON texte', () => {
    const row = buildZoneReadingMatchRow(match, {
      vehicleSamples: JSON.stringify(vehicleSamples),
      landingSamples: '[]',
      phaseSnapshots: JSON.stringify(phaseSnapshots),
    })
    expect(row?.circleCount).toBe(2)
  })
})
