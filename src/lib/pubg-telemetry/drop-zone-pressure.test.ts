import { describe, expect, it } from 'vitest'

import {
  countNearbyPlayers,
  countNearbyPlayersBreakdown,
  dropPressureLevel,
  DROP_PRESSURE_RADIUS_UNITS,
  summarizeDropPressure,
} from '@/lib/drop-zone-pressure'
import { buildDropPressureStatRows } from '@/lib/drop-pressure-persistence'
import { sortDropPressureRanking } from '@/lib/drop-pressure-ranking'

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

  it('separates nearby opponents from teammates when team ids are complete', () => {
    expect(
      countNearbyPlayersBreakdown(
        [
          { memberKey: 'target', teamId: 1, x: 0, y: 0 },
          { memberKey: 'teammate', teamId: 1, x: 100, y: 100 },
          { memberKey: 'opponent', teamId: 2, x: 200, y: 200 },
        ],
        'target',
        0,
        0
      )
    ).toEqual({ nearbyPlayerCount: 2, nearbyOpponentCount: 1 })
  })

  it('builds one persistent row per matched clan member', () => {
    const matchDate = new Date('2026-08-01T12:00:00.000Z')
    expect(
      buildDropPressureStatRows(
        {
          id: 'match-1',
          mapName: 'Baltic_Main',
          createdAt: matchDate,
          members: [
            {
              memberId: 42,
              member: { pubgAccountId: 'account-42', pubgPlayerName: 'Kraken' },
            },
          ],
        },
        [
          { memberKey: 'ACCOUNT-42', teamId: 1, x: 1000, y: 1000 },
          { memberKey: 'opponent', teamId: 2, x: 1100, y: 1100 },
        ]
      )
    ).toEqual([
      {
        squadMatchId: 'match-1',
        memberId: 42,
        mapName: 'Baltic_Main',
        x: 1000,
        y: 1000,
        matchDate,
        nearbyPlayerCount250m: 1,
        nearbyOpponentCount250m: 1,
        pressureLevel: 'calm',
      },
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

  it('sorts pressure rankings by the selected metric with stable ties', () => {
    const entries = [
      {
        memberId: 1,
        displayName: 'Bravo',
        avatarUrl: null,
        dropCount: 12,
        averageNearbyPlayers250m: 8,
        averageNearbyOpponents250m: 5,
        maximumNearbyPlayers250m: 14,
        hotDropShare: 50,
      },
      {
        memberId: 2,
        displayName: 'Alpha',
        avatarUrl: null,
        dropCount: 18,
        averageNearbyPlayers250m: 7,
        averageNearbyOpponents250m: 5,
        maximumNearbyPlayers250m: 12,
        hotDropShare: 40,
      },
      {
        memberId: 3,
        displayName: 'Charlie',
        avatarUrl: null,
        dropCount: 9,
        averageNearbyPlayers250m: 10,
        averageNearbyOpponents250m: null,
        maximumNearbyPlayers250m: 20,
        hotDropShare: 70,
      },
    ]

    expect(
      sortDropPressureRanking(entries, 'averageNearbyOpponents250m').map((entry) => entry.memberId)
    ).toEqual([2, 1, 3])
    expect(
      sortDropPressureRanking(entries, 'hotDropShare', 'asc').map((entry) => entry.memberId)
    ).toEqual([2, 1, 3])
  })
})