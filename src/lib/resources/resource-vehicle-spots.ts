/**
 * Agrégat nocturne des véhicules observés de la Carte des ressources (docs/features/carte-ressources.md) : relit les
 * montées de véhicules de la télémétrie des `OBSERVATION_WINDOW_DAYS` derniers jours, carte par carte, les regroupe en
 * emplacements (`clusterObservations`) et remplace `ResourceVehicleSpot` / `ResourceVehicleMapStat` de la carte.
 *
 * Cron `resource_vehicle_spots` (06:30) et `scripts/compute-resource-vehicle-spots.ts` (`--dry-run`, `--limit`).
 *
 * Mémoire bornée : une carte à la fois, télémétrie lue par lots de `RESOURCE_VEHICLE_BATCH_SIZE` parties (colonnes
 * `vehicleSamples` + `vehicleSamplesGz` seulement, décodées par `decodeTelemetryRow`), seules les observations
 * retenues (quelques dizaines par partie) restent en mémoire jusqu'au regroupement.
 */
import type { PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'
import {
  OBSERVATION_WINDOW_DAYS,
  OBSERVED_FAMILIES,
  RESOURCE_MAPS,
  classifyVehicle,
  clusterObservations,
  insideResourceMap,
  isSpotShown,
  topMatchesByFamily,
  type ObservedFamily,
  type ObservedSpot,
  type ResourceMapDefinition,
  type VehicleObservation,
} from '@/lib/resources/resource-map'

/** Parties lues par requête de télémétrie (une ligne ≈ 600 montées et descentes, ~100 Ko de JSON décodé). */
export const RESOURCE_VEHICLE_BATCH_SIZE = 50

/** Lignes `ResourceVehicleSpot` par `createMany` (Erangel : quelques milliers d'emplacements, singletons compris). */
const SPOT_INSERT_CHUNK = 1_000

/**
 * Types de partie retenus : battle royale normale, classée et décontractée (`airoyale`, Erangel avec bots), qui tirent
 * leurs véhicules des mêmes points d'apparition. Exclus : parties personnalisées (mode esport, apparitions garanties),
 * événements (`event` : Intense BR), arcade (TDM) et `rumble` — mesuré le 2026-10-04 : ~2 % des parties des cinq
 * cartes sur 90 jours.
 */
export const RESOURCE_VEHICLE_MATCH_TYPES = ['official', 'competitive', 'airoyale']

/** Sans identifiant de véhicule : montées faites avant que la première zone commence à se resserrer (`phase ≤ 1`). */
export const EARLY_RIDE_MAX_PHASE = 1

/** Famille technique de l'avion de largage : sa première montée marque la fin du lobby. */
const TRANSPORT_AIRCRAFT = 'TransportAircraft'

type StoredVehicleSample = {
  action: 'ride' | 'leave'
  vehicleType: string | null
  vehicleId: string | null
  vehicleUniqueId: number | null
  phase: number
  timestampSeconds: number | null
  x: number
  y: number
  teammateAboard: boolean | undefined
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/** Relit défensivement les échantillons stockés (JSON produit par des versions successives du parser). */
function readStoredSamples(value: unknown): StoredVehicleSample[] {
  let rows = value
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows)
    } catch {
      return []
    }
  }
  if (!Array.isArray(rows)) return []

  const samples: StoredVehicleSample[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    if (record.action !== 'ride' && record.action !== 'leave') continue
    const x = finiteNumber(record.x)
    const y = finiteNumber(record.y)
    if (x === null || y === null) continue
    samples.push({
      action: record.action,
      vehicleType: nonEmptyString(record.vehicleType),
      vehicleId: nonEmptyString(record.vehicleId),
      vehicleUniqueId: finiteNumber(record.vehicleUniqueId),
      phase: finiteNumber(record.phase) ?? 0,
      timestampSeconds: finiteNumber(record.timestampSeconds),
      x,
      y,
      teammateAboard: typeof record.teammateAboard === 'boolean' ? record.teammateAboard : undefined,
    })
  }
  return samples
}

export type MatchVehicleObservations = {
  /** Faux : aucun échantillon de véhicule exploitable, la partie ne compte pas dans le dénominateur. */
  analysed: boolean
  observations: VehicleObservation[]
  /** Montées faites au lobby, avant l'embarquement dans l'avion (véhicules d'événement, juin 2026). */
  lobbyRides: number
  /** Observations tirées de `vehicleUniqueId` (première montée de chaque véhicule). */
  byVehicleIdentity: number
}

/**
 * Observations d'une partie (télémétrie stockée → points d'apparition présumés, en mètres) :
 *
 * - montées seulement (`action === 'ride'`), classées par `classifyVehicle(vehicleType, vehicleId)` (avion,
 *   évacuation et mortier ignorés) ;
 * - montées au lobby ignorées : antérieures à la première montée dans l'avion de largage (stockées en phase 1, elles
 *   formaient un faux emplacement au même endroit à chaque partie d'un événement) ;
 * - avec `vehicleUniqueId` : la **première** montée de chaque véhicule, quel que soit le moment — son point
 *   d'apparition (les passagers montent après, ils sont écartés par construction) ;
 * - sans (toute la télémétrie stockée à ce jour) : montées de phase ≤ 1 dont `teammateAboard !== true`. Avant le
 *   2026-10-04 `teammateAboard` manque : les passagers d'un même véhicule comptent alors chacun une observation
 *   (gonfle `observations`, pas `matches`, donc sans effet sur le seuil d'affichage) ;
 * - centimètres → mètres ; hors carte ignoré.
 */
export function vehicleObservationsOfMatch(matchId: string, map: ResourceMapDefinition, storedSamples: unknown): MatchVehicleObservations {
  const samples = readStoredSamples(storedSamples)
  const result: MatchVehicleObservations = { analysed: samples.length > 0, observations: [], lobbyRides: 0, byVehicleIdentity: 0 }
  if (!result.analysed) return result

  let boardingAt: number | null = null
  for (const sample of samples) {
    if (sample.action !== 'ride' || sample.vehicleType !== TRANSPORT_AIRCRAFT || sample.timestampSeconds === null) continue
    if (boardingAt === null || sample.timestampSeconds < boardingAt) boardingAt = sample.timestampSeconds
  }

  const firstRideByVehicle = new Map<number, { sample: StoredVehicleSample; family: ObservedFamily; order: number }>()
  const push = (family: ObservedFamily, sample: StoredVehicleSample) => {
    const x = sample.x / 100
    const y = sample.y / 100
    if (!insideResourceMap(map, x, y)) return false
    result.observations.push({ matchId, family, x, y })
    return true
  }

  samples.forEach((sample, order) => {
    if (sample.action !== 'ride') return
    const family = classifyVehicle(sample.vehicleType, sample.vehicleId)
    if (!family) return
    if (boardingAt !== null && sample.timestampSeconds !== null && sample.timestampSeconds < boardingAt) {
      result.lobbyRides += 1
      return
    }

    if (sample.vehicleUniqueId !== null) {
      const current = firstRideByVehicle.get(sample.vehicleUniqueId)
      if (!current || isEarlier(sample, order, current.sample, current.order)) {
        firstRideByVehicle.set(sample.vehicleUniqueId, { sample, family, order })
      }
      return
    }

    if (sample.phase <= EARLY_RIDE_MAX_PHASE && sample.teammateAboard !== true) push(family, sample)
  })

  for (const { sample, family } of firstRideByVehicle.values()) {
    if (push(family, sample)) result.byVehicleIdentity += 1
  }
  return result
}

/** Horodatage le plus ancien ; sans horodatage, l'ordre de la télémétrie départage. */
function isEarlier(candidate: StoredVehicleSample, candidateOrder: number, current: StoredVehicleSample, currentOrder: number) {
  const a = candidate.timestampSeconds
  const b = current.timestampSeconds
  if (a !== null && b !== null && a !== b) return a < b
  if (a !== null && b === null) return true
  if (a === null && b !== null) return false
  return candidateOrder < currentOrder
}

// --- Calcul et écriture --------------------------------------------------------------------------------------------

type FamilyCounts = Record<ObservedFamily, number>

function emptyFamilyCounts(): FamilyCounts {
  return Object.fromEntries(OBSERVED_FAMILIES.map((family) => [family, 0])) as FamilyCounts
}

export type ResourceVehicleMapSummary = {
  mapName: string
  label: string
  /** Parties de la fenêtre sur la carte (types retenus, après `limit`). */
  candidateMatches: number
  /** Parties avec des échantillons de véhicules : dénominateur de la part affichée. */
  analysedMatches: number
  /** Télémétrie compressée illisible : partie ignorée (journalisée). */
  unreadableMatches: number
  lobbyRides: number
  observations: FamilyCounts
  byVehicleIdentity: number
  spots: FamilyCounts
  /** Emplacements qui passeraient le filtre d'affichage (`isSpotShown`) — le filtre lui-même est fait par la route. */
  shownSpots: FamilyCounts
  durationMs: number
}

export type ResourceVehicleSpotsSummary = {
  dryRun: boolean
  windowDays: number
  since: Date
  now: Date
  limit: number | null
  maps: ResourceVehicleMapSummary[]
  durationMs: number
  /** Tas V8 le plus haut relevé après chaque lot (Mo). */
  peakHeapMb: number
}

type ResourceVehicleClient = Pick<PrismaClient, 'squadMatch' | 'squadMatchTelemetry' | 'resourceVehicleSpot' | 'resourceVehicleMapStat' | '$transaction'>

export type ComputeResourceVehicleSpotsInput = {
  now?: Date
  /** Lecture seule : calcule et résume, n'écrit rien. */
  dryRun?: boolean
  /** Au plus N parties par carte, les plus récentes (validation sur un échantillon). */
  limit?: number
  batchSize?: number
  client?: ResourceVehicleClient
  /** Après chaque carte, avec ses emplacements (tous, singletons compris). */
  onMap?: (summary: ResourceVehicleMapSummary, spots: ObservedSpot[]) => void
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

/**
 * Recalcule les emplacements de véhicules observés de chaque carte de `RESOURCE_MAPS`. Une transaction par carte
 * remplace **tous** ses emplacements (singletons compris : le seuil d'affichage reste l'affaire de la route) et sa
 * ligne `ResourceVehicleMapStat`. Une partie n'est lue qu'une fois (`SquadMatch.pubgMatchId` et
 * `SquadMatchTelemetry.squadMatchId` sont uniques ; garde supplémentaire par identifiant).
 */
export async function computeResourceVehicleSpots(input: ComputeResourceVehicleSpotsInput = {}): Promise<ResourceVehicleSpotsSummary> {
  const startedAt = Date.now()
  const client = input.client ?? prisma
  const now = input.now ?? new Date()
  const dryRun = input.dryRun === true
  const limit = input.limit !== undefined && Number.isInteger(input.limit) && input.limit > 0 ? input.limit : null
  const batchSize = Math.max(1, Math.min(input.batchSize ?? RESOURCE_VEHICLE_BATCH_SIZE, 500))
  const since = new Date(now.getTime() - OBSERVATION_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  let peakHeap = process.memoryUsage().heapUsed

  const maps: ResourceVehicleMapSummary[] = []
  for (const map of RESOURCE_MAPS) {
    const mapStartedAt = Date.now()
    const candidates = await client.squadMatch.findMany({
      where: {
        mapName: map.key,
        createdAt: { gte: since, lte: now },
        matchType: { in: RESOURCE_VEHICLE_MATCH_TYPES },
      },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...(limit ? { take: limit } : {}),
    })

    const summary: ResourceVehicleMapSummary = {
      mapName: map.key,
      label: map.label,
      candidateMatches: candidates.length,
      analysedMatches: 0,
      unreadableMatches: 0,
      lobbyRides: 0,
      observations: emptyFamilyCounts(),
      byVehicleIdentity: 0,
      spots: emptyFamilyCounts(),
      shownSpots: emptyFamilyCounts(),
      durationMs: 0,
    }

    const seen = new Set<string>()
    const observations: VehicleObservation[] = []
    for (const batch of chunks([...new Set(candidates.map((candidate) => candidate.id))], batchSize)) {
      const rows = await client.squadMatchTelemetry.findMany({
        where: { squadMatchId: { in: batch } },
        select: { squadMatchId: true, vehicleSamples: true, vehicleSamplesGz: true },
      })
      for (const row of rows) {
        if (seen.has(row.squadMatchId)) continue
        seen.add(row.squadMatchId)
        let samples: unknown
        try {
          samples = decodeTelemetryRow(row as Record<string, unknown>).vehicleSamples
        } catch (error) {
          summary.unreadableMatches += 1
          console.warn(`[ResourceVehicleSpots] ${row.squadMatchId} : vehicleSamples illisible, partie ignorée`, error)
          continue
        }
        const match = vehicleObservationsOfMatch(row.squadMatchId, map, samples)
        if (!match.analysed) continue
        summary.analysedMatches += 1
        summary.lobbyRides += match.lobbyRides
        summary.byVehicleIdentity += match.byVehicleIdentity
        for (const observation of match.observations) {
          summary.observations[observation.family] += 1
          observations.push(observation)
        }
      }
      peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed)
    }

    const spots = clusterObservations(observations)
    const familyTop = topMatchesByFamily(spots)
    for (const spot of spots) {
      summary.spots[spot.family] += 1
      if (isSpotShown(spot, summary.analysedMatches, familyTop.get(spot.family) ?? 0)) summary.shownSpots[spot.family] += 1
    }

    if (!dryRun) {
      await client.$transaction([
        client.resourceVehicleSpot.deleteMany({ where: { mapName: map.key } }),
        ...chunks(spots, SPOT_INSERT_CHUNK).map((chunk) =>
          client.resourceVehicleSpot.createMany({
            data: chunk.map((spot) => ({
              mapName: map.key,
              family: spot.family,
              x: spot.x,
              y: spot.y,
              observations: spot.observations,
              matches: spot.matches,
              computedAt: now,
            })),
          })
        ),
        client.resourceVehicleMapStat.upsert({
          where: { mapName: map.key },
          create: { mapName: map.key, analysedMatches: summary.analysedMatches, windowDays: OBSERVATION_WINDOW_DAYS, computedAt: now },
          update: { analysedMatches: summary.analysedMatches, windowDays: OBSERVATION_WINDOW_DAYS, computedAt: now },
        }),
      ])
    }

    summary.durationMs = Date.now() - mapStartedAt
    maps.push(summary)
    input.onMap?.(summary, spots)
  }

  return {
    dryRun,
    windowDays: OBSERVATION_WINDOW_DAYS,
    since,
    now,
    limit,
    maps,
    durationMs: Date.now() - startedAt,
    peakHeapMb: Math.round(peakHeap / (1024 * 1024)),
  }
}

/** Une ligne de journal par carte : parties, observations et emplacements affichables par famille. */
export function formatResourceVehicleMapSummary(summary: ResourceVehicleMapSummary) {
  const families = OBSERVED_FAMILIES.filter((family) => summary.observations[family] > 0 || summary.spots[family] > 0)
    .map((family) => `${family} ${summary.observations[family]} obs → ${summary.shownSpots[family]}/${summary.spots[family]} empl.`)
    .join(', ')
  return (
    `${summary.label} : ${summary.analysedMatches}/${summary.candidateMatches} parties analysées` +
    (summary.unreadableMatches ? `, ${summary.unreadableMatches} illisibles` : '') +
    (summary.lobbyRides ? `, ${summary.lobbyRides} montées de lobby ignorées` : '') +
    ` — ${families || 'aucune observation'} (${(summary.durationMs / 1000).toFixed(1)} s)`
  )
}
