import {
  DROP_PRESSURE_LEVELS,
  summarizeDropPressure,
  type DropPressureLevel,
} from '@/lib/drop-zone-pressure'
import type { MapLocation } from '@/lib/map-location-service'

/**
 * Zones de drop « une question à la fois » (maquette « Zones de drop », 2026-09-27 ; docs/features/drop-zones.md) :
 * tout se calcule depuis les atterrissages (`points`) et les villes (`mapLocations`) déjà renvoyés par l'API. Module
 * pur, testé par `drop-zones-view.test.ts` ; partagé par la page du clan et celle d'un joueur.
 */

export type LandingPoint = {
  memberId: number
  memberName: string
  matchId: string
  mapName: string
  x: number
  y: number
  xPct: number
  yPct: number
  nearbyPlayerCount250m: number
  /** `null` si les équipes du lobby sont inconnues : le niveau retombe alors sur tous les joueurs. */
  nearbyOpponentCount250m?: number | null
  pressureLevel: DropPressureLevel
}

export const PRESSURE_ORDER: DropPressureLevel[] = ['calm', 'contested', 'hot', 'very_hot']

/** Phrase d'ambiance du spot favori, selon le niveau de sa pression moyenne. */
export const SPOT_MOODS: Record<DropPressureLevel, string> = {
  calm: 'Loot tranquille : on s’équipe avant le premier combat.',
  contested: 'Une ou deux escouades en face : premier fusil, premier servi.',
  hot: 'Hot drop : on saute pour se battre.',
  very_hot: 'Très chaud : ça tire avant même de toucher le sol.',
}

/** Palette des joueurs (pastilles, cartes « Qui saute où ») : stable pour un même identifiant. */
const MEMBER_COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#c084fc', '#2dd4bf', '#f97316']
export const memberColor = (memberId: number) => MEMBER_COLORS[Math.abs(memberId) % MEMBER_COLORS.length]

/** Effectif qui fixe la pression d'un saut : les adversaires, ou tous les joueurs si les équipes sont inconnues. */
export const pressureCountOf = (point: LandingPoint) => point.nearbyOpponentCount250m ?? point.nearbyPlayerCount250m

/** Ville d'un atterrissage : la plus proche dont le périmètre le contient ; `null` hors de toute ville. */
export function locationForPoint(point: Pick<LandingPoint, 'xPct' | 'yPct'>, locations: readonly MapLocation[]) {
  let closest: MapLocation | null = null
  let closestRatio = Number.POSITIVE_INFINITY
  for (const location of locations) {
    const ratio = Math.hypot(point.xPct - location.xPct, point.yPct - location.yPct) / location.radiusPct
    if (ratio <= 1 && ratio < closestRatio) {
      closest = location
      closestRatio = ratio
    }
  }
  return closest
}

/** Cartes où le clan a sauté sur la période, de la plus jouée à la moins jouée (ordre du sélecteur ‹ › et du glissé). */
export function mapsByJumps(points: readonly LandingPoint[]) {
  const counts = new Map<string, number>()
  for (const point of points) counts.set(point.mapName, (counts.get(point.mapName) ?? 0) + 1)
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([mapName]) => mapName)
}

/** Carte voisine dans la liste, en boucle. */
export function neighbourMap(maps: readonly string[], current: string, direction: 'prev' | 'next') {
  if (maps.length === 0) return null
  const index = Math.max(0, maps.indexOf(current))
  return maps[(index + (direction === 'next' ? 1 : -1) + maps.length) % maps.length]
}

/** Répartition des sauts sur les 4 niveaux de pression (parts en %, somme 100 quand il y a des sauts). */
export function pressureDistribution(points: readonly LandingPoint[]) {
  const counts: Record<DropPressureLevel, number> = { calm: 0, contested: 0, hot: 0, very_hot: 0 }
  for (const point of points) counts[point.pressureLevel] += 1
  return PRESSURE_ORDER.map((level) => ({
    level,
    ...DROP_PRESSURE_LEVELS[level],
    count: counts[level],
    share: points.length > 0 ? (counts[level] / points.length) * 100 : 0,
  }))
}

/** Profil de saut : répartition + moyenne, pire drop, part de hot drops (remplace les 7 compteurs). */
export function jumpProfile(points: readonly LandingPoint[]) {
  const summary = summarizeDropPressure([...points])
  return {
    jumps: points.length,
    matches: new Set(points.map((point) => point.matchId)).size,
    average: summary.average,
    maximum: summary.maximum,
    hotDropShare: summary.hotDropShare,
    distribution: pressureDistribution(points),
  }
}

function topMemberOf(points: readonly LandingPoint[]) {
  const counts = new Map<number, { memberId: number; name: string; count: number }>()
  for (const point of points) {
    const entry = counts.get(point.memberId) ?? { memberId: point.memberId, name: point.memberName, count: 0 }
    entry.count += 1
    counts.set(point.memberId, entry)
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))[0] ?? null
}

export type SpotStat = ReturnType<typeof spotStats>[number]

/** Villes où l'on a sauté, de la plus fréquentée à la moins fréquentée, avec leur pression et leur « roi ». */
export function spotStats(points: readonly LandingPoint[], locations: readonly MapLocation[]) {
  const enabled = locations.filter((location) => location.enabled)
  const byLocation = new Map<string, LandingPoint[]>()
  for (const point of points) {
    const location = locationForPoint(point, enabled)
    if (!location) continue
    const list = byLocation.get(location.id) ?? []
    list.push(point)
    byLocation.set(location.id, list)
  }
  return enabled
    .filter((location) => byLocation.has(location.id))
    .map((location) => {
      const spotPoints = byLocation.get(location.id)!
      const summary = summarizeDropPressure(spotPoints)
      return {
        location,
        count: spotPoints.length,
        share: points.length > 0 ? (spotPoints.length / points.length) * 100 : 0,
        matches: new Set(spotPoints.map((point) => point.matchId)).size,
        average: summary.average,
        hotDropShare: summary.hotDropShare,
        averageLevel: levelOfAverage(summary.average),
        distribution: pressureDistribution(spotPoints),
        king: topMemberOf(spotPoints),
      }
    })
    .sort((a, b) => b.count - a.count || a.location.name.localeCompare(b.location.name, 'fr'))
}

/** « Qui saute où » : une carte par joueur sur la carte affichée (sauts, pression moyenne, spot préféré). */
export function memberJumpSummaries(points: readonly LandingPoint[], locations: readonly MapLocation[]) {
  const byMember = new Map<number, LandingPoint[]>()
  for (const point of points) {
    const list = byMember.get(point.memberId) ?? []
    list.push(point)
    byMember.set(point.memberId, list)
  }
  return Array.from(byMember.entries())
    .map(([memberId, memberPoints]) => {
      const spots = spotStats(memberPoints, locations)
      const summary = summarizeDropPressure(memberPoints)
      return {
        memberId,
        name: memberPoints[0].memberName,
        jumps: memberPoints.length,
        average: summary.average,
        favorite: spots[0] ? { name: spots[0].location.name, count: spots[0].count } : null,
        level: levelOfAverage(summary.average),
      }
    })
    .sort((a, b) => b.jumps - a.jumps || a.name.localeCompare(b.name, 'fr'))
}

export function levelOfAverage(average: number): DropPressureLevel {
  const rounded = Math.round(average)
  if (rounded >= 16) return 'very_hot'
  if (rounded >= 8) return 'hot'
  if (rounded >= 3) return 'contested'
  return 'calm'
}

/**
 * Cadrage du gros plan « Spot favori » : position CSS (en %) d'un fond agrandi `zoom` fois pour que la ville soit au
 * centre de la carte, bornée aux bords de l'image.
 */
export function spotBackgroundPosition(xPct: number, yPct: number, zoom = 7) {
  const axis = (value: number) => Math.max(0, Math.min(100, (value * zoom - 50) / (zoom - 1)))
  return `${axis(xPct)}% ${axis(yPct)}%`
}
