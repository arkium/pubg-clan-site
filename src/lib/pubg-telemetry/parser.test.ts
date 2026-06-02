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

  it('fails on malformed stream payload (missing array closure)', async () => {
    const stream = createTelemetryStreamFromChunks([
      '[{"_T":"LogPlayerKill","killerName":"A","victimName":"B"}',
    ])

    await expect(parseTelemetrySnapshotFromStream(stream, 1024)).rejects.toThrow(
      'Telemetry stream ended before closing JSON array'
    )
  })

  it('extracts member and weapon stats from nested PUBG event actors', () => {
    const result = parseTelemetrySnapshot([
      {
        _T: 'LogPlayerPosition',
        character: {
          accountId: 'player_attacker',
          name: 'AttackerName',
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
        damage: 37,
        damageTypeCategory: 'Damage_BlueZone',
        damageCauserName: 'WeapM416_C',
      },
      {
        _T: 'LogPlayerRevive',
        reviver: {
          accountId: 'player_support',
          name: 'SupportName',
        },
        victim: {
          accountId: 'player_victim',
          name: 'VictimName',
        },
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
          damageCauserName: 'WeapM416_C',
          damageReason: 'HeadShot',
        },
      },
    ])

    const attacker = result.memberStats.find((entry) => entry.memberKey === 'player_attacker')
    const victim = result.memberStats.find((entry) => entry.memberKey === 'player_victim')
    const support = result.memberStats.find((entry) => entry.memberKey === 'player_support')
    const weapon = result.weaponStats.find((entry) => entry.weaponName === 'WeapM416_C')

    expect(attacker).toBeDefined()
    expect(attacker?.positionEvents).toBe(1)
    expect(attacker?.damageDealt).toBe(37)
    expect(attacker?.kills).toBe(1)
    expect(attacker?.headshots).toBe(1)

    expect(victim).toBeDefined()
    expect(victim?.deaths).toBe(1)
    expect(victim?.blueZoneHits).toBe(1)

    expect(support).toBeDefined()
    expect(support?.revives).toBe(1)

    expect(weapon).toBeDefined()
    expect(weapon?.kills).toBe(1)
    expect(weapon?.headshots).toBe(1)
    expect(weapon?.damageDealt).toBe(37)
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
