import { describe, expect, it } from 'vitest'

import {
  countNearbyPlayers,
  dropPressureLevel,
  DROP_PRESSURE_RADIUS_UNITS,
  summarizeDropPressure,
} from '@/lib/drop-zone-pressure'

describe('drop-zone pressure', () => {
  it('counts unique other players inside the 250 meter radius', () => {
    expect(
      countNearbyPlayers(
        [
          { memberKey: 'target', x: 0, y: 0 },
          { memberKey: 'inside', x: DROP_PRESSURE_RADIUS_UNITS, y: 0 },
          { memberKey: 'INSIDE', x: 100, y: 100 },
          { memberKey: 'outside', x: DROP_PRESSURE_RADIUS_UNITS + 1, y: 0 },
        ],
        'target',
        0,
        0
      )
    ).toBe(1)
  })

  it('classifies the provisional pressure thresholds', () => {
    expect([0, 2, 3, 7, 8, 15, 16].map(dropPressureLevel)).toEqual([
      'calm',
      'calm',
      'contested',
      'contested',
      'hot',
      'hot',
      'very_hot',
    ])
  })

  it('summarizes average, maximum and hot drop share', () => {
    expect(
      summarizeDropPressure([
        { nearbyPlayerCount250m: 2, pressureLevel: 'calm' },
        { nearbyPlayerCount250m: 10, pressureLevel: 'hot' },
      ])
    ).toEqual({ average: 6, maximum: 10, hotDropCount: 1, hotDropShare: 50 })
  })
})