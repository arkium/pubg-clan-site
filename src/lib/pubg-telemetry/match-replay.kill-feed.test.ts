import { describe, expect, it } from 'vitest'

import {
  buildMatchReplayPayload,
  extractRespawnEvents,
  mergeKillFeedWithKillEvents,
  type ReplayIdentity,
  type ReplayKillEventInput,
} from './match-replay'

const MATCH_START_EPOCH = 1_789_400_000

const storedKill = (overrides: Partial<ReplayKillEventInput> = {}): ReplayKillEventInput => ({
  id: 'ke-1',
  killerAccountId: 'account.kouner',
  killerRawKey: 'account.kouner',
  victimAccountId: 'account.enemy1',
  victimRawKey: 'account.enemy1',
  weaponName: 'WeapBerylM762_C',
  distance: 1700,
  headshot: false,
  timestampSeconds: MATCH_START_EPOCH + 361.2,
  ...overrides,
})

describe('mergeKillFeedWithKillEvents', () => {
  // Match clan 18 cmu1k4in8auof0493sog1dm50 : le clan 1 (Pagiotte) n'a pas synchronisé le match,
  // ses frags n'existent que dans le kill-feed de la télémétrie.
  const feed = [
    { killerKey: 'account.kouner', victimKey: 'account.enemy1', weaponName: 'WeapBerylM762_C', distance: 1700, headshot: false, timestampSeconds: MATCH_START_EPOCH + 361.9 },
    { killerKey: 'account.pagiotte', victimKey: 'account.enemy2', weaponName: 'WeapAKM_C', distance: 4200, headshot: true, timestampSeconds: MATCH_START_EPOCH + 320 },
    { killerKey: null, victimKey: 'ai.1001', weaponName: 'BlueZone', distance: null, headshot: false, timestampSeconds: MATCH_START_EPOCH + 700 },
  ]

  it('ajoute les frags absents des KillEvent sans dupliquer ceux déjà enregistrés', () => {
    const merged = mergeKillFeedWithKillEvents([storedKill()], feed, MATCH_START_EPOCH)

    expect(merged).toHaveLength(3)
    expect(merged[0].id).toBe('ke-1')
    expect(merged.filter((kill) => kill.victimAccountId === 'account.enemy1')).toHaveLength(1)
    expect(merged[1]).toMatchObject({ id: 'feed-1', killerAccountId: 'account.pagiotte', headshot: true, distance: 4200 })
  })

  it('accepte le kill-feed stocké en chaîne JSON et ignore une colonne vide', () => {
    expect(mergeKillFeedWithKillEvents([], JSON.stringify(feed), MATCH_START_EPOCH)).toHaveLength(3)
    expect(mergeKillFeedWithKillEvents([storedKill()], null, MATCH_START_EPOCH)).toEqual([storedKill()])
  })
})

describe('extractRespawnEvents', () => {
  const vehicle = (key: string, action: string, seconds: number, x = 1000, y = 1000) => ({
    memberKey: key,
    action,
    vehicleType: 'TransportAircraft',
    timestampSeconds: MATCH_START_EPOCH + seconds,
    x,
    y,
  })

  it('ne remonte que les sauts postérieurs à une mort, pas le largage initial', () => {
    const respawns = extractRespawnEvents(
      [
        { memberKey: 'account.skiercross', timestampSeconds: MATCH_START_EPOCH + 392 },
        { memberKey: 'account.pagiotte', timestampSeconds: MATCH_START_EPOCH + 986 },
      ],
      [
        vehicle('account.skiercross', 'leave', 26),
        vehicle('account.pagiotte', 'leave', 26),
        vehicle('account.skiercross', 'ride', 511),
        vehicle('account.skiercross', 'leave', 521, 5000, 6000),
      ],
      MATCH_START_EPOCH
    )

    expect(respawns).toEqual([{ key: 'account.skiercross', t: 521, x: 5000, y: 6000 }])
  })
})

describe('buildMatchReplayPayload — kill-feed', () => {
  it('donne un tueur aux morts que KillEvent ne couvrait pas', () => {
    const payload = buildMatchReplayPayload({
      match: {
        squadMatchId: 'sm-1',
        pubgMatchId: 'pubg-1',
        mapName: 'Summerland_Main',
        mapAssetKey: 'Summerland_Main',
        mapLabel: 'Karakin',
        mapWidth: 204_800,
        mapHeight: 204_800,
        gameMode: 'Squad',
        placement: 2,
        createdAt: new Date(MATCH_START_EPOCH * 1000),
      },
      matchStartEpochSeconds: MATCH_START_EPOCH,
      currentClanId: 18,
      currentClanTag: 'BOFS',
      identities: new Map<string, ReplayIdentity>([
        ['account.pagiotte', { name: 'Pagiotte', clanTag: 'SMK', clanId: 1 }],
      ]),
      positionSamples: [
        { memberKey: 'account.pagiotte', teamId: 4, timestampSeconds: 300, x: 1, y: 1 },
        { memberKey: 'account.enemy2', teamId: 9, timestampSeconds: 300, x: 2, y: 2 },
      ],
      deathSamples: [{ memberKey: 'account.enemy2', timestampSeconds: MATCH_START_EPOCH + 320, x: 2, y: 2 }],
      landingSamples: [],
      knockoutSamples: [],
      reviveSamples: [],
      phaseSnapshots: [],
      vehicleSamples: [],
      killFeedSamples: [
        { killerKey: 'account.pagiotte', victimKey: 'account.enemy2', weaponName: 'WeapAKM_C', distance: 4200, headshot: true, timestampSeconds: MATCH_START_EPOCH + 320 },
      ],
      killEvents: [],
      flightPath: null,
    })

    const kills = payload.events.filter((event) => event.k === 'kill')
    const indexByKey = new Map(payload.players.map((player) => [player.key, player.i]))
    expect(kills).toHaveLength(1)
    expect(kills[0]).toMatchObject({ a: indexByKey.get('account.pagiotte'), v: indexByKey.get('account.enemy2'), hs: true })
  })
})
