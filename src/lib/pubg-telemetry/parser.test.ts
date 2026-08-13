import telemetrySample from '@/lib/pubg-telemetry/__fixtures__/telemetry-sample.json'
import telemetryGoldenStandard from '@/lib/pubg-telemetry/__fixtures__/telemetry-golden-standard.json'
import telemetryGoldenRotations from '@/lib/pubg-telemetry/__fixtures__/telemetry-golden-rotations.json'
import telemetryGoldenMixed from '@/lib/pubg-telemetry/__fixtures__/telemetry-golden-mixed.json'
import {
  parseTelemetrySnapshot,
  parseTelemetrySnapshotFromStream,
} from '@/lib/pubg-telemetry/parser'

function createTelemetryStreamFromChunks(chunks: string[]) {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

describe('parseTelemetrySnapshot', () => {
  it('computes stable summary counters from fixture events', () => {
    const result = parseTelemetrySnapshot(telemetrySample)

    expect(result.summary.totalEvents).toBe(10)
    expect(result.summary.killEvents).toBe(1)
    expect(result.summary.reviveEvents).toBe(1)
    expect(result.summary.damageEvents).toBe(1)
    expect(result.summary.knockoutEvents).toBe(1)
    expect(result.summary.itemUseEvents).toBe(1)
    expect(result.summary.vehicleEvents).toBe(2)
    expect(result.summary.positionEvents).toBe(1)
    expect(result.summary.phaseChangeEvents).toBe(1)
    expect(result.summary.blueZoneEvents).toBe(1)
    expect(result.summary.distinctEventTypes).toBe(10)
  })

  it('computes weapon aggregates deterministically', () => {
    const result = parseTelemetrySnapshot(telemetrySample)

    const ak = result.weaponStats.find((entry) => entry.weaponName === 'WeapAK47_C')

    expect(ak).toBeDefined()
    expect(ak?.kills).toBe(1)
    expect(ak?.headshots).toBe(1)
    expect(ak?.damageDealt).toBe(135)
  })

  it('counts shots fired and landed hits from weapon telemetry events', () => {
    const result = parseTelemetrySnapshot([
      {
        _T: 'LogWeaponFireCount',
        character: {
          accountId: 'player_attacker',
          name: 'AttackerName',
        },
        weaponId: 'WeapM416_C',
        fireCount: 1,
      },
      {
        _T: 'LogWeaponFireCount',
        character: {
          accountId: 'player_attacker',
          name: 'AttackerName',
        },
        weaponId: 'WeapM416_C',
        fireCount: 3,
      },
      {
        _T: 'LogPlayerTakeDamage',
        attacker: {
          accountId: 'player_attacker',
          name: 'AttackerName',
        },
        victim: {
          accountId: 'player_victim',
          name: 'VictimName',
        },
        damage: 42,
        damageCauserName: 'WeapM416_C',
      },
    ])

    const weapon = result.weaponStats.find((entry) => entry.weaponName === 'WeapM416_C')
    const attackerWeapon = result.memberStats
      .find((entry) => entry.memberKey === 'player_attacker')
      ?.weapons.find((entry) => entry.weaponName === 'WeapM416_C')

    expect(weapon).toBeDefined()
    expect(weapon?.shotsFired).toBe(3)
    expect(weapon?.hitsLanded).toBe(1)

    expect(attackerWeapon).toBeDefined()
    expect(attackerWeapon?.shotsFired).toBe(3)
    expect(attackerWeapon?.hitsLanded).toBe(1)
  })

  it('normalizes Item_Weapon identifiers so shots and hits merge on one weapon row', () => {
    const result = parseTelemetrySnapshot([
      {
        _T: 'LogPlayerAttack',
        attackType: 'Weapon',
        fireWeaponStackCount: 10,
        attacker: {
          accountId: 'player_attacker',
          name: 'AttackerName',
        },
        weapon: {
          itemId: 'Item_Weapon_MP5K_C',
          category: 'Weapon',
          subCategory: 'Main',
        },
      },
      {
        _T: 'LogPlayerTakeDamage',
        attacker: {
          accountId: 'player_attacker',
          name: 'AttackerName',
        },
        victim: {
          accountId: 'player_victim',
          name: 'VictimName',
        },
        damage: 18,
        damageCauserName: 'WeapMP5K_C',
      },
      {
        _T: 'LogPlayerKillV2',
        killer: {
          accountId: 'player_attacker',
          name: 'AttackerName',
        },
        victim: {
          accountId: 'player_victim',
          name: 'VictimName',
        },
        killerDamageInfo: {
          damageCauserName: 'WeapMP5K_C',
        },
      },
    ])

    expect(result.weaponStats.find((entry) => entry.weaponName === 'Item_Weapon_MP5K_C')).toBeUndefined()

    const weapon = result.weaponStats.find((entry) => entry.weaponName === 'WeapMP5K_C')
    expect(weapon).toBeDefined()
    expect(weapon?.shotsFired).toBe(10)
    expect(weapon?.hitsLanded).toBe(1)
    expect(weapon?.kills).toBe(1)
  })

  it('rejects non-array payloads', () => {
    expect(() => parseTelemetrySnapshot({})).toThrow(
      'Telemetry payload must be an array of events'
    )
  })

  it('parses telemetry stream object-by-object and matches array parser output', async () => {
    const json = JSON.stringify(telemetrySample)
    const stream = createTelemetryStreamFromChunks([
      json.slice(0, 13),
      json.slice(13, 52),
      json.slice(52, 111),
      json.slice(111),
    ])

    const streamResult = await parseTelemetrySnapshotFromStream(stream, 1024 * 1024)
    const arrayResult = parseTelemetrySnapshot(telemetrySample)

    expect(streamResult.snapshot).toEqual(arrayResult)
    expect(streamResult.bytesRead).toBe(new TextEncoder().encode(json).byteLength)
  })

  it('fails when max bytes limit is exceeded in streaming parser', async () => {
    const json = JSON.stringify(telemetrySample)
    const stream = createTelemetryStreamFromChunks([json])

    await expect(parseTelemetrySnapshotFromStream(stream, 20)).rejects.toThrow(
      'Telemetry asset exceeded max size while streaming'
    )
  })

  it('accepts partial stream payload (missing array closure) and returns parsed events', async () => {
    const stream = createTelemetryStreamFromChunks([
      '[{"_T":"LogPlayerKill","killerName":"A","victimName":"B"}',
    ])

    const result = await parseTelemetrySnapshotFromStream(stream, 1024)
    expect(result).toBeDefined()
    expect(result.snapshot).toBeDefined()
  })

  it('extracts member and weapon stats from nested PUBG event actors', () => {
    const result = parseTelemetrySnapshot([
      {
        _T: 'LogGameStatePeriodically',
        gameState: {
          safetyZonePosition: { x: 0, y: 0 },
          safetyZoneRadius: 300,
        },
      },
      {
        _T: 'LogPlayerPosition',
        character: {
          accountId: 'player_attacker',
          name: 'AttackerName',
          teamId: 7,
          location: { x: 0, y: 0 },
        },
      },
      {
        _T: 'LogPlayerPosition',
        character: {
          accountId: 'player_attacker',
          name: 'AttackerName',
          teamId: 7,
          location: { x: 30, y: 0 },
          isInVehicle: false,
        },
      },
      {
        _T: 'LogPlayerPosition',
        character: {
          accountId: 'player_attacker',
          name: 'AttackerName',
          teamId: 7,
          location: { x: 100, y: 0 },
          isInVehicle: true,
        },
      },
      {
        _T: 'LogPhaseChange',
      },
      {
        _T: 'LogPlayerTakeDamage',
        attacker: {
          accountId: 'player_attacker',
          name: 'AttackerName',
          teamId: 7,
        },
        victim: {
          accountId: 'player_victim',
          name: 'VictimName',
          teamId: 11,
        },
        damage: 37,
        damageTypeCategory: 'Damage_BlueZone',
        damageCauserName: 'WeapM416_C',
      },
      {
        _T: 'LogPlayerRevive',
        reviver: {
          accountId: 'player_support',
          name: 'SupportName',
          teamId: 7,
        },
        victim: {
          accountId: 'player_victim',
          name: 'VictimName',
          teamId: 11,
        },
      },
      {
        _T: 'LogPlayerKillV2',
        killer: {
          accountId: 'player_attacker',
          name: 'AttackerName',
          teamId: 7,
        },
        victim: {
          accountId: 'player_victim',
          name: 'VictimName',
          teamId: 11,
        },
        distance: 124.5,
        killerDamageInfo: {
          damageCauserName: 'WeapM416_C',
          damageReason: 'HeadShot',
        },
      },
      {
        _T: 'LogMatchEnd',
        gameResultOnFinished: {
          results: [
            {
              teamId: 7,
              rank: 2,
            },
            {
              teamId: 11,
              rank: 5,
            },
          ],
        },
      },
    ])

    const attacker = result.memberStats.find((entry) => entry.memberKey === 'player_attacker')
    const victim = result.memberStats.find((entry) => entry.memberKey === 'player_victim')
    const support = result.memberStats.find((entry) => entry.memberKey === 'player_support')
    const weapon = result.weaponStats.find((entry) => entry.weaponName === 'WeapM416_C')

    expect(attacker).toBeDefined()
    expect(attacker?.positionEvents).toBe(3)
    expect(attacker?.firstKillPhase).toBe(2)
    expect(attacker?.damageDealt).toBe(37)
    expect(attacker?.onFootDistanceMeters).toBe(30)
    expect(attacker?.vehicleDistanceMeters).toBe(70)
    expect(attacker?.kills).toBe(1)
    expect(attacker?.headshots).toBe(1)
    expect(attacker?.teamId).toBe(7)
    expect(attacker?.teamPlacement).toBe(2)

    expect(victim).toBeDefined()
    expect(victim?.deaths).toBe(1)
    expect(victim?.damageTaken).toBe(37)
    expect(victim?.blueZoneHits).toBe(1)
    expect(victim?.teamId).toBe(11)
    expect(victim?.teamPlacement).toBe(5)

    expect(support).toBeDefined()
    expect(support?.revives).toBe(1)
    expect(support?.teamId).toBe(7)
    expect(support?.teamPlacement).toBe(2)

    expect(weapon).toBeDefined()
    expect(weapon?.kills).toBe(1)
    expect(weapon?.headshots).toBe(1)
    expect(weapon?.damageDealt).toBe(37)

    const attackerWeapon = attacker?.weapons.find((entry) => entry.weaponName === 'WeapM416_C')
    expect(attackerWeapon).toBeDefined()
    expect(attackerWeapon?.kills).toBe(1)
    expect(attackerWeapon?.headshots).toBe(1)
    expect(attackerWeapon?.damageDealt).toBe(37)
    expect(attackerWeapon?.killDistanceTotal).toBe(124.5)
    expect(attackerWeapon?.killDistanceCount).toBe(1)
    expect(attackerWeapon?.killDistanceMax).toBe(124.5)
  })

  it('accumulates circle delay seconds when player stays outside safe zone between position events', () => {
    const result = parseTelemetrySnapshot([
      {
        _T: 'LogGameStatePeriodically',
        elapsedTime: 0,
        gameState: {
          safetyZonePosition: { x: 0, y: 0 },
          safetyZoneRadius: 100,
        },
      },
      {
        _T: 'LogPlayerPosition',
        elapsedTime: 10,
        character: {
          accountId: 'player_circle',
          location: { x: 50, y: 0 },
        },
      },
      {
        _T: 'LogPlayerPosition',
        elapsedTime: 20,
        character: {
          accountId: 'player_circle',
          location: { x: 150, y: 0 },
        },
      },
      {
        _T: 'LogPlayerPosition',
        elapsedTime: 35,
        character: {
          accountId: 'player_circle',
          location: { x: 170, y: 0 },
        },
      },
      {
        _T: 'LogPlayerPosition',
        elapsedTime: 40,
        character: {
          accountId: 'player_circle',
          location: { x: 80, y: 0 },
        },
      },
    ])

    const circlePlayer = result.memberStats.find((entry) => entry.memberKey === 'player_circle')

    expect(circlePlayer).toBeDefined()
    expect(circlePlayer?.positionEvents).toBe(4)
    expect(circlePlayer?.circleDelaySeconds).toBe(20)
    expect(circlePlayer?.circleDelayPercent).toBe(66.7)
  })

  it('supports LogGameStatePeriodic alias for zone snapshots', () => {
    const result = parseTelemetrySnapshot([
      {
        _T: 'LogGameStatePeriodic',
        elapsedTime: 0,
        gameState: {
          safetyZonePosition: { x: 0, y: 0 },
          safetyZoneRadius: 100,
        },
      },
      {
        _T: 'LogPlayerPosition',
        elapsedTime: 10,
        character: {
          accountId: 'player_circle_alias',
          location: { x: 50, y: 0 },
        },
      },
      {
        _T: 'LogPlayerPosition',
        elapsedTime: 20,
        character: {
          accountId: 'player_circle_alias',
          location: { x: 150, y: 0 },
        },
      },
      {
        _T: 'LogPlayerPosition',
        elapsedTime: 30,
        character: {
          accountId: 'player_circle_alias',
          location: { x: 170, y: 0 },
        },
      },
    ])

    const circlePlayer = result.memberStats.find((entry) => entry.memberKey === 'player_circle_alias')

    expect(result.summary.blueZoneEvents).toBe(1)
    expect(circlePlayer?.circleDelaySeconds).toBe(10)
    expect(circlePlayer?.circleDelayPercent).toBe(50)
  })

  it('exports position, trajectory and death samples for heatmaps', () => {
    const result = parseTelemetrySnapshot([
      {
        _T: 'LogPlayerPosition',
        elapsedTime: 5,
        character: {
          accountId: 'player_heatmap',
          teamId: 4,
          location: { x: 100, y: 200 },
          isInVehicle: false,
        },
      },
      {
        _T: 'LogPlayerPosition',
        elapsedTime: 18,
        character: {
          accountId: 'player_heatmap',
          teamId: 4,
          location: { x: 130, y: 260 },
          isInVehicle: true,
        },
      },
      {
        _T: 'LogPlayerKillV2',
        killer: {
          accountId: 'player_heatmap',
          teamId: 4,
        },
        victim: {
          accountId: 'victim_heatmap',
          teamId: 8,
          location: { x: 500, y: 600 },
        },
      },
    ])

    expect(result.positionSamples).toHaveLength(2)
    expect(result.positionSamples[0]).toMatchObject({
      memberKey: 'player_heatmap',
      teamId: 4,
      phase: 1,
      timestampSeconds: 5,
      x: 100,
      y: 200,
      inVehicle: false,
    })
    expect(result.positionSamples[1]).toMatchObject({
      memberKey: 'player_heatmap',
      teamId: 4,
      phase: 1,
      timestampSeconds: 18,
      x: 130,
      y: 260,
      inVehicle: true,
    })
    expect(result.trajectorySegments).toHaveLength(1)
    expect(result.trajectorySegments[0]).toMatchObject({
      memberKey: 'player_heatmap',
      teamId: 4,
      phase: 1,
      timestampStart: 5,
      timestampEnd: 18,
      fromX: 100,
      fromY: 200,
      toX: 130,
      toY: 260,
    })
    expect(result.deathSamples).toHaveLength(1)
    expect(result.deathSamples[0]).toMatchObject({
      memberKey: 'victim_heatmap',
      teamId: 8,
      phase: 1,
      timestampSeconds: null,
      x: 500,
      y: 600,
      inVehicle: false,
    })
  })

  it('tracks recalls via LogPlayerUseRespawn and Bluechip transmitter usage', () => {
    const result = parseTelemetrySnapshot([
      {
        _T: 'LogPlayerUseRespawn',
        character: {
          accountId: 'player_recaller_1',
          name: 'Recaller1',
        },
      },
      {
        _T: 'LogItemUse',
        character: {
          accountId: 'player_recaller_2',
          name: 'Recaller2',
        },
        item: {
          itemId: 'Item_Use_BlueChipTransmitter_C',
        },
      },
    ])

    const recaller1 = result.memberStats.find((m) => m.memberKey === 'player_recaller_1')
    const recaller2 = result.memberStats.find((m) => m.memberKey === 'player_recaller_2')

    expect(recaller1?.recalls).toBe(1)
    expect(recaller2?.recalls).toBe(1)
  })
})

describe('parseTelemetrySnapshot golden integration set', () => {
  const scenarios = [
    {
      name: 'standard combat sample',
      fixture: telemetryGoldenStandard,
      expected: {
        summary: {
          totalEvents: 5,
          killEvents: 1,
          reviveEvents: 1,
          damageEvents: 1,
          knockoutEvents: 0,
          itemUseEvents: 0,
          vehicleEvents: 1,
          positionEvents: 1,
          phaseChangeEvents: 0,
          blueZoneEvents: 0,
          distinctEventTypes: 5,
        },
        topWeapon: {
          weaponName: 'WeapM416_C',
          kills: 1,
          headshots: 1,
          damageDealt: 120,
        },
        memberCount: 3,
      },
    },
    {
      name: 'rotations and phase transitions',
      fixture: telemetryGoldenRotations,
      expected: {
        summary: {
          totalEvents: 6,
          killEvents: 1,
          reviveEvents: 0,
          damageEvents: 0,
          knockoutEvents: 1,
          itemUseEvents: 1,
          vehicleEvents: 1,
          positionEvents: 0,
          phaseChangeEvents: 1,
          blueZoneEvents: 1,
          distinctEventTypes: 6,
        },
        topWeapon: {
          weaponName: 'WeapBerylM762_C',
          kills: 1,
          headshots: 0,
          damageDealt: 70,
        },
        memberCount: 2,
      },
    },
    {
      name: 'mixed payload with unknown object events',
      fixture: telemetryGoldenMixed,
      expected: {
        summary: {
          totalEvents: 4,
          killEvents: 1,
          reviveEvents: 0,
          damageEvents: 1,
          knockoutEvents: 0,
          itemUseEvents: 0,
          vehicleEvents: 0,
          positionEvents: 0,
          phaseChangeEvents: 0,
          blueZoneEvents: 0,
          distinctEventTypes: 4,
        },
        topWeapon: {
          weaponName: 'WeapMini14_C',
          kills: 1,
          headshots: 1,
          damageDealt: 100,
        },
        memberCount: 2,
      },
    },
  ]

  it.each(scenarios)('$name remains stable in array and streaming modes', async ({ fixture, expected }) => {
    const json = JSON.stringify(fixture)
    const stream = createTelemetryStreamFromChunks([
      json.slice(0, Math.max(1, Math.floor(json.length / 3))),
      json.slice(Math.max(1, Math.floor(json.length / 3)), Math.max(2, Math.floor((json.length * 2) / 3))),
      json.slice(Math.max(2, Math.floor((json.length * 2) / 3))),
    ])

    const arrayResult = parseTelemetrySnapshot(fixture)
    const streamResult = await parseTelemetrySnapshotFromStream(stream, 1024 * 1024)

    expect(streamResult.snapshot).toEqual(arrayResult)
    expect(arrayResult.summary).toMatchObject(expected.summary)
    expect(arrayResult.memberStats.length).toBe(expected.memberCount)
    expect(arrayResult.weaponStats[0]).toMatchObject(expected.topWeapon)
  })
})
