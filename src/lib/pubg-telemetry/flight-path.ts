import { getMapBounds } from './position-heatmap'

/**
 * Horaires de passage de l'avion, en secondes relatives au début du match.
 * Disponibles uniquement quand le plan de vol est calculé depuis les sauts :
 * les atterrissages ne donnent aucune information temporelle sur l'appareil.
 */
export type FlightTiming = {
  /** Passage au point `start` (bordure d'entrée). Peut être négatif ou postérieur au premier saut. */
  startT: number
  /** Passage au point `end` (bordure de sortie). */
  endT: number
  dropStartT: number
  dropEndT: number
  /** Vitesse sol mesurée entre le premier et le dernier saut — varie selon la carte. */
  speedMetersPerSecond: number
}

export type FlightPath = {
  /**
   * D'où vient l'axe : `jumps` = positions réelles de l'appareil au moment des sauts (fiable),
   * `landings` = axe déduit des points d'atterrissage, donc approximatif.
   */
  source: 'jumps' | 'landings'
  start: { x: number; y: number }
  end: { x: number; y: number }
  dropStart: { x: number; y: number }
  dropEnd: { x: number; y: number }
  /**
   * Angle trigonométrique de l'axe, compté depuis l'est dans le sens horaire
   * (l'axe `y` pointe vers le sud). Ce n'est **pas** un cap : voir `compassHeadingDeg`.
   */
  angleDeg: number
  timing: FlightTiming | null
}

type LandingPoint = { x: number; y: number; timestampSeconds: number }

/** Fenêtre après le premier atterrissage au-delà de laquelle on considère qu'il
 *  s'agit d'un rappel (puce bleue, évacuation) et non du largage initial. */
const INITIAL_DROP_WINDOW_SECONDS = 80

/**
 * Part minimale de la carte que doivent couvrir les points de largage pour qu'un axe déduit des
 * **atterrissages** soit publié.
 *
 * Mesuré le 2026-09-18 sur un match Paramo de tournoi : quatre joueurs sautés en 4 s atterrissent en grappe sur
 * 174 m, soit 5,7 % de la carte. L'axe extrapolé donnait -69°, contre -33° pour l'axe réel reconstitué depuis les
 * sauts : une droite tracée d'un bord à l'autre à partir de ce bruit est pire que pas de droite du tout.
 */
const MIN_LANDING_BASELINE_RATIO = 0.15

/**
 * Prolonge l'axe passant par deux points de largage jusqu'aux bordures de la carte.
 */
function extendToMapBorders(
  dropStart: { x: number; y: number },
  dropEnd: { x: number; y: number },
  mapName: string | undefined,
  source: FlightPath['source']
): FlightPath {
  const dx = dropEnd.x - dropStart.x
  const dy = dropEnd.y - dropStart.y
  const angleDeg = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI) * 10) / 10

  let entry = dropStart
  let exit = dropEnd

  if (mapName && (dx !== 0 || dy !== 0)) {
    const { width, height } = getMapBounds(mapName)
    const candidates: Array<{ t: number; x: number; y: number }> = []

    if (dx !== 0) {
      const tLeft = (0 - dropStart.x) / dx
      const yLeft = dropStart.y + tLeft * dy
      if (yLeft >= -1000 && yLeft <= height + 1000) {
        candidates.push({ t: tLeft, x: 0, y: Math.max(0, Math.min(height, yLeft)) })
      }
      const tRight = (width - dropStart.x) / dx
      const yRight = dropStart.y + tRight * dy
      if (yRight >= -1000 && yRight <= height + 1000) {
        candidates.push({ t: tRight, x: width, y: Math.max(0, Math.min(height, yRight)) })
      }
    }

    if (dy !== 0) {
      const tTop = (0 - dropStart.y) / dy
      const xTop = dropStart.x + tTop * dx
      if (xTop >= -1000 && xTop <= width + 1000) {
        candidates.push({ t: tTop, x: Math.max(0, Math.min(width, xTop)), y: 0 })
      }
      const tBottom = (height - dropStart.y) / dy
      const xBottom = dropStart.x + tBottom * dx
      if (xBottom >= -1000 && xBottom <= width + 1000) {
        candidates.push({ t: tBottom, x: Math.max(0, Math.min(width, xBottom)), y: height })
      }
    }

    if (candidates.length >= 2) {
      candidates.sort((left, right) => left.t - right.t)
      entry = { x: Math.round(candidates[0].x), y: Math.round(candidates[0].y) }
      const last = candidates[candidates.length - 1]
      exit = { x: Math.round(last.x), y: Math.round(last.y) }
    }
  }

  return { source, start: entry, end: exit, dropStart, dropEnd, angleDeg, timing: null }
}

/** Projection signée d'un point sur l'axe orienté `origin → origin + unit`. */
function projectOnAxis(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  unit: { x: number; y: number }
) {
  return (point.x - origin.x) * unit.x + (point.y - origin.y) * unit.y
}

/**
 * Trajectoire exacte de l'avion, reconstituée depuis les sauts hors de l'appareil.
 *
 * À privilégier sur `computeFlightPath` : chaque saut donne la position réelle de
 * l'avion à un instant donné, alors que les atterrissages dépendent de la distance
 * planée par chaque joueur et n'ordonnent donc pas fiablement la trajectoire.
 */
export function computeFlightPathFromJumps(
  jumps: Array<{ t: number; x: number; y: number }>,
  mapName?: string
): FlightPath | null {
  if (jumps.length < 2) return null

  const sorted = [...jumps].sort((left, right) => left.t - right.t)
  const dropStart = { x: Math.round(sorted[0].x), y: Math.round(sorted[0].y) }
  const dropEnd = {
    x: Math.round(sorted[sorted.length - 1].x),
    y: Math.round(sorted[sorted.length - 1].y),
  }

  if (dropStart.x === dropEnd.x && dropStart.y === dropEnd.y) return null

  return withFlightTiming(
    extendToMapBorders(dropStart, dropEnd, mapName, 'jumps'),
    sorted[0].t,
    sorted[sorted.length - 1].t
  )
}

/**
 * L'appareil vole en ligne droite à vitesse constante : chaque point de l'axe a donc
 * un horaire de passage, extrapolé depuis les instants où il survole `dropStart` et `dropEnd`.
 */
function withFlightTiming(path: FlightPath, dropStartT: number, dropEndT: number): FlightPath {
  const { dropStart, dropEnd } = path
  const lengthUnits = Math.hypot(dropEnd.x - dropStart.x, dropEnd.y - dropStart.y)
  if (dropEndT <= dropStartT || lengthUnits === 0) return path

  const unitsPerSecond = lengthUnits / (dropEndT - dropStartT)
  const unit = {
    x: (dropEnd.x - dropStart.x) / lengthUnits,
    y: (dropEnd.y - dropStart.y) / lengthUnits,
  }

  return {
    ...path,
    timing: {
      startT: dropStartT + projectOnAxis(path.start, dropStart, unit) / unitsPerSecond,
      endT: dropStartT + projectOnAxis(path.end, dropStart, unit) / unitsPerSecond,
      dropStartT,
      dropEndT,
      speedMetersPerSecond: Math.round(unitsPerSecond / 100),
    },
  }
}

export type RecallFlight = FlightPath & {
  timing: FlightTiming
  /** Joueurs rappelés par ce vol (sauts distincts). */
  riders: number
}

type AircraftPoint = { t: number; x: number; y: number; key: string; action: 'ride' | 'leave' }

/** Deux montées/sauts séparés de plus de 30 s appartiennent à deux avions de rappel différents. */
const RECALL_FLIGHT_GAP_SECONDS = 30

/**
 * Avions de rappel reconstitués depuis leurs embarquements (`ride`) et sauts (`leave`).
 *
 * Vérifié sur Karakin `cmu027vpd3ftl04tzlejla0vk` : la position d'un `ride` est bien celle
 * de l'appareil (même axe et même vitesse que les sauts, 53 m/s sur le vol de 661 s). Les
 * horodatages doivent rester **non arrondis** : un vol ne dure souvent que 3 à 12 s entre le
 * premier embarquement et le dernier saut, et un arrondi à la seconde fausserait la vitesse.
 * La trajectoire est ajustée par moindres carrés (position en fonction du temps), puis
 * prolongée jusqu'aux bordures pour animer l'entrée et la sortie de carte.
 */
export function computeRecallFlights(points: AircraftPoint[], mapName?: string): RecallFlight[] {
  const sorted = [...points].sort((left, right) => left.t - right.t)
  const clusters: AircraftPoint[][] = []
  for (const point of sorted) {
    const current = clusters[clusters.length - 1]
    if (current && point.t - current[current.length - 1].t <= RECALL_FLIGHT_GAP_SECONDS) {
      current.push(point)
    } else {
      clusters.push([point])
    }
  }

  const flights: RecallFlight[] = []
  for (const cluster of clusters) {
    const tMin = cluster[0].t
    const tMax = cluster[cluster.length - 1].t
    if (tMax - tMin < 0.5) continue

    const count = cluster.length
    const meanT = cluster.reduce((sum, point) => sum + point.t, 0) / count
    const meanX = cluster.reduce((sum, point) => sum + point.x, 0) / count
    const meanY = cluster.reduce((sum, point) => sum + point.y, 0) / count
    const varianceT = cluster.reduce((sum, point) => sum + (point.t - meanT) ** 2, 0)
    if (varianceT === 0) continue
    const vx = cluster.reduce((sum, point) => sum + (point.t - meanT) * (point.x - meanX), 0) / varianceT
    const vy = cluster.reduce((sum, point) => sum + (point.t - meanT) * (point.y - meanY), 0) / varianceT
    if (Math.hypot(vx, vy) === 0) continue

    const at = (t: number) => ({
      x: Math.round(meanX + vx * (t - meanT)),
      y: Math.round(meanY + vy * (t - meanT)),
    })
    const path = withFlightTiming(extendToMapBorders(at(tMin), at(tMax), mapName, 'jumps'), tMin, tMax)
    if (!path.timing) continue

    flights.push({
      ...path,
      timing: path.timing,
      riders: new Set(cluster.filter((point) => point.action === 'leave').map((point) => point.key)).size,
    })
  }

  return flights
}

/** Position de l'avion à l'instant `time`, ou `null` hors de sa fenêtre de survol. */
export function aircraftPositionAt(
  flight: Pick<FlightPath, 'start' | 'end' | 'timing'> | null,
  time: number
): { x: number; y: number } | null {
  const timing = flight?.timing
  if (!flight || !timing || timing.endT <= timing.startT) return null
  if (time < timing.startT || time > timing.endT) return null

  const ratio = (time - timing.startT) / (timing.endT - timing.startT)
  return {
    x: flight.start.x + (flight.end.x - flight.start.x) * ratio,
    y: flight.start.y + (flight.end.y - flight.start.y) * ratio,
  }
}

/** Cap compas (0° = nord, 90° = est) déduit de l'angle trigonométrique de l'axe. */
export function compassHeadingDeg(angleDeg: number): number {
  return (((Math.round(angleDeg + 90) % 360) + 360) % 360)
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const

/** Point cardinal français le plus proche d'un cap compas. */
export function compassCardinal(headingDeg: number): (typeof CARDINALS)[number] {
  const normalized = ((headingDeg % 360) + 360) % 360
  return CARDINALS[Math.round(normalized / 45) % 8]
}

/**
 * Reconstitue l'axe de survol du C-130 à partir des atterrissages en parachute,
 * puis l'extrapole jusqu'aux bordures de la carte. Repli utilisé quand les
 * événements de saut ne sont pas disponibles.
 */
export function computeFlightPath(landingSamples: unknown, mapName?: string): FlightPath | null {
  let parsed = landingSamples
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }

  if (!Array.isArray(parsed) || parsed.length < 2) {
    return null
  }

  const valid = parsed
    .filter((point): point is LandingPoint => {
      if (typeof point !== 'object' || point === null) return false
      const record = point as Record<string, unknown>
      return (
        typeof record.x === 'number' &&
        typeof record.y === 'number' &&
        typeof record.timestampSeconds === 'number'
      )
    })
    .sort((left, right) => left.timestampSeconds - right.timestampSeconds)

  if (valid.length < 2) {
    return null
  }

  const firstTimestamp = valid[0].timestampSeconds
  const initialLandings = valid.filter(
    (point) => point.timestampSeconds - firstTimestamp <= INITIAL_DROP_WINDOW_SECONDS
  )
  const samplePool = initialLandings.length >= 2 ? initialLandings : valid

  // Les 15 % extrêmes sont moyennés pour lisser le bruit, mais jamais au point que les deux extrémités se
  // recouvrent : avec deux ou trois atterrissages, chaque extrémité se réduit à un point.
  const sliceSize = Math.max(
    1,
    Math.min(Math.floor(samplePool.length * 0.15), Math.floor(samplePool.length / 2))
  )
  const earliest = samplePool.slice(0, sliceSize)
  const latest = samplePool.slice(-sliceSize)

  const dropStart = {
    x: Math.round(earliest.reduce((sum, point) => sum + point.x, 0) / earliest.length),
    y: Math.round(earliest.reduce((sum, point) => sum + point.y, 0) / earliest.length),
  }
  const dropEnd = {
    x: Math.round(latest.reduce((sum, point) => sum + point.x, 0) / latest.length),
    y: Math.round(latest.reduce((sum, point) => sum + point.y, 0) / latest.length),
  }

  // Garde-fou : une grappe d'atterrissages ne dit rien de l'axe réel. Mieux vaut aucun plan de vol qu'un faux.
  const baseline = Math.hypot(dropEnd.x - dropStart.x, dropEnd.y - dropStart.y)
  const mapWidth = getMapBounds(mapName ?? '').width
  if (baseline < mapWidth * MIN_LANDING_BASELINE_RATIO) {
    return null
  }

  return extendToMapBorders(dropStart, dropEnd, mapName, 'landings')
}
