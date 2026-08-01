import { describe, expect, it } from 'vitest'

import {
  buildPositionMetricCellRows,
  parseStoredPositionSnapshot,
} from '@/lib/position-metric-cells'
import type { ParsedTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'

function emptySnapshot(): ParsedTelemetrySnapshot {
  return {
    summary: {
      totalEvents: 0,
      killEvents: 0,
      reviveEvents: 0,
      damageEvents: 0,
      knockoutEvents: 0,
      itemUseEvents: 0,
      vehicleEvents: 0,
      positionEvents: 0,
      phaseChangeEvents: 0,
      blueZoneEvents: 0,
      distinctEventTypes: 0,
    },
    weaponStats: [],
    memberStats: [],
    positionSamples: [],
    trajectorySegments: [],
    deathSamples: [],
    landingSamples: [],
    phaseSnapshots: [],
    killSamples: [],
    shotSamples: [],
    damageSamples: [],
    knockoutSamples: [],
    reviveSamples: [],
    vehicleSamples: [],
  }
}

const match = {
  id: 'match-1',
  mapName: 'Baltic_Main',
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
  members: [{
    memberId: 42,
    member: { clanId: 1, pubgAccountId: 'account-42', pubgPlayerName: 'Kraken' },
  }],
}

describe('position metric cells', () => {
  it('resolves members, projects coordinates and aggregates identical cells', () => {
    const snapshot = emptySnapshot()
    snapshot.positionSamples = [
      { memberKey: 'ACCOUNT-42', phase: 1, timestampSeconds: 1, x: 1000, y: 1000, inVehicle: false },
      { memberKey: 'kraken', phase: 1, timestampSeconds: 2, x: 1100, y: 1100, inVehicle: false },
      { memberKey: 'outsider', phase: 1, timestampSeconds: 3, x: 1000, y: 1000, inVehicle: false },
    ]

    expect(buildPositionMetricCellRows(match, snapshot)).toEqual([{
      squadMatchId: 'match-1',
      clanId: 1,
      memberId: 42,
      mapName: 'Baltic_Main',
      phase: 1,
      metric: 'position',
      xIndex: 0,
      yIndex: 0,
      eventCount: 2,
      matchDate: match.createdAt,
    }])
  })

  it('uses trajectory midpoints and separates role metrics', () => {
    const snapshot = emptySnapshot()
    snapshot.trajectorySegments = [{
      memberKey: 'kraken',
      phase: 2,
      timestampStart: 1,
      timestampEnd: 2,
      fromX: 0,
      fromY: 0,
      toX: 819200,
      toY: 819200,
    }]
    snapshot.knockoutSamples = [
      { memberKey: 'kraken', role: 'knocker', phase: 2, timestampSeconds: 1, x: 1000, y: 1000 },
      { memberKey: 'kraken', role: 'victim', phase: 2, timestampSeconds: 2, x: 1000, y: 1000 },
    ]
    snapshot.reviveSamples = [
      { memberKey: 'kraken', role: 'reviver', phase: 2, timestampSeconds: 3, x: 1000, y: 1000 },
      { memberKey: 'kraken', role: 'revived', phase: 2, timestampSeconds: 4, x: 1000, y: 1000 },
    ]

    const rows = buildPositionMetricCellRows(match, snapshot)
    expect(rows.find((row) => row.metric === 'rotation')).toMatchObject({ xIndex: 20, yIndex: 20 })
    expect(rows.map((row) => row.metric)).toEqual([
      'knockout_dealt',
      'knockout_taken',
      'revive_given',
      'revive_received',
      'rotation',
    ])
  })

  it('covers every metric and preserves shot and damage weights', () => {
    const snapshot = emptySnapshot()
    const point = { memberKey: 'kraken', phase: 3, x: 1000, y: 1000 }
    snapshot.positionSamples = [{ ...point, timestampSeconds: 1, inVehicle: false }]
    snapshot.trajectorySegments = [{ ...point, timestampStart: 1, timestampEnd: 2, fromX: 900, fromY: 900, toX: 1100, toY: 1100 }]
    snapshot.deathSamples = [{ ...point, timestampSeconds: 2, inVehicle: false }]
    snapshot.killSamples = [{ ...point, timestampSeconds: 3 }]
    snapshot.shotSamples = [{ ...point, weaponName: 'M416', count: 7 }]
    snapshot.damageSamples = [
      { ...point, role: 'attacker', weaponName: 'M416', count: 13 },
      { ...point, role: 'victim', weaponName: 'AKM', count: 5 },
    ]
    snapshot.knockoutSamples = [{ ...point, role: 'knocker', timestampSeconds: 4 }]
    snapshot.knockoutSamples.push({ ...point, role: 'victim', timestampSeconds: 5 })
    snapshot.reviveSamples = [
      { ...point, role: 'reviver', timestampSeconds: 6 },
      { ...point, role: 'revived', timestampSeconds: 7 },
    ]
    snapshot.vehicleSamples = [{ ...point, action: 'ride', vehicleType: 'Dacia', timestampSeconds: 8 }]

    const rows = buildPositionMetricCellRows(match, snapshot)
    expect(new Set(rows.map((row) => row.metric))).toEqual(new Set([
      'position', 'rotation', 'death', 'kill', 'shot', 'damage_dealt', 'damage_taken',
      'knockout_dealt', 'knockout_taken', 'revive_given', 'revive_received', 'vehicle',
    ]))
    expect(rows.find((row) => row.metric === 'shot')?.eventCount).toBe(7)
    expect(rows.find((row) => row.metric === 'damage_dealt')?.eventCount).toBe(13)
    expect(rows.find((row) => row.metric === 'damage_taken')?.eventCount).toBe(5)
  })

  it('accepts stored JSON arrays and serialized historical values', () => {
    const snapshot = parseStoredPositionSnapshot({
      positionSamples: JSON.stringify([
        { memberKey: 'kraken', phase: 1, timestampSeconds: 1, x: 1000, y: 1000, inVehicle: false },
      ]),
      trajectorySegments: [],
      deathSamples: null,
      killSamples: [],
      shotSamples: 'invalid-json',
      damageSamples: [],
      knockoutSamples: [],
      reviveSamples: [],
      vehicleSamples: [],
    })

    expect(snapshot.positionSamples).toHaveLength(1)
    expect(snapshot.deathSamples).toEqual([])
    expect(snapshot.shotSamples).toEqual([])
  })
})