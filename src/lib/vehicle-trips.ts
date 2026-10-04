/**
 * Véhicules de la cartographie tactique : on compte des **véhicules**, pas des passagers. Une montée compte quand le
 * véhicule est pris (aucun coéquipier déjà à bord), une descente quand le dernier coéquipier en sort — une montée et
 * une descente par véhicule. Décision et mesures : docs/features/positions.md §4.3.
 */

/**
 * Engins exclus : l'avion de largage (montée au départ puis saut, un tiers des échantillons, alignés sur la route de
 * l'avion), le planeur, le ballon d'évacuation et le mortier. La carte ne garde que ce qui roule ou flotte. Type
 * absent : conservé (aucun cas mesuré le 2026-10-04).
 */
export const EXCLUDED_POSITION_VEHICLE_TYPES: ReadonlySet<string> = new Set([
  'TransportAircraft',
  'FlyingVehicle',
  'EmergencyPickup',
  'Mortar',
])

export function countsAsPositionVehicle(vehicleType: unknown) {
  return typeof vehicleType !== 'string' || !EXCLUDED_POSITION_VEHICLE_TYPES.has(vehicleType)
}

/**
 * Déduction pour la télémétrie stockée sans `teammateAboard` (avant le 2026-10-04) : un coéquipier à bord d'un
 * véhicule du même type, monté (ou descendant plus tard) à moins de 100 m. Mesurée contre la liste réelle des
 * passagers sur 35 parties : total juste à ~1 %, ~12 % des événements mal classés un à un (passager pris en route
 * compté comme preneur, deux motos prises côte à côte comptées comme une).
 */
const SAME_VEHICLE_RADIUS = 10_000

export type VehicleTripSample = {
  memberKey: string
  action: 'ride' | 'leave'
  vehicleType?: unknown
  x: number
  y: number
  /** Vérité de la télémétrie (`fellowPassengers`) : un coéquipier est déjà à bord (montée) ou y reste (descente). */
  teammateAboard?: boolean
}

type Interval = { identity: string; type: unknown; ride: VehicleTripSample; rideIndex: number; leave: VehicleTripSample | null; leaveIndex: number }

/**
 * Pour chaque échantillon (dans l'ordre de la télémétrie), vrai s'il compte : montée d'un véhicule pris, ou descente
 * du dernier coéquipier à bord. Faux pour les engins exclus et pour les joueurs hors escouade (`identityOf` → `null`).
 * `identityOf` réunit les clés d'un même joueur (compte, pseudo) ; seuls ses coéquipiers servent à la déduction.
 */
export function vehicleTripFlags<T extends VehicleTripSample>(samples: T[], identityOf: (memberKey: string) => string | null) {
  const identities = samples.map((sample) => (countsAsPositionVehicle(sample.vehicleType) ? identityOf(sample.memberKey) : null))

  const intervals: Interval[] = []
  const open = new Map<string, Interval>()
  samples.forEach((sample, index) => {
    const identity = identities[index]
    if (!identity) return
    if (sample.action === 'ride') {
      const interval: Interval = { identity, type: sample.vehicleType, ride: sample, rideIndex: index, leave: null, leaveIndex: Number.POSITIVE_INFINITY }
      intervals.push(interval)
      open.set(identity, interval)
    } else {
      const interval = open.get(identity)
      if (interval) {
        interval.leave = sample
        interval.leaveIndex = index
        open.delete(identity)
      }
    }
  })

  const near = (a: VehicleTripSample, b: VehicleTripSample) => Math.hypot(a.x - b.x, a.y - b.y) <= SAME_VEHICLE_RADIUS
  return samples.map((sample, index) => {
    const identity = identities[index]
    if (!identity) return false
    if (typeof sample.teammateAboard === 'boolean') return !sample.teammateAboard
    const teammates = intervals.filter((interval) => interval.identity !== identity && interval.type === sample.vehicleType && interval.rideIndex < index)
    if (sample.action === 'ride') {
      return !teammates.some((interval) => interval.leaveIndex > index && near(interval.ride, sample))
    }
    return !teammates.some((interval) => interval.leave !== null && interval.leaveIndex > index && near(interval.leave, sample))
  })
}
