import { describe, expect, it, vi } from 'vitest'

// Jamais la base de DATABASE_URL (production) : le module reçoit un client en mémoire, et le client par défaut est
// remplacé par un objet vide pour qu'un oubli d'injection échoue au lieu d'interroger la base.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { encodeJsonColumn } from '@/lib/pubg-telemetry/json-codec'
import { OBSERVATION_WINDOW_DAYS, resourceMap } from '@/lib/resources/resource-map'
import {
  computeResourceVehicleSpots,
  formatResourceVehicleMapSummary,
  vehicleObservationsOfMatch,
} from '@/lib/resources/resource-vehicle-spots'

const ERANGEL = resourceMap('Baltic_Main')!
const SANHOK = resourceMap('Savage_Main')!

type Sample = {
  memberKey?: string
  action: 'ride' | 'leave'
  vehicleType: string | null
  vehicleId?: string
  vehicleUniqueId?: number
  phase: number
  timestampSeconds: number | null
  x: number
  y: number
  teammateAboard?: boolean
}

/** Montée en mètres (stockée en centimètres, comme la télémétrie). */
function ride(xMeters: number, yMeters: number, extra: Partial<Sample> = {}): Sample {
  return { memberKey: 'p', action: 'ride', vehicleType: 'WheeledVehicle', phase: 1, timestampSeconds: 1_000, x: xMeters * 100, y: yMeters * 100, ...extra }
}

const aircraft = (timestampSeconds = 900): Sample => ({ action: 'ride', vehicleType: 'TransportAircraft', vehicleId: 'DummyTransportAircraft_C', phase: 0.1, timestampSeconds, x: 100_000, y: 100_000 })

describe('vehicleObservationsOfMatch — sans identifiant de véhicule (télémétrie stockée)', () => {
  it('montées de phase ≤ 1 seulement, passagers (teammateAboard) écartés, descentes ignorées, cm → m', () => {
    const result = vehicleObservationsOfMatch('m1', ERANGEL, [
      aircraft(),
      ride(1000, 2000, { vehicleId: 'Dacia_A_01_v2_C', teammateAboard: false }),
      ride(1001, 2001, { vehicleId: 'Dacia_A_01_v2_C', teammateAboard: true }),
      ride(3000, 3000, { teammateAboard: undefined }),
      ride(4000, 4000, { phase: 1.5 }),
      ride(4100, 4100, { phase: 0.10000000149011612, vehicleId: 'BP_Motorbike_04_C' }),
      { ...ride(5000, 5000), action: 'leave' },
    ])

    expect(result.analysed).toBe(true)
    expect(result.observations).toEqual([
      { matchId: 'm1', family: 'car', x: 1000, y: 2000 },
      { matchId: 'm1', family: 'land', x: 3000, y: 3000 },
      { matchId: 'm1', family: 'moto', x: 4100, y: 4100 },
    ])
    expect(result.byVehicleIdentity).toBe(0)
  })

  it('familles : voiture, moto, bateau, planeur, voiture ou moto ; avion, évacuation et mortier exclus', () => {
    const result = vehicleObservationsOfMatch('m1', ERANGEL, [
      ride(100, 100, { vehicleId: 'Uaz_B_01_C' }),
      ride(200, 200, { vehicleId: 'BP_Scooter_02_A_C' }),
      ride(300, 300, { vehicleType: 'FloatingVehicle', vehicleId: 'Boat_PG117_C' }),
      ride(400, 400, { vehicleType: 'rubberboat' }),
      ride(500, 500, { vehicleType: 'FlyingVehicle', vehicleId: 'BP_Motorglider_C' }),
      ride(600, 600),
      ride(700, 700, { vehicleType: 'TransportAircraft' }),
      ride(800, 800, { vehicleType: 'EmergencyPickup' }),
      ride(900, 900, { vehicleType: 'Mortar', vehicleId: 'MortarPawn_C' }),
      ride(950, 950, { vehicleType: null }),
    ])
    expect(result.observations.map((observation) => observation.family)).toEqual(['car', 'moto', 'boat', 'boat', 'glider', 'land'])
  })

  it('hors carte ignoré (Sanhok fait 4 096 m de côté)', () => {
    const result = vehicleObservationsOfMatch('m1', SANHOK, [ride(1000, 1000), ride(5000, 1000), ride(-1, 10)])
    expect(result.observations).toEqual([{ matchId: 'm1', family: 'land', x: 1000, y: 1000 }])
  })

  it('montées au lobby (avant l’embarquement dans l’avion) ignorées, même stockées en phase 1', () => {
    const result = vehicleObservationsOfMatch('m1', ERANGEL, [
      ride(5544, 5090, { vehicleId: 'BP_RoadGlideST_LGD_C', timestampSeconds: 800 }),
      aircraft(900),
      ride(1000, 1000, { timestampSeconds: 1_200 }),
    ])
    expect(result.lobbyRides).toBe(1)
    expect(result.observations).toEqual([{ matchId: 'm1', family: 'land', x: 1000, y: 1000 }])
  })

  it('aucun échantillon exploitable : partie non analysée (hors dénominateur)', () => {
    expect(vehicleObservationsOfMatch('m1', ERANGEL, null).analysed).toBe(false)
    expect(vehicleObservationsOfMatch('m1', ERANGEL, []).analysed).toBe(false)
    expect(vehicleObservationsOfMatch('m1', ERANGEL, [{ action: 'ride', x: 'a' }]).analysed).toBe(false)
    // Une partie sans montée retenue reste analysée : on y a cherché des véhicules.
    const late = vehicleObservationsOfMatch('m1', ERANGEL, [ride(1000, 1000, { phase: 3 })])
    expect(late).toMatchObject({ analysed: true, observations: [] })
  })

  it('accepte le JSON en chaîne (ancienne colonne en clair)', () => {
    const result = vehicleObservationsOfMatch('m1', ERANGEL, JSON.stringify([ride(1000, 1000)]))
    expect(result.observations).toHaveLength(1)
  })
})

describe('vehicleObservationsOfMatch — avec vehicleUniqueId', () => {
  it('première montée de chaque véhicule (horodatage le plus ancien), quel que soit le moment', () => {
    const result = vehicleObservationsOfMatch('m1', ERANGEL, [
      aircraft(),
      // Véhicule 7 : le conducteur monte à 1 100 s, un passager à 1 101 s, un autre joueur le reprend plus loin.
      ride(2000, 2000, { vehicleUniqueId: 7, vehicleId: 'Dacia_A_01_v2_C', timestampSeconds: 1_101, teammateAboard: true }),
      ride(1000, 1000, { vehicleUniqueId: 7, vehicleId: 'Dacia_A_01_v2_C', timestampSeconds: 1_100 }),
      ride(6000, 6000, { vehicleUniqueId: 7, vehicleId: 'Dacia_A_01_v2_C', timestampSeconds: 1_900, phase: 4 }),
      // Véhicule 8 : pris pour la première fois en phase 5, gardé (c'est son point d'apparition).
      ride(3000, 3000, { vehicleUniqueId: 8, vehicleId: 'BP_Motorbike_04_C', timestampSeconds: 2_500, phase: 5 }),
      // Sans identifiant dans la même partie : règle de phase.
      ride(4000, 4000, { phase: 2 }),
    ])

    expect(result.observations).toEqual([
      { matchId: 'm1', family: 'car', x: 1000, y: 1000 },
      { matchId: 'm1', family: 'moto', x: 3000, y: 3000 },
    ])
    expect(result.byVehicleIdentity).toBe(2)
  })

  it('sans horodatage, l’ordre de la télémétrie départage ; les véhicules exclus restent exclus', () => {
    const result = vehicleObservationsOfMatch('m1', ERANGEL, [
      ride(1000, 1000, { vehicleUniqueId: 1, timestampSeconds: null }),
      ride(1500, 1500, { vehicleUniqueId: 1, timestampSeconds: null }),
      ride(1600, 1600, { vehicleUniqueId: 2, vehicleType: 'EmergencyPickup', timestampSeconds: 10 }),
    ])
    expect(result.observations).toEqual([{ matchId: 'm1', family: 'land', x: 1000, y: 1000 }])
  })
})

// --- Client Prisma en mémoire -----------------------------------------------------------------------------------------

type MatchRow = { id: string; mapName: string; matchType: string; createdAt: Date }
type TelemetryRow = { squadMatchId: string; vehicleSamples: unknown; vehicleSamplesGz: Buffer | null }

function fakeClient(matches: MatchRow[], telemetry: TelemetryRow[]) {
  const writes: Array<{ op: string; args: unknown }> = []
  const record = (op: string) => (args: unknown) => {
    writes.push({ op, args })
    return Promise.resolve({ op })
  }
  const client = {
    squadMatch: {
      findMany: vi.fn(async (args: {
        where: { mapName: string; createdAt: { gte: Date; lte: Date }; matchType: { in: string[] } }
        take?: number
      }) => {
        const rows = matches
          .filter((row) => row.mapName === args.where.mapName)
          .filter((row) => row.createdAt >= args.where.createdAt.gte && row.createdAt <= args.where.createdAt.lte)
          .filter((row) => args.where.matchType.in.includes(row.matchType))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
        return (args.take ? rows.slice(0, args.take) : rows).map((row) => ({ id: row.id }))
      }),
    },
    squadMatchTelemetry: {
      findMany: vi.fn(async (args: { where: { squadMatchId: { in: string[] } } }) =>
        telemetry.filter((row) => args.where.squadMatchId.in.includes(row.squadMatchId)).map((row) => ({ ...row }))),
    },
    resourceVehicleSpot: { deleteMany: vi.fn(record('deleteMany')), createMany: vi.fn(record('createMany')) },
    resourceVehicleMapStat: { upsert: vi.fn(record('upsert')) },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  }
  return { client, writes }
}

const NOW = new Date('2026-10-05T06:30:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

/** Une partie d'Erangel où une voiture est prise au même endroit (1000, 1000), plus une moto propre à la partie. */
function erangelMatch(id: string, days = 1, matchType = 'official'): { match: MatchRow; telemetry: TelemetryRow } {
  const samples = [aircraft(), ride(1000, 1000, { vehicleId: 'Dacia_A_01_v2_C' }), ride(2000 + Number(id.replace(/\D/g, '')) * 200, 2000, { vehicleId: 'BP_Motorbike_04_C' })]
  return {
    match: { id, mapName: 'Baltic_Main', matchType, createdAt: daysAgo(days) },
    telemetry: { squadMatchId: id, vehicleSamples: null, vehicleSamplesGz: encodeJsonColumn(samples) },
  }
}

describe('computeResourceVehicleSpots', () => {
  function dataset() {
    const inWindow = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id, index) => erangelMatch(id, index + 1))
    const legacy = { squadMatchId: 'm6', vehicleSamples: [aircraft(), ride(1005, 1003, { vehicleId: 'Dacia_A_02_v2_C' })], vehicleSamplesGz: null }
    const matches: MatchRow[] = [
      ...inWindow.map((entry) => entry.match),
      { id: 'm6', mapName: 'Baltic_Main', matchType: 'competitive', createdAt: daysAgo(10) },
      // Hors fenêtre, hors carte, type exclu, sans télémétrie, télémétrie sans véhicules : aucun n'est compté.
      { id: 'old', mapName: 'Baltic_Main', matchType: 'official', createdAt: daysAgo(OBSERVATION_WINDOW_DAYS + 1) },
      { id: 'future', mapName: 'Baltic_Main', matchType: 'official', createdAt: new Date(NOW.getTime() + 60_000) },
      { id: 'range', mapName: 'Range_Main', matchType: 'official', createdAt: daysAgo(1) },
      { id: 'custom', mapName: 'Baltic_Main', matchType: 'custom', createdAt: daysAgo(1) },
      { id: 'noTelemetry', mapName: 'Baltic_Main', matchType: 'official', createdAt: daysAgo(2) },
      { id: 'noVehicles', mapName: 'Baltic_Main', matchType: 'official', createdAt: daysAgo(3) },
    ]
    const telemetry: TelemetryRow[] = [
      ...inWindow.map((entry) => entry.telemetry),
      legacy,
      ...['old', 'future', 'range', 'custom'].map((id) => erangelMatch(id).telemetry),
      { squadMatchId: 'noVehicles', vehicleSamples: null, vehicleSamplesGz: null },
    ]
    return { matches, telemetry }
  }

  it('dry-run : lit par lots, résume par carte et par famille, n’écrit rien', async () => {
    const { matches, telemetry } = dataset()
    const { client, writes } = fakeClient(matches, telemetry)

    const summary = await computeResourceVehicleSpots({ now: NOW, dryRun: true, batchSize: 3, client: client as never })

    expect(summary.dryRun).toBe(true)
    expect(summary.since).toEqual(daysAgo(OBSERVATION_WINDOW_DAYS))
    expect(summary.maps.map((map) => map.mapName)).toEqual(['Baltic_Main', 'Desert_Main', 'Tiger_Main', 'DihorOtok_Main', 'Savage_Main'])
    const erangel = summary.maps[0]
    // m1–m5 (official, gz) + m6 (competitive, colonne en clair) ; noTelemetry et noVehicles candidats mais non analysés.
    expect(erangel.candidateMatches).toBe(8)
    expect(erangel.analysedMatches).toBe(6)
    expect(erangel.observations).toMatchObject({ car: 6, moto: 5, land: 0 })
    // La voiture prise six fois au même endroit forme un emplacement affichable ; chaque moto reste un singleton.
    expect(erangel.spots).toMatchObject({ car: 1, moto: 5 })
    expect(erangel.shownSpots).toMatchObject({ car: 1, moto: 0 })
    expect(summary.maps.slice(1).every((map) => map.analysedMatches === 0)).toBe(true)

    // Lots de 3 identifiants au plus ; aucune écriture.
    const batches = client.squadMatchTelemetry.findMany.mock.calls.map(([args]) => args.where.squadMatchId.in.length)
    expect(batches.slice(0, 3)).toEqual([3, 3, 2])
    expect(batches.every((size) => size <= 3)).toBe(true)
    expect(client.squadMatchTelemetry.findMany.mock.calls[0][0]).toMatchObject({ select: { squadMatchId: true, vehicleSamples: true, vehicleSamplesGz: true } })
    expect(client.$transaction).not.toHaveBeenCalled()
    expect(writes).toEqual([])

    expect(formatResourceVehicleMapSummary(erangel)).toContain('Erangel : 6/8 parties analysées')
  })

  it('écriture : remplace les emplacements de chaque carte dans une transaction et met à jour la statistique', async () => {
    const { matches, telemetry } = dataset()
    const { client } = fakeClient(matches, telemetry)

    await computeResourceVehicleSpots({ now: NOW, client: client as never })

    expect(client.$transaction).toHaveBeenCalledTimes(5)
    expect(client.resourceVehicleSpot.deleteMany).toHaveBeenNthCalledWith(1, { where: { mapName: 'Baltic_Main' } })
    expect(client.resourceVehicleSpot.deleteMany).toHaveBeenNthCalledWith(5, { where: { mapName: 'Savage_Main' } })

    const created = client.resourceVehicleSpot.createMany.mock.calls.flatMap(([args]) => (args as { data: Array<Record<string, unknown>> }).data)
    expect(created).toHaveLength(6)
    expect(created.find((row) => row.family === 'car')).toEqual({
      mapName: 'Baltic_Main',
      family: 'car',
      x: 1001,
      y: 1001,
      observations: 6,
      matches: 6,
      computedAt: NOW,
    })

    expect(client.resourceVehicleMapStat.upsert).toHaveBeenNthCalledWith(1, {
      where: { mapName: 'Baltic_Main' },
      create: { mapName: 'Baltic_Main', analysedMatches: 6, windowDays: OBSERVATION_WINDOW_DAYS, computedAt: NOW },
      update: { analysedMatches: 6, windowDays: OBSERVATION_WINDOW_DAYS, computedAt: NOW },
    })
    // Carte sans partie : emplacements vidés, statistique à zéro (la carte affiche « aucune partie analysée »).
    expect(client.resourceVehicleMapStat.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      update: { analysedMatches: 0, windowDays: OBSERVATION_WINDOW_DAYS, computedAt: NOW },
    }))
  })

  it('limit : au plus N parties par carte, les plus récentes', async () => {
    const { matches, telemetry } = dataset()
    const { client } = fakeClient(matches, telemetry)

    const summary = await computeResourceVehicleSpots({ now: NOW, dryRun: true, limit: 2, client: client as never })

    expect(summary.limit).toBe(2)
    expect(client.squadMatch.findMany.mock.calls[0][0]).toMatchObject({ take: 2, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] })
    expect(summary.maps[0]).toMatchObject({ candidateMatches: 2, analysedMatches: 2 })
  })

  it('une partie n’est comptée qu’une fois, et une colonne compressée illisible est ignorée sans tout arrêter', async () => {
    const { matches, telemetry } = dataset()
    const broken = { squadMatchId: 'm5', vehicleSamples: null, vehicleSamplesGz: Buffer.from('pas du gzip') }
    const { client } = fakeClient(matches, [...telemetry.filter((row) => row.squadMatchId !== 'm5'), broken, telemetry[0]])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const summary = await computeResourceVehicleSpots({ now: NOW, dryRun: true, client: client as never })

    warn.mockRestore()
    expect(summary.maps[0]).toMatchObject({ analysedMatches: 5, unreadableMatches: 1 })
    expect(summary.maps[0].observations.car).toBe(5)
  })
})
