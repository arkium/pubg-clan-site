/**
 * Carte des ressources (docs/features/carte-ressources.md) : cartes, types de points, familles de véhicules observés,
 * repères de grille, regroupement des montées en emplacements et état affiché d'un point.
 *
 * Fichier pur, sans import `@/` : partagé par les routes, le cron d'agrégation, la page et les tests e2e.
 * Repère : mètres sur la carte (origine en haut à gauche, x vers l'est, y vers le sud), comme la télémétrie divisée
 * par 100.
 */

// --- Cartes ----------------------------------------------------------------------------------------------------------

export type ResourceMapDefinition = {
  /** Clé technique PUBG, aussi nom de l'image `public/maps/pubg/<key>.webp`. */
  key: string
  label: string
  /** Côté de la carte en mètres (bornes de la télémétrie, `position-heatmap.ts`). */
  sizeMeters: number
}

/** Cartes proposées, dans l'ordre du carrousel (maquette « Carte des ressources »). */
export const RESOURCE_MAPS: ResourceMapDefinition[] = [
  { key: 'Baltic_Main', label: 'Erangel', sizeMeters: 8192 },
  { key: 'Desert_Main', label: 'Miramar', sizeMeters: 8192 },
  { key: 'Tiger_Main', label: 'Taego', sizeMeters: 8192 },
  { key: 'DihorOtok_Main', label: 'Vikendi', sizeMeters: 8192 },
  { key: 'Savage_Main', label: 'Sanhok', sizeMeters: 4096 },
]

export function resourceMap(key: string | null | undefined): ResourceMapDefinition | null {
  return RESOURCE_MAPS.find((map) => map.key === key) ?? null
}

export function resourceMapImage(key: string) {
  return `/maps/pubg/${key}.webp`
}

/**
 * Repère de grille PUBG « D-M » : une lettre par kilomètre, colonnes A, B, C… d'ouest en est, lignes I, J, K… du nord
 * au sud (convention des cartes de 8 km ; appliquée telle quelle aux cartes plus petites — Sanhok : A–D × I–L).
 */
export function gridLabel(map: ResourceMapDefinition, x: number, y: number) {
  const columns = Math.max(1, Math.round(map.sizeMeters / 1000))
  const column = Math.min(columns - 1, Math.max(0, Math.floor(x / 1000)))
  const row = Math.min(columns - 1, Math.max(0, Math.floor(y / 1000)))
  return `${String.fromCharCode(65 + column)}-${String.fromCharCode(73 + row)}`
}

export function insideResourceMap(map: ResourceMapDefinition, x: number, y: number) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= map.sizeMeters && y <= map.sizeMeters
}

// --- Points saisis ---------------------------------------------------------------------------------------------------

export const RESOURCE_POINT_KINDS = ['fuel', 'garage', 'dock', 'secret_room'] as const
export type ResourcePointKind = (typeof RESOURCE_POINT_KINDS)[number]

export const RESOURCE_POINT_KIND_LABELS: Record<ResourcePointKind, { plural: string; singular: string }> = {
  fuel: { plural: 'Stations-service', singular: 'Station-service' },
  garage: { plural: 'Garages', singular: 'Garage' },
  dock: { plural: 'Pontons', singular: 'Ponton' },
  secret_room: { plural: 'Salles secrètes', singular: 'Salle secrète' },
}

export function parseResourcePointKind(value: unknown): ResourcePointKind | null {
  return typeof value === 'string' && (RESOURCE_POINT_KINDS as readonly string[]).includes(value) ? (value as ResourcePointKind) : null
}

/** Statut en base d'un point saisi. `removed` : retiré après un signalement « n'existe plus » validé. */
export type ResourcePointStatus = 'pending' | 'validated' | 'rejected' | 'removed'

/**
 * État affiché d'un point : validé, à confirmer (la carte a été marquée « à revérifier » après une mise à jour PUBG et
 * personne n'a cliqué « Toujours là » depuis), ou en attente de validation.
 */
export type ResourcePointState = 'validated' | 'to_confirm' | 'pending'

export function resourcePointState(
  point: { status: ResourcePointStatus; lastConfirmedAt: Date | string | null; validatedAt: Date | string | null },
  recheckSince: Date | string | null
): ResourcePointState | null {
  if (point.status === 'pending') return 'pending'
  if (point.status !== 'validated') return null
  if (!recheckSince) return 'validated'
  const since = new Date(recheckSince).getTime()
  const confirmed = Math.max(point.lastConfirmedAt ? new Date(point.lastConfirmedAt).getTime() : 0, point.validatedAt ? new Date(point.validatedAt).getTime() : 0)
  return confirmed >= since ? 'validated' : 'to_confirm'
}

// --- Signalements ----------------------------------------------------------------------------------------------------

export const RESOURCE_REPORT_KINDS = ['missing', 'misplaced', 'wrong_kind'] as const
export type ResourceReportKind = (typeof RESOURCE_REPORT_KINDS)[number]

export const RESOURCE_REPORT_KIND_LABELS: Record<ResourceReportKind, string> = {
  missing: 'N’existe plus',
  misplaced: 'Mal placé',
  wrong_kind: 'Mauvais type',
}

export function parseResourceReportKind(value: unknown): ResourceReportKind | null {
  return typeof value === 'string' && (RESOURCE_REPORT_KINDS as readonly string[]).includes(value) ? (value as ResourceReportKind) : null
}

/** Commentaire libre d'une proposition ou d'un signalement. */
export const RESOURCE_COMMENT_MAX = 280

// --- Véhicules observés ----------------------------------------------------------------------------------------------

export const OBSERVED_FAMILIES = ['car', 'moto', 'boat', 'glider', 'land'] as const
export type ObservedFamily = (typeof OBSERVED_FAMILIES)[number]

export const OBSERVED_FAMILY_LABELS: Record<ObservedFamily, string> = {
  car: 'Voitures',
  moto: 'Motos',
  boat: 'Bateaux',
  glider: 'Planeurs',
  // Parties analysées avant que le modèle du véhicule soit gardé (2026-10-05) : voiture ou moto, on ne sait pas.
  land: 'Voitures ou motos',
}

/** Familles techniques jamais montrées : avion de largage, véhicule d'évacuation, mortier. */
const EXCLUDED_VEHICLE_TYPES = new Set(['TransportAircraft', 'EmergencyPickup', 'Mortar'])

/**
 * Deux-roues et véhicules légers assimilés (modèle PUBG `vehicleId`, relevé sur les captures de télémétrie le
 * 2026-10-05) : motos (`Motorbike`, Ducati `PanigaleV4S`, Harley `RoadGlideST`, `Special_ElSolitario`,
 * `Special_FbrBike`), scooters, motocross, vélos, motoneiges, tuk-tuk et quad (`BP_ATV`). Les skins (`_LGD_C`,
 * `_ULT_C`, `_EP_C`, `_Esports_C`) ne changent que le suffixe.
 */
const MOTO_MODEL = /motorbike|panigale|roadglide|solitario|fbrbike|scooter|dirtbike|bicycle|snowmobile|tuktuk|motorcycle|(^|_)atv(_|$)/i
const BOAT_MODEL = /boat|aquarail|pg117|rubber/i
const GLIDER_MODEL = /glider/i

/**
 * Famille d'une montée, d'après la famille technique PUBG (`vehicleType`) et le modèle (`vehicleId`, gardé depuis le
 * 2026-10-05). Un véhicule à roues sans modèle connu reste « voiture ou moto ». `null` : à ignorer.
 */
export function classifyVehicle(vehicleType: string | null | undefined, vehicleId?: string | null): ObservedFamily | null {
  if (vehicleType && EXCLUDED_VEHICLE_TYPES.has(vehicleType)) return null
  if (vehicleType === 'FlyingVehicle' || (vehicleId && GLIDER_MODEL.test(vehicleId))) return 'glider'
  if (vehicleType === 'FloatingVehicle' || vehicleType === 'rubberboat' || (vehicleId && BOAT_MODEL.test(vehicleId))) return 'boat'
  if (vehicleType === 'WheeledVehicle' || (!vehicleType && vehicleId)) {
    if (!vehicleId) return 'land'
    return MOTO_MODEL.test(vehicleId) ? 'moto' : 'car'
  }
  return null
}

export type VehicleObservation = { matchId: string; family: ObservedFamily; x: number; y: number }

export type ObservedSpot = {
  family: ObservedFamily
  /** Centre de l'emplacement (moyenne des observations), en mètres. */
  x: number
  y: number
  observations: number
  /** Parties distinctes où un véhicule de cette famille a été trouvé ici. */
  matches: number
}

/** Taille d'une case de regroupement, et distance sous laquelle deux cases voisines forment un même emplacement. */
export const SPOT_CELL_METERS = 40
export const SPOT_MERGE_METERS = 90

/**
 * Regroupe les observations en emplacements, famille par famille : cases de 40 m, puis fusion des cases dont les
 * centres sont à moins de 90 m (en partant des cases les plus fournies). Déterministe.
 */
export function clusterObservations(observations: VehicleObservation[]): ObservedSpot[] {
  const spots: ObservedSpot[] = []
  const byFamily = new Map<ObservedFamily, VehicleObservation[]>()
  for (const observation of observations) {
    const list = byFamily.get(observation.family) ?? []
    list.push(observation)
    byFamily.set(observation.family, list)
  }

  for (const family of OBSERVED_FAMILIES) {
    const list = byFamily.get(family)
    if (!list?.length) continue
    type Cell = { sumX: number; sumY: number; observations: number; matches: Set<string> }
    const cells = new Map<string, Cell>()
    for (const observation of list) {
      const key = `${Math.floor(observation.x / SPOT_CELL_METERS)}:${Math.floor(observation.y / SPOT_CELL_METERS)}`
      const cell = cells.get(key) ?? { sumX: 0, sumY: 0, observations: 0, matches: new Set<string>() }
      cell.sumX += observation.x
      cell.sumY += observation.y
      cell.observations += 1
      cell.matches.add(observation.matchId)
      cells.set(key, cell)
    }

    const ordered = [...cells.entries()].sort((a, b) => b[1].observations - a[1].observations || a[0].localeCompare(b[0]))
    const groups: Cell[] = []
    for (const [, cell] of ordered) {
      const centerX = cell.sumX / cell.observations
      const centerY = cell.sumY / cell.observations
      const group = groups.find((candidate) => Math.hypot(candidate.sumX / candidate.observations - centerX, candidate.sumY / candidate.observations - centerY) <= SPOT_MERGE_METERS)
      if (group) {
        group.sumX += cell.sumX
        group.sumY += cell.sumY
        group.observations += cell.observations
        for (const match of cell.matches) group.matches.add(match)
      } else {
        groups.push({ sumX: cell.sumX, sumY: cell.sumY, observations: cell.observations, matches: new Set(cell.matches) })
      }
    }
    for (const group of groups) {
      spots.push({
        family,
        x: Math.round(group.sumX / group.observations),
        y: Math.round(group.sumY / group.observations),
        observations: group.observations,
        matches: group.matches.size,
      })
    }
  }
  return spots
}

/**
 * Seuils d'affichage d'un emplacement, relatifs à sa famille sur sa carte (mesure du 2026-10-05 : l'emplacement le plus
 * fréquent atteint 24–27 % des parties pour les véhicules à roues, mais 3,5 % au plus pour un bateau et 0,8–6,6 % pour
 * un planeur — un seuil unique de 5 % effaçait bateaux et planeurs). Un emplacement est montré s'il a servi dans au
 * moins 3 parties et 0,5 % d'entre elles, et au moins le quart de l'emplacement le plus fréquent de sa famille.
 */
export const SPOT_MIN_MATCHES = 3
export const SPOT_MIN_SHARE = 0.005
export const SPOT_RELATIVE_SHARE = 0.25

/** Part des parties analysées de la carte où l'emplacement a servi (0–1). */
export function spotShare(spot: Pick<ObservedSpot, 'matches'>, analysedMatches: number) {
  return analysedMatches > 0 ? Math.min(1, spot.matches / analysedMatches) : 0
}

/** Parties de l'emplacement le plus fréquent de chaque famille (une carte). */
export function topMatchesByFamily(spots: ReadonlyArray<{ family: string; matches: number }>) {
  const top = new Map<string, number>()
  for (const spot of spots) top.set(spot.family, Math.max(top.get(spot.family) ?? 0, spot.matches))
  return top
}

/** `familyTopMatches` : parties de l'emplacement le plus fréquent de la même famille sur la carte (`topMatchesByFamily`). */
export function isSpotShown(spot: Pick<ObservedSpot, 'matches'>, analysedMatches: number, familyTopMatches: number) {
  return (
    spot.matches >= SPOT_MIN_MATCHES &&
    spotShare(spot, analysedMatches) >= SPOT_MIN_SHARE &&
    spot.matches >= SPOT_RELATIVE_SHARE * familyTopMatches
  )
}

/** Fenêtre d'agrégation : les parties des 90 derniers jours (les montées sans modèle s'effacent d'elles-mêmes). */
export const OBSERVATION_WINDOW_DAYS = 90

// --- Drop zones -------------------------------------------------------------------------------------------------------

/** Rayon du filtre « Autour de nos drop zones ». */
export const DROP_ZONE_RADIUS_METERS = 800

export function isNear(point: { x: number; y: number }, centers: Array<{ x: number; y: number }>, radius = DROP_ZONE_RADIUS_METERS) {
  return centers.some((center) => Math.hypot(center.x - point.x, center.y - point.y) <= radius)
}
