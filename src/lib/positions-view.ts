import { locationForPoint } from '@/lib/drop-zones-view'
import type { MapLocation } from '@/lib/map-location-service'
import type { PositionMetric } from '@/lib/position-metric-cells'

/**
 * Cartographie tactique « choisis un événement, lis la carte » (maquette « Positions », 2026-09-27 ;
 * docs/features/positions.md). Module pur, testé par `positions-view.test.ts`, partagé par la route (répartition par
 * joueur et par ville) et la page (épingles, zone chaude, rapport de force, « Qui … où »).
 */

export type HeatmapCell = { xIndex: number; yIndex: number; count: number }
export type MemberMetricCell = HeatmapCell & { memberKey: string; metric: PositionMetric }

export type PositionEventKey = 'kill' | 'ko' | 'damage' | 'shot' | 'revive' | 'vehicle' | 'death'

export type PositionEvent = {
  key: PositionEventKey
  label: string
  /** Couleur de l'événement, `r,g,b`. */
  rgb: string
  /** Événement ponctuel (pastilles dimensionnées) ou volume (halo lumineux). */
  dots: boolean
  /** Deux sens (Infligés / Reçus…) : chaque sens a sa métrique ; sinon une seule. */
  roles: Array<{ label: string; metric: PositionMetric; verb: string; description: string }>
}

export const POSITION_EVENTS: PositionEvent[] = [
  { key: 'kill', label: 'Kills', rgb: '250,204,21', dots: true, roles: [{ label: 'Kills', metric: 'kill', verb: 'fait ses kills', description: 'position du tueur au moment du kill' }] },
  {
    key: 'ko',
    label: 'KO',
    rgb: '251,146,60',
    dots: true,
    roles: [
      { label: 'Infligés', metric: 'knockout_dealt', verb: 'met à terre', description: 'position du joueur qui met à terre' },
      { label: 'Reçus', metric: 'knockout_taken', verb: 'se fait mettre à terre', description: 'position du membre mis à terre' },
    ],
  },
  {
    key: 'damage',
    label: 'Dégâts',
    rgb: '248,113,113',
    dots: false,
    roles: [
      { label: 'Infligés', metric: 'damage_dealt', verb: 'fait mal', description: 'là où le clan inflige des dégâts' },
      { label: 'Reçus', metric: 'damage_taken', verb: 'prend cher', description: 'là où le clan encaisse' },
    ],
  },
  { key: 'shot', label: 'Tirs', rgb: '192,132,252', dots: false, roles: [{ label: 'Tirs', metric: 'shot', verb: 'arrose', description: 'volume de tirs : plus c’est lumineux, plus ça tire' }] },
  {
    key: 'revive',
    label: 'Revives',
    rgb: '74,222,128',
    dots: true,
    roles: [
      { label: 'Donnés', metric: 'revive_given', verb: 'relève', description: 'position du membre qui relève' },
      { label: 'Reçus', metric: 'revive_received', verb: 'se fait relever', description: 'position du membre relevé' },
    ],
  },
  { key: 'vehicle', label: 'Véhicules', rgb: '34,211,238', dots: true, roles: [{ label: 'Véhicules', metric: 'vehicle', verb: 'prend la route', description: 'montées et descentes de véhicule' }] },
  { key: 'death', label: 'Morts', rgb: '251,113,133', dots: true, roles: [{ label: 'Morts', metric: 'death', verb: 'tombe', description: 'là où les membres du clan meurent' }] },
]

export const positionEvent = (key: PositionEventKey) => POSITION_EVENTS.find((event) => event.key === key)!

/** Libellé de l'événement et de son sens : « KO reçus », « Revives donnés », « Kills ». */
export function eventTitle(event: PositionEvent, roleIndex: number) {
  return event.roles.length > 1 ? `${event.label} ${event.roles[roleIndex].label.toLowerCase()}` : event.label
}

/** Centre d'une cellule de la grille, en % de la carte. */
export function cellCenter(cell: Pick<HeatmapCell, 'xIndex' | 'yIndex'>, gridSize: number) {
  return { xPct: ((cell.xIndex + 0.5) / gridSize) * 100, yPct: ((cell.yIndex + 0.5) / gridSize) * 100 }
}

export const totalOf = (cells: readonly HeatmapCell[]) => cells.reduce((sum, cell) => sum + cell.count, 0)

/** Répartition par ville (la cellule compte pour la ville qui contient son centre), plus le reste hors ville. */
export function locationCounts(cells: readonly HeatmapCell[], locations: readonly MapLocation[], gridSize: number) {
  const enabled = locations.filter((location) => location.enabled)
  const counts = new Map<string, number>()
  let outside = 0
  for (const cell of cells) {
    const location = locationForPoint(cellCenter(cell, gridSize), enabled)
    if (location) counts.set(location.id, (counts.get(location.id) ?? 0) + cell.count)
    else outside += cell.count
  }
  const total = totalOf(cells)
  const cities = enabled
    .filter((location) => (counts.get(location.id) ?? 0) > 0)
    .map((location) => ({ location, count: counts.get(location.id)!, share: total > 0 ? (counts.get(location.id)! / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count || a.location.name.localeCompare(b.location.name, 'fr'))
  return { cities, outside, total }
}

export type ForceVerdict = 'win' | 'even' | 'avoid'

/**
 * Rapport de force : kills du clan contre morts du clan, par ville (les 4 villes les plus disputées). « Terrain
 * gagnant » à partir de 1,3 kill par mort, « À éviter » sous 0,8.
 */
export function forceReport(kills: readonly HeatmapCell[], deaths: readonly HeatmapCell[], locations: readonly MapLocation[], gridSize: number, limit = 4) {
  const killsBy = new Map(locationCounts(kills, locations, gridSize).cities.map((city) => [city.location.id, city.count]))
  const deathsBy = new Map(locationCounts(deaths, locations, gridSize).cities.map((city) => [city.location.id, city.count]))
  return locations
    .filter((location) => location.enabled && ((killsBy.get(location.id) ?? 0) + (deathsBy.get(location.id) ?? 0)) > 0)
    .map((location) => {
      const k = killsBy.get(location.id) ?? 0
      const d = deathsBy.get(location.id) ?? 0
      const ratio = d > 0 ? k / d : k
      const verdict: ForceVerdict = ratio >= 1.3 ? 'win' : ratio < 0.8 ? 'avoid' : 'even'
      return { location, kills: k, deaths: d, ratio, verdict, killShare: (k / (k + d)) * 100 }
    })
    .sort((a, b) => b.kills + b.deaths - (a.kills + a.deaths) || a.location.name.localeCompare(b.location.name, 'fr'))
    .slice(0, limit)
}

export const FORCE_VERDICT_LABELS: Record<ForceVerdict, string> = { win: 'Terrain gagnant', even: 'Équilibré', avoid: 'À éviter' }

/** Taille d'une pastille (px) : racine du nombre, pour que 4× plus d'événements ne fassent pas 4× plus large. */
export function dotSize(count: number, maxCount: number, compact: boolean) {
  const base = compact ? 7 : 9
  const span = compact ? 12 : 16
  return base + Math.sqrt(maxCount > 0 ? count / maxCount : 0) * span
}

/** Intensité (0–1) d'un halo : échelle logarithmique, pour que les petites zones restent visibles. */
export function glowIntensity(count: number, maxCount: number) {
  return maxCount > 0 ? Math.log(1 + count) / Math.log(1 + maxCount) : 0
}

// ── Répartition par joueur (calculée par la route) ─────────────────────────────────────────────────

export type MemberBreakdown = {
  memberKey: string
  memberLabel: string
  totals: Partial<Record<PositionMetric, number>>
  /** Événements par ville : métrique → identifiant de ville → nombre. */
  byLocation: Partial<Record<PositionMetric, Record<string, number>>>
}

/** Totaux et villes de chaque joueur, depuis ses cellules (toutes métriques), pour « Qui … où » et le roi du coin. */
export function buildMemberBreakdown(
  cells: readonly MemberMetricCell[],
  locations: readonly MapLocation[],
  gridSize: number,
  labelOf: (memberKey: string) => string
): MemberBreakdown[] {
  const enabled = locations.filter((location) => location.enabled)
  const byMember = new Map<string, MemberBreakdown>()
  for (const cell of cells) {
    const entry = byMember.get(cell.memberKey) ?? { memberKey: cell.memberKey, memberLabel: labelOf(cell.memberKey), totals: {}, byLocation: {} }
    entry.totals[cell.metric] = (entry.totals[cell.metric] ?? 0) + cell.count
    const location = locationForPoint(cellCenter(cell, gridSize), enabled)
    if (location) {
      const perLocation = (entry.byLocation[cell.metric] ??= {})
      perLocation[location.id] = (perLocation[location.id] ?? 0) + cell.count
    }
    byMember.set(cell.memberKey, entry)
  }
  return Array.from(byMember.values()).sort((a, b) => a.memberLabel.localeCompare(b.memberLabel, 'fr'))
}

/** Le joueur qui compte le plus d'événements dans une ville (« Roi du coin », « Le plus touché »). */
export function kingOf(breakdown: readonly MemberBreakdown[], metric: PositionMetric, locationId: string) {
  let king: { memberKey: string; name: string; count: number } | null = null
  for (const member of breakdown) {
    const count = member.byLocation[metric]?.[locationId] ?? 0
    if (count > 0 && (!king || count > king.count)) king = { memberKey: member.memberKey, name: member.memberLabel, count }
  }
  return king
}

/** Carte « Qui … où » d'un joueur : nombre d'événements, ville n° 1, K/D (kills / morts) sur la carte. */
export function memberEventSummary(member: MemberBreakdown, metric: PositionMetric, locations: readonly MapLocation[]) {
  const perLocation = member.byLocation[metric] ?? {}
  const topId = Object.keys(perLocation).sort((a, b) => perLocation[b] - perLocation[a])[0]
  const top = topId ? locations.find((location) => location.id === topId) : undefined
  const kills = member.totals.kill ?? 0
  const deaths = member.totals.death ?? 0
  return {
    count: member.totals[metric] ?? 0,
    topLocation: top ? { name: top.name, count: perLocation[topId] } : null,
    kd: deaths > 0 ? kills / deaths : kills,
  }
}
