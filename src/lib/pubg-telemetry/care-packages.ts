/**
 * Caisses de largage (care packages) extraites de la télémétrie PUBG.
 *
 * Trois événements, dont aucun ne porte d'identifiant exploitable pour relier les autres :
 * - `LogCarePackageSpawn` : largage, position au sol visée (z ≈ 30 000, en l'air) ;
 * - `LogCarePackageLand`  : atterrissage — **émis deux fois** par caisse (rebond, z différent) ;
 * - `LogItemPickupFromCarepackage` : pillage, `carePackageUniqueId` toujours à 0.
 * Le rapprochement se fait donc par type de caisse et par distance.
 *
 * Voir docs/telemetry/replay-trajectories.md.
 */

export type CarePackageType = 'redbox' | 'small' | 'bluechip' | 'vehicle' | 'other'

export type TelemetryCarePackage = {
  type: CarePackageType
  /** Identifiant brut, ex. `Carapackage_RedBox_C`, `BP_BRDM_C`. */
  packageId: string
  spawnTimestampSeconds: number | null
  /** Atterrissage. */
  timestampSeconds: number | null
  x: number
  y: number
  /** Contenu notable : armes et équipement niveau 3. */
  items: string[]
  /** Équipes ayant pillé la caisse, dans l'ordre de leur premier pillage. */
  lootTeamIds: number[]
  firstLootTimestampSeconds: number | null
}

type RawDrop = {
  packageId: string
  t: number | null
  x: number
  y: number
  items: string[]
}

type RawPickup = {
  packageId: string | null
  t: number | null
  x: number
  y: number
  teamId: number | null
}

export type CarePackageAccumulator = {
  spawns: RawDrop[]
  lands: RawDrop[]
  pickups: RawPickup[]
}

export const CARE_PACKAGE_EVENT_TYPES = new Set([
  'LogCarePackageSpawn',
  'LogCarePackageLand',
  'LogItemPickupFromCarepackage',
])

/** Deux atterrissages du même type à moins de 5 m sont la même caisse (rebond). */
const SAME_CRATE_RADIUS_UNITS = 500
/** Un pillage est rattaché à la caisse du même type la plus proche, à moins de 30 m. */
const LOOT_MATCH_RADIUS_UNITS = 3_000

export function createCarePackageAccumulator(): CarePackageAccumulator {
  return { spawns: [], lands: [], pickups: [] }
}

export function classifyCarePackage(packageId: string): CarePackageType {
  if (/redbox/i.test(packageId)) return 'redbox'
  if (/bluechip/i.test(packageId)) return 'bluechip'
  if (/smallpackage|carapackage|carepackage/i.test(packageId)) return 'small'
  if (/brdm|vehicle|uaz|dacia|buggy/i.test(packageId)) return 'vehicle'
  return 'other'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Garde les armes et l'équipement de niveau 3 : c'est ce qui fait l'intérêt d'une caisse. */
export function notableCarePackageItems(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  const notable = new Set<string>()
  for (const raw of items) {
    const item = asRecord(raw)
    const itemId = typeof item?.itemId === 'string' ? item.itemId : null
    if (!itemId) continue
    if (item?.category === 'Weapon' || /Lv3|Ghillie/i.test(itemId)) notable.add(itemId)
  }
  return Array.from(notable)
}

export function collectCarePackageEvent(
  accumulator: CarePackageAccumulator,
  event: Record<string, unknown>,
  eventType: string,
  timestampSeconds: number | null
) {
  if (eventType === 'LogItemPickupFromCarepackage') {
    const character = asRecord(event.character)
    const location = asRecord(character?.location)
    const x = finite(location?.x)
    const y = finite(location?.y)
    if (x === null || y === null) return
    accumulator.pickups.push({
      packageId: typeof event.carePackageName === 'string' ? event.carePackageName : null,
      t: timestampSeconds,
      x,
      y,
      teamId: finite(character?.teamId),
    })
    return
  }

  const itemPackage = asRecord(event.itemPackage)
  const location = asRecord(itemPackage?.location)
  const packageId = typeof itemPackage?.itemPackageId === 'string' ? itemPackage.itemPackageId : null
  const x = finite(location?.x)
  const y = finite(location?.y)
  if (!packageId || x === null || y === null) return

  const drop: RawDrop = { packageId, t: timestampSeconds, x, y, items: notableCarePackageItems(itemPackage?.items) }
  if (eventType === 'LogCarePackageSpawn') accumulator.spawns.push(drop)
  else if (eventType === 'LogCarePackageLand') accumulator.lands.push(drop)
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

const byTime = <T extends { t: number | null }>(left: T, right: T) =>
  (left.t ?? Number.POSITIVE_INFINITY) - (right.t ?? Number.POSITIVE_INFINITY)

export function buildCarePackages(accumulator: CarePackageAccumulator): TelemetryCarePackage[] {
  const crates: TelemetryCarePackage[] = []

  for (const land of [...accumulator.lands].sort(byTime)) {
    const duplicate = crates.some(
      (crate) => crate.packageId === land.packageId && distance(crate, land) <= SAME_CRATE_RADIUS_UNITS
    )
    if (duplicate) continue

    const spawn = accumulator.spawns
      .filter(
        (candidate) =>
          candidate.packageId === land.packageId &&
          distance(candidate, land) <= SAME_CRATE_RADIUS_UNITS &&
          (candidate.t === null || land.t === null || candidate.t <= land.t)
      )
      .sort(byTime)[0]

    crates.push({
      type: classifyCarePackage(land.packageId),
      packageId: land.packageId,
      spawnTimestampSeconds: spawn?.t ?? null,
      timestampSeconds: land.t,
      x: Math.round(land.x),
      y: Math.round(land.y),
      items: land.items.length > 0 ? land.items : spawn?.items ?? [],
      lootTeamIds: [],
      firstLootTimestampSeconds: null,
    })
  }

  for (const pickup of [...accumulator.pickups].sort(byTime)) {
    let nearest: TelemetryCarePackage | null = null
    let nearestDistance = LOOT_MATCH_RADIUS_UNITS
    for (const crate of crates) {
      if (pickup.packageId && crate.packageId !== pickup.packageId) continue
      if (pickup.t !== null && crate.timestampSeconds !== null && crate.timestampSeconds > pickup.t) continue
      const gap = distance(crate, pickup)
      if (gap <= nearestDistance) {
        nearest = crate
        nearestDistance = gap
      }
    }
    if (!nearest) continue

    if (pickup.teamId !== null && !nearest.lootTeamIds.includes(pickup.teamId)) {
      nearest.lootTeamIds.push(pickup.teamId)
    }
    if (pickup.t !== null && (nearest.firstLootTimestampSeconds === null || pickup.t < nearest.firstLootTimestampSeconds)) {
      nearest.firstLootTimestampSeconds = pickup.t
    }
  }

  return crates
}
