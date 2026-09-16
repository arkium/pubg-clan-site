import { describe, expect, it } from 'vitest'

import {
  buildMatchReplayPayload,
  computeReplayLives,
  extractInitialJumps,
  isBotKey,
  normalizeReplayKey,
  toRelativeSeconds,
  type ReplayIdentity,
} from './match-replay'

const MATCH_START_EPOCH = 1_788_628_018

function baseMatch() {
  return {
    squadMatchId: 'sm-1',
    pubgMatchId: 'pubg-1',
    mapName: 'Savage_Main',
    mapAssetKey: 'Savage_Main',
    mapLabel: 'Sanhok',
    mapWidth: 409_600,
    mapHeight: 409_600,
    gameMode: 'Squad',
    placement: 2,
    createdAt: new Date(MATCH_START_EPOCH * 1000),
  }
}

function identities(entries: Array<[string, ReplayIdentity]>) {
  return new Map<string, ReplayIdentity>(entries)
}

function build(overrides: Partial<Parameters<typeof buildMatchReplayPayload>[0]> = {}) {
  return buildMatchReplayPayload({
    match: baseMatch(),
    matchStartEpochSeconds: MATCH_START_EPOCH,
    currentClanId: 1,
    currentClanTag: 'SMK',
    identities: identities([]),
    positionSamples: [],
    deathSamples: [],
    landingSamples: [],
    knockoutSamples: [],
    reviveSamples: [],
    phaseSnapshots: [],
    vehicleSamples: [],
    killEvents: [],
    flightPath: null,
    ...overrides,
  })
}

describe('toRelativeSeconds', () => {
  it('conserve une valeur déjà relative au début du match', () => {
    expect(toRelativeSeconds(120, MATCH_START_EPOCH)).toBe(120)
  })

  it('convertit un epoch absolu en seconde de match', () => {
    expect(toRelativeSeconds(MATCH_START_EPOCH + 54.6, MATCH_START_EPOCH)).toBe(55)
  })

  it('ne renvoie jamais de temps négatif', () => {
    expect(toRelativeSeconds(MATCH_START_EPOCH - 30, MATCH_START_EPOCH)).toBe(0)
  })

  it('rejette les valeurs non numériques', () => {
    expect(toRelativeSeconds('12', MATCH_START_EPOCH)).toBeNull()
    expect(toRelativeSeconds(Number.NaN, MATCH_START_EPOCH)).toBeNull()
  })
})

describe('normalizeReplayKey / isBotKey', () => {
  it('normalise la casse et les espaces', () => {
    expect(normalizeReplayKey('  Account.ABC ')).toBe('account.abc')
    expect(normalizeReplayKey('')).toBeNull()
    expect(normalizeReplayKey(42)).toBeNull()
  })

  it('identifie les bots', () => {
    expect(isBotKey('ai.12345')).toBe(true)
    expect(isBotKey('account.12345')).toBe(false)
  })
})

describe('buildMatchReplayPayload — pistes de joueurs', () => {
  const positionSamples = [
    { memberKey: 'account.b', teamId: 4, timestampSeconds: 30, x: 2000, y: 2000, inVehicle: true },
    { memberKey: 'account.a', teamId: 2, timestampSeconds: 20, x: 1500, y: 1500, inVehicle: false },
    { memberKey: 'account.a', teamId: 2, timestampSeconds: 10, x: 1000, y: 1000, inVehicle: false },
    { memberKey: 'account.a', teamId: 2, timestampSeconds: 10, x: 9999, y: 9999, inVehicle: false },
  ]

  it('aplatit les pistes triées par temps et déduplique les horodatages', () => {
    const payload = build({ positionSamples })
    const playerA = payload.players.find((player) => player.key === 'account.a')

    expect(playerA?.p).toEqual([10, 1000, 1000, 0, 20, 1500, 1500, 0])
  })

  it('marque le drapeau véhicule', () => {
    const payload = build({ positionSamples })
    const playerB = payload.players.find((player) => player.key === 'account.b')

    expect(playerB?.p).toEqual([30, 2000, 2000, 1])
  })

  it('expose la durée du match à partir du dernier échantillon', () => {
    expect(build({ positionSamples }).match.durationSeconds).toBe(30)
  })

  it('ignore un joueur sans aucun échantillon exploitable', () => {
    const payload = build({
      positionSamples: [{ memberKey: 'account.a', timestampSeconds: 10, x: null, y: 5 }],
    })

    expect(payload.players).toHaveLength(0)
  })

  it('ancre le joueur sur son atterrissage quand il précède la première position', () => {
    const payload = build({
      positionSamples: [
        { memberKey: 'account.a', timestampSeconds: 90, x: 5000, y: 5000, inVehicle: false },
      ],
      landingSamples: [
        { memberKey: 'account.a', timestampSeconds: MATCH_START_EPOCH + 54, x: 4000, y: 4000 },
      ],
    })

    const playerA = payload.players[0]
    expect(playerA.land).toBe(54)
    expect(playerA.p.slice(0, 4)).toEqual([54, 4000, 4000, 0])
  })
})

describe('buildMatchReplayPayload — affiliations et identités', () => {
  const positionSamples = [
    { memberKey: 'account.mine', teamId: 1, timestampSeconds: 5, x: 10, y: 10 },
    { memberKey: 'account.tracked', teamId: 2, timestampSeconds: 5, x: 20, y: 20 },
    { memberKey: 'account.other', teamId: 3, timestampSeconds: 5, x: 30, y: 30 },
    { memberKey: 'ai.bot', teamId: 4, timestampSeconds: 5, x: 40, y: 40 },
  ]

  const resolved = identities([
    ['account.mine', { name: 'Pagiotte', clanTag: 'SMK', clanId: 1 }],
    ['account.tracked', { name: 'Nova', clanTag: 'RAF', clanId: 7 }],
    ['account.other', { name: 'Randomo', clanTag: 'XYZ', clanId: null }],
  ])

  it('classe le clan consulté, les clans suivis et le lobby externe', () => {
    const payload = build({ positionSamples, identities: resolved })
    const byKey = new Map(payload.players.map((player) => [player.key, player]))

    expect(byKey.get('account.mine')?.aff).toBe(2)
    expect(byKey.get('account.tracked')?.aff).toBe(1)
    expect(byKey.get('account.other')?.aff).toBe(0)
  })

  it('force le tag du clan consulté et conserve celui des adversaires', () => {
    const payload = build({ positionSamples, identities: resolved })
    const byKey = new Map(payload.players.map((player) => [player.key, player]))

    expect(byKey.get('account.mine')?.t).toBe('SMK')
    expect(byKey.get('account.other')?.t).toBe('XYZ')
  })

  it('nomme les bots et tronque les comptes non résolus', () => {
    const payload = build({ positionSamples, identities: resolved })
    const byKey = new Map(payload.players.map((player) => [player.key, player]))

    expect(byKey.get('ai.bot')?.bot).toBe(true)
    expect(byKey.get('ai.bot')?.n).toBe('Bot')
  })

  it('liste les tags des autres clans suivis présents dans le lobby', () => {
    expect(build({ positionSamples, identities: resolved }).match.trackedClanTags).toEqual(['RAF'])
  })

  it('attribue des index stables, le clan consulté en tête', () => {
    const payload = build({ positionSamples, identities: resolved })

    expect(payload.players[0].key).toBe('account.mine')
    expect(payload.players.map((player) => player.i)).toEqual([0, 1, 2, 3])
  })
})

describe('extractInitialJumps', () => {
  function jump(key: string, seconds: number, x: number, y: number) {
    return {
      memberKey: key,
      action: 'leave',
      vehicleType: 'TransportAircraft',
      timestampSeconds: MATCH_START_EPOCH + seconds,
      x,
      y,
    }
  }

  it('retient le saut de chaque joueur avec sa position exacte', () => {
    const jumps = extractInitialJumps(
      [jump('account.a', 19, 274364, 97448), jump('account.b', 25, 300000, 120000)],
      MATCH_START_EPOCH
    )

    expect(jumps.get('account.a')).toEqual({ t: 19, x: 274364, y: 97448 })
    expect(jumps.get('account.b')).toEqual({ t: 25, x: 300000, y: 120000 })
  })

  it('écarte l’avion de rappel de fin de partie', () => {
    const jumps = extractInitialJumps(
      [jump('account.a', 19, 274364, 97448), jump('account.late', 900, 600000, 200000)],
      MATCH_START_EPOCH
    )

    expect(jumps.has('account.a')).toBe(true)
    expect(jumps.has('account.late')).toBe(false)
  })

  it('ignore les véhicules terrestres et les montées à bord', () => {
    const jumps = extractInitialJumps(
      [
        { ...jump('account.a', 19, 1, 1), vehicleType: 'WheeledVehicle' },
        { ...jump('account.b', 20, 2, 2), action: 'ride' },
      ],
      MATCH_START_EPOCH
    )

    expect(jumps.size).toBe(0)
  })

  it('conserve le premier saut quand un joueur en a plusieurs', () => {
    const jumps = extractInitialJumps(
      [jump('account.a', 30, 999, 999), jump('account.a', 19, 274364, 97448)],
      MATCH_START_EPOCH
    )

    expect(jumps.get('account.a')).toEqual({ t: 19, x: 274364, y: 97448 })
  })

  it('renvoie une table vide sans donnée exploitable', () => {
    expect(extractInitialJumps(null, MATCH_START_EPOCH).size).toBe(0)
    expect(extractInitialJumps([], MATCH_START_EPOCH).size).toBe(0)
  })
})

describe('buildMatchReplayPayload — ancrage sur le saut', () => {
  const vehicleSamples = [
    {
      memberKey: 'account.a',
      action: 'leave',
      vehicleType: 'TransportAircraft',
      timestampSeconds: MATCH_START_EPOCH + 20,
      x: 274364,
      y: 97448,
    },
  ]

  it('démarre la piste au saut et écarte les positions de spawn antérieures', () => {
    const payload = build({
      vehicleSamples,
      positionSamples: [
        // Position de spawn : à des kilomètres de l'avion, elle ferait traverser la carte.
        { memberKey: 'account.a', timestampSeconds: 0, x: 565965, y: 305667 },
        { memberKey: 'account.a', timestampSeconds: 30, x: 280000, y: 105000 },
      ],
    })

    const player = payload.players[0]
    expect(player.jump).toBe(20)
    expect(player.p).toEqual([20, 274364, 97448, 0, 30, 280000, 105000, 0])
  })

  it('conserve toutes les positions quand aucun saut n’est enregistré', () => {
    const payload = build({
      positionSamples: [
        { memberKey: 'account.a', timestampSeconds: 0, x: 565965, y: 305667 },
        { memberKey: 'account.a', timestampSeconds: 30, x: 280000, y: 105000 },
      ],
    })

    expect(payload.players[0].jump).toBeNull()
    expect(payload.players[0].p).toEqual([0, 565965, 305667, 0, 30, 280000, 105000, 0])
  })

  it('écarte les positions d’attente d’un joueur sans saut quand le lobby a sauté', () => {
    const payload = build({
      vehicleSamples,
      positionSamples: [
        { memberKey: 'account.a', timestampSeconds: 30, x: 280000, y: 105000 },
        // Saut non journalisé : l'île d'attente avant le largage, puis une vraie position sur la carte.
        { memberKey: 'account.b', timestampSeconds: 0, x: 565965, y: 305667 },
        { memberKey: 'account.b', timestampSeconds: 45, x: 290000, y: 110000 },
        // Déconnecté avant le largage : uniquement des positions d'attente.
        { memberKey: 'account.c', timestampSeconds: 5, x: 566000, y: 305700 },
      ],
    })

    const byKey = new Map(payload.players.map((player) => [player.key, player]))
    expect(byKey.get('account.b')?.p).toEqual([45, 290000, 110000, 0])
    expect(byKey.has('account.c')).toBe(false)
    expect(byKey.get('account.a')?.jump).toBe(20)
  })
})

describe('computeReplayLives', () => {
  const point = (t: number) => ({ t, x: 1, y: 1 })

  it('ouvre une seule vie jusqu’à la fin sans mort', () => {
    expect(computeReplayLives(27, [], []).lives).toEqual([[27, null]])
  })

  it('ferme définitivement la vie sur une mort sans rappel', () => {
    const result = computeReplayLives(27, [point(94)], [point(27)])
    expect(result.lives).toEqual([[27, 94]])
    expect(result.respawns).toEqual([])
  })

  it('rouvre une vie au saut de rappel postérieur à la mort', () => {
    // Match Karakin cmu027vpd3ftl04tzlejla0vk, Pagiotte : mort à 94 s, rappel sauté à 668 s, mort à 1 013 s.
    const result = computeReplayLives(27, [point(1013), point(94)], [point(27), point(668)])
    expect(result.lives).toEqual([
      [27, 94],
      [668, 1013],
    ])
    expect(result.respawns.map((respawn) => respawn.t)).toEqual([668])
    expect(result.endingDeaths.map((death) => death.t)).toEqual([94, 1013])
  })

  it('ignore une mort en double survenue avant le rappel', () => {
    const result = computeReplayLives(27, [point(94), point(95)], [point(668)])
    expect(result.lives).toEqual([
      [27, 94],
      [668, null],
    ])
  })
})

describe('buildMatchReplayPayload — rappel et coéquipiers', () => {
  const aircraft = (key: string, seconds: number, x: number, y: number) => ({
    memberKey: key,
    action: 'leave',
    vehicleType: 'TransportAircraft',
    timestampSeconds: MATCH_START_EPOCH + seconds,
    x,
    y,
  })

  const payload = build({
    identities: identities([
      ['account.pag', { name: 'Pagiotte', clanTag: 'SMK', clanId: 1 }],
      ['account.mate', { name: 'CdtMcKoy', clanTag: null, clanId: null }],
      ['account.enemy', { name: 'Randomo', clanTag: null, clanId: null }],
    ]),
    vehicleSamples: [
      aircraft('account.pag', 27, 85000, 125000),
      aircraft('account.pag', 668, 112645, 79235),
      aircraft('account.mate', 27, 85000, 125000),
    ],
    positionSamples: [
      { memberKey: 'account.pag', teamId: 1, timestampSeconds: 88, x: 95192, y: 74746 },
      // Cadavre immobile après la mort à 94 s, puis passage dans l'avion de rappel.
      { memberKey: 'account.pag', teamId: 1, timestampSeconds: 127, x: 95118, y: 74740 },
      { memberKey: 'account.pag', teamId: 1, timestampSeconds: 659, x: 120408, y: 77379, inVehicle: true },
      { memberKey: 'account.pag', teamId: 1, timestampSeconds: 678, x: 109381, y: 75885 },
      { memberKey: 'account.mate', teamId: 1, timestampSeconds: 60, x: 90000, y: 90000 },
      { memberKey: 'account.enemy', teamId: 9, timestampSeconds: 60, x: 10000, y: 10000 },
    ],
    deathSamples: [
      { memberKey: 'account.pag', teamId: 1, timestampSeconds: MATCH_START_EPOCH + 94, x: 95118, y: 74740 },
      { memberKey: 'account.mate', teamId: 1, timestampSeconds: MATCH_START_EPOCH + 461, x: 91000, y: 91000 },
    ],
  })
  const byKey = new Map(payload.players.map((player) => [player.key, player]))
  const pagiotte = byKey.get('account.pag')!

  it('découpe les vies et n’annonce aucune mort définitive après un rappel', () => {
    expect(pagiotte.l).toEqual([
      [27, 94],
      [668, null],
    ])
    expect(pagiotte.d).toBeNull()
  })

  it('écarte les positions du cadavre et de l’avion de rappel, et borne chaque vie', () => {
    const times = pagiotte.p.filter((_, index) => index % 4 === 0)
    expect(times).toEqual([27, 88, 94, 668, 678])
    // La vie reprend exactement au point de saut du rappel.
    expect(pagiotte.p.slice(12, 15)).toEqual([668, 112645, 79235])
  })

  it('rattache à l’escouade le coéquipier hors clan, pas le reste du lobby', () => {
    expect(byKey.get('account.pag')?.sq).toBe(true)
    expect(byKey.get('account.mate')?.sq).toBe(true)
    expect(byKey.get('account.mate')?.aff).toBe(0)
    expect(byKey.get('account.enemy')?.sq).toBe(false)
  })

  it('classe le coéquipier juste après les membres du clan', () => {
    expect(payload.players.map((player) => player.key)).toEqual([
      'account.pag',
      'account.mate',
      'account.enemy',
    ])
  })

  it('émet un rappel au saut et les morts absentes de KillEvent', () => {
    const recall = payload.events.find((event) => event.k === 'recall')
    expect(recall).toMatchObject({ t: 668, a: pagiotte.i, v: null, x: 112645, y: 79235 })

    const deaths = payload.events.filter((event) => event.k === 'kill' && event.a === null)
    expect(deaths.map((event) => [event.t, event.v])).toEqual([
      [94, pagiotte.i],
      [461, byKey.get('account.mate')!.i],
    ])
  })

  it('ne double pas une mort déjà couverte par un KillEvent', () => {
    const withKill = build({
      positionSamples: [{ memberKey: 'account.a', teamId: 1, timestampSeconds: 10, x: 1, y: 1 }],
      deathSamples: [{ memberKey: 'account.a', timestampSeconds: MATCH_START_EPOCH + 200, x: 1, y: 1 }],
      killEvents: [
        {
          id: 'k1',
          killerAccountId: null,
          killerRawKey: null,
          victimAccountId: 'account.a',
          victimRawKey: null,
          weaponName: 'WeapAK47_C',
          distance: null,
          headshot: false,
          timestampSeconds: MATCH_START_EPOCH + 201,
        },
      ],
    })

    expect(withKill.events.filter((event) => event.k === 'kill')).toHaveLength(1)
  })
})

describe('buildMatchReplayPayload — avions de rappel et caisses', () => {
  const aircraft = (key: string, action: 'ride' | 'leave', seconds: number, x: number, y: number) => ({
    memberKey: key,
    action,
    vehicleType: 'TransportAircraft',
    timestampSeconds: MATCH_START_EPOCH + seconds,
    x,
    y,
  })

  const base = {
    identities: identities([['account.a', { name: 'Pagiotte', clanTag: 'SMK', clanId: 1 }]]),
    positionSamples: [{ memberKey: 'account.a', teamId: 1, timestampSeconds: 40, x: 90000, y: 120000 }],
    vehicleSamples: [
      aircraft('account.a', 'leave', 27, 85223, 125098),
      aircraft('account.a', 'ride', 661.04, 149139, 70510),
      aircraft('account.a', 'leave', 668.08, 112645, 79235),
    ],
  }

  it('reconstitue le vol de rappel en ignorant le largage initial', () => {
    const payload = build({ ...base, match: { ...baseMatch(), mapName: 'Summerland_Main' } })

    expect(payload.recallFlights).toHaveLength(1)
    expect(payload.recallFlights[0].timing.dropStartT).toBeCloseTo(661.04)
    expect(payload.recallFlights[0].riders).toBe(1)
  })

  it('convertit les caisses de carePackageSamples et repère celles pillées par l’escouade', () => {
    const carePackageSamples = JSON.stringify([
        {
          type: 'redbox',
          packageId: 'Carapackage_RedBox_C',
          spawnTimestampSeconds: MATCH_START_EPOCH + 263.7,
          timestampSeconds: MATCH_START_EPOCH + 319.3,
          x: 572020,
          y: 165429,
          items: ['Item_Weapon_AWM_C'],
          lootTeamIds: [9, 1],
          firstLootTimestampSeconds: MATCH_START_EPOCH + 438.5,
        },
        {
          type: 'small',
          packageId: 'Carapackage_SmallPackage_C',
          spawnTimestampSeconds: null,
          timestampSeconds: MATCH_START_EPOCH + 320,
          x: 570100,
          y: 166976,
          items: [],
          lootTeamIds: [9],
          firstLootTimestampSeconds: MATCH_START_EPOCH + 500,
        },
      ])

    const payload = build({ ...base, carePackageSamples })
    expect(payload.crates).toEqual([
      { k: 'redbox', sp: 264, t: 319, x: 572020, y: 165429, items: ['Item_Weapon_AWM_C'], lt: 439, sq: true, lteams: [9, 1] },
      { k: 'small', sp: null, t: 320, x: 570100, y: 166976, items: [], lt: 500, sq: false, lteams: [9] },
    ])

    // Repli : emplacement provisoire `summary.carePackages` des matchs re-parsés le 2026-09-13.
    const legacySummary = { totalEvents: 10, carePackages: JSON.parse(carePackageSamples) }
    expect(build({ ...base, summary: legacySummary }).crates).toHaveLength(2)
  })

  it('renvoie des listes vides pour un match analysé avant l’extraction', () => {
    const payload = build({ ...base, summary: { totalEvents: 10 } })
    expect(payload.crates).toEqual([])
    expect(build({ positionSamples: base.positionSamples }).recallFlights).toEqual([])
  })
})

describe('buildMatchReplayPayload — morts et zones', () => {
  it('retient la première mort comme définitive en l’absence de rappel', () => {
    const payload = build({
      positionSamples: [{ memberKey: 'account.a', timestampSeconds: 5, x: 10, y: 10 }],
      deathSamples: [
        { memberKey: 'account.a', timestampSeconds: MATCH_START_EPOCH + 400 },
        { memberKey: 'account.a', timestampSeconds: MATCH_START_EPOCH + 300 },
      ],
    })

    expect(payload.players[0].d).toBe(300)
  })

  it('trie les zones et expose le centre du prochain cercle', () => {
    const payload = build({
      positionSamples: [{ memberKey: 'account.a', timestampSeconds: 5, x: 10, y: 10 }],
      phaseSnapshots: [
        {
          isGame: 2,
          timestampSeconds: 300,
          numAlivePlayers: 40,
          numAliveTeams: 12,
          safetyZoneRadiusMeters: 100_000,
          poisonGasWarningRadiusMeters: 50_000,
          safetyZoneX: 200_000,
          safetyZoneY: 200_000,
          poisonGasWarningX: 210_000,
          poisonGasWarningY: 190_000,
        },
        {
          isGame: 1,
          timestampSeconds: 60,
          numAlivePlayers: 80,
          numAliveTeams: 25,
          safetyZoneRadiusMeters: 200_000,
          poisonGasWarningRadiusMeters: 100_000,
          safetyZoneX: 204_000,
          safetyZoneY: 204_000,
        },
      ],
    })

    expect(payload.zones.map((zone) => zone.t)).toEqual([60, 300])
    expect(payload.zones[0].px).toBeNull()
    expect(payload.zones[1].px).toBe(210_000)
    expect(payload.zones[1].py).toBe(190_000)
  })
})

describe('buildMatchReplayPayload — événements', () => {
  const positionSamples = [
    { memberKey: 'account.killer', teamId: 1, timestampSeconds: 5, x: 10, y: 10 },
    { memberKey: 'account.victim', teamId: 2, timestampSeconds: 5, x: 20, y: 20 },
  ]

  it('référence les kills par index de joueur et convertit la distance en mètres', () => {
    const payload = build({
      positionSamples,
      killEvents: [
        {
          id: 'k1',
          killerAccountId: 'account.killer',
          killerRawKey: 'account.killer',
          victimAccountId: 'account.victim',
          victimRawKey: 'account.victim',
          weaponName: 'WeapAK47_C',
          distance: 12_345,
          headshot: true,
          timestampSeconds: MATCH_START_EPOCH + 200,
        },
      ],
    })

    const kill = payload.events.find((event) => event.k === 'kill')
    const indexByKey = new Map(payload.players.map((player) => [player.key, player.i]))

    expect(kill?.t).toBe(200)
    expect(kill?.a).toBe(indexByKey.get('account.killer'))
    expect(kill?.v).toBe(indexByKey.get('account.victim'))
    expect(kill?.dist).toBe(123)
    expect(kill?.hs).toBe(true)
  })

  it('apparie les knockouts par horodatage et calcule la distance du duel', () => {
    const payload = build({
      positionSamples,
      knockoutSamples: [
        {
          memberKey: 'account.killer',
          role: 'knocker',
          timestampSeconds: 150,
          x: 0,
          y: 0,
          damageCauser: 'WeapM416_C',
          damageReason: 'HeadShot',
        },
        { memberKey: 'account.victim', role: 'victim', timestampSeconds: 150, x: 30_000, y: 40_000 },
      ],
    })

    const knock = payload.events.find((event) => event.k === 'knock')
    expect(knock?.t).toBe(150)
    expect(knock?.dist).toBe(500)
    expect(knock?.hs).toBe(true)
    expect(knock?.x).toBe(30_000)
  })

  it('apparie les réanimations et les trie chronologiquement avec les autres événements', () => {
    const payload = build({
      positionSamples,
      killEvents: [
        {
          id: 'k1',
          killerAccountId: 'account.killer',
          killerRawKey: null,
          victimAccountId: 'account.victim',
          victimRawKey: null,
          weaponName: null,
          distance: null,
          headshot: false,
          timestampSeconds: 300,
        },
      ],
      reviveSamples: [
        { memberKey: 'account.killer', role: 'reviver', timestampSeconds: 100, x: 5, y: 5 },
        { memberKey: 'account.victim', role: 'revived', timestampSeconds: 100, x: 6, y: 6 },
      ],
    })

    expect(payload.events.map((event) => event.k)).toEqual(['revive', 'kill'])
  })

  it('tolère un acteur absent de la carte sans casser le payload', () => {
    const payload = build({
      positionSamples,
      killEvents: [
        {
          id: 'k1',
          killerAccountId: 'account.ghost',
          killerRawKey: null,
          victimAccountId: 'account.victim',
          victimRawKey: null,
          weaponName: null,
          distance: null,
          headshot: false,
          timestampSeconds: 90,
        },
      ],
    })

    expect(payload.events[0].a).toBeNull()
    expect(payload.events[0].v).not.toBeNull()
  })
})
