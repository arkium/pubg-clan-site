import { describe, expect, it } from 'vitest'

import {
  buildSafeZonePhaseStatRows,
  safeZoneOverlayFromTotals,
  sumSafeZoneRows,
} from './safe-zone-phase-stats'

// Erangel : 819 200 unités de côté.
const match = { id: 'sm-1', mapName: 'Baltic_Main', createdAt: new Date('2026-09-01T20:00:00Z') }

describe('buildSafeZonePhaseStatRows', () => {
  it('regroupe les snapshots par phase entière et somme en pourcentage de la carte', () => {
    const rows = buildSafeZonePhaseStatRows(match, [
      { isGame: 1.5, safetyZoneX: 409_600, safetyZoneY: 204_800, safetyZoneRadiusMeters: 81_920 },
      { isGame: 1.9, safetyZoneX: 204_800, safetyZoneY: 204_800, safetyZoneRadiusMeters: 40_960 },
      { isGame: 5, safetyZoneX: 900_000, safetyZoneY: -10, safetyZoneRadiusMeters: 8_192 },
      { isGame: 3, safetyZoneX: 1, safetyZoneY: 1, safetyZoneRadiusMeters: 0 }, // rayon nul : ignoré
      { isGame: 0.5, safetyZoneX: 1, safetyZoneY: 1, safetyZoneRadiusMeters: 10 }, // avant la phase 1 : ignoré
    ])

    expect(rows.map((row) => [row.phase, row.snapshotCount])).toEqual([[1, 2], [5, 1]])
    expect(rows[0]).toMatchObject({ sumXPercent: 75, sumYPercent: 50, sumRadiusPercent: 15 })
    // Coordonnées bornées à la carte, comme `toMapPercent`.
    expect(rows[1]).toMatchObject({ sumXPercent: 100, sumYPercent: 0, sumRadiusPercent: 1 })
  })

  it('écrit un marqueur phase 0 quand aucune zone n’est exploitable', () => {
    expect(buildSafeZonePhaseStatRows(match, 'pas du json')).toEqual([
      expect.objectContaining({ phase: 0, snapshotCount: 0, sumXPercent: 0 }),
    ])
  })
})

describe('moyenne du cercle', () => {
  it('reproduit la moyenne snapshot par snapshot en additionnant persisté et relu', () => {
    const rows = buildSafeZonePhaseStatRows(match, [
      { isGame: 5, safetyZoneX: 409_600, safetyZoneY: 409_600, safetyZoneRadiusMeters: 81_920 },
      { isGame: 6, safetyZoneX: 204_800, safetyZoneY: 204_800, safetyZoneRadiusMeters: 40_960 },
      { isGame: 1, safetyZoneX: 0, safetyZoneY: 0, safetyZoneRadiusMeters: 409_600 },
    ])
    const late = [5, 6, 7, 8]
    const persisted = sumSafeZoneRows(rows.filter((row) => row.phase === 5), late)
    const reread = sumSafeZoneRows(rows.filter((row) => row.phase !== 5), late)

    expect(safeZoneOverlayFromTotals(persisted, reread)).toEqual({ x: 37.5, y: 37.5, r: 7.5 })
    expect(safeZoneOverlayFromTotals(sumSafeZoneRows([], late))).toBeNull()
  })
})
