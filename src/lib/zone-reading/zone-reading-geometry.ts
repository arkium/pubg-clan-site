/**
 * Lecture de zone — géométrie pure (docs/features/lecture-de-zone.md) : distances à la ligne de vol, repère « viser la
 * ligne », axe d'une ligne (angle + décalage) pour retrouver les parties dont l'avion a suivi une ligne voisine.
 *
 * Unités : **mètres** depuis le coin haut-gauche de la carte, `x` vers l'est, `y` vers le sud (repère de la
 * télémétrie, divisé par 100). Fichier pur, sans import `@/` : partagé par les routes, la page et les tests e2e.
 */

export type Point = { x: number; y: number }
export type Circle = Point & { r: number }
/** Ligne de vol : deux points de l'axe de l'avion (en pratique ses points d'entrée et de sortie de carte). */
export type FlightLine = { start: Point; end: Point }

/**
 * Axe non orienté d'une ligne : angle trigonométrique dans `[0, 180)` (0 = vers l'est, 90 = vers le sud, l'axe `y`
 * pointant au sud) et décalage signé du centre de la carte, en mètres, le long de la normale `(-sin, cos)`.
 */
export type Axis = { angleDeg: number; offset: number }

/** Tolérances par défaut pour dire qu'une ligne de vol est « proche » de l'axe choisi. */
export const AXIS_ANGLE_TOLERANCE_DEG = 7
/** Décalage toléré, en part de la largeur de carte : ±492 m sur une carte de 8 km. */
export const AXIS_OFFSET_TOLERANCE_RATIO = 0.06
/** Décalage maximal d'un axe réglé à la main : la ligne coupe toujours la carte. */
export const AXIS_MAX_OFFSET_RATIO = 0.45

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export function distance(left: Point, right: Point) {
  return Math.hypot(right.x - left.x, right.y - left.y)
}

export function distanceToLine(point: Point, line: FlightLine) {
  const dx = line.end.x - line.start.x
  const dy = line.end.y - line.start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return distance(point, line.start)
  return Math.abs(dx * (point.y - line.start.y) - dy * (point.x - line.start.x)) / length
}

/** Point de la droite (prolongée) le plus proche de `point`. */
export function projectOnLine(point: Point, line: FlightLine): Point {
  const dx = line.end.x - line.start.x
  const dy = line.end.y - line.start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return { ...line.start }
  const t = ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / lengthSquared
  return { x: line.start.x + t * dx, y: line.start.y + t * dy }
}

/**
 * Repère « viser la ligne » d'un cercle : le point de la ligne de vol le plus proche de son centre. Quand la ligne
 * manque le cercle, le repère est ramené sur son bord, au plus près de la ligne — viser hors du cercle n'a pas de sens.
 */
export function lineReferencePoint(circle: Circle, line: FlightLine): Point {
  const foot = projectOnLine(circle, line)
  const gap = distance(circle, foot)
  if (gap <= circle.r || gap === 0) return foot
  return { x: circle.x + ((foot.x - circle.x) / gap) * circle.r, y: circle.y + ((foot.y - circle.y) / gap) * circle.r }
}

export function lineCrossesCircle(line: FlightLine, circle: Circle) {
  return distanceToLine(circle, line) <= circle.r
}

function normalizeAngle(angleDeg: number) {
  const normalized = ((angleDeg % 180) + 180) % 180
  return normalized === 180 ? 0 : normalized
}

function normalOf(angleDeg: number): Point {
  const radians = toRadians(angleDeg)
  return { x: -Math.sin(radians), y: Math.cos(radians) }
}

export function axisOfLine(line: FlightLine, mapSize: number): Axis {
  const angleDeg = normalizeAngle((Math.atan2(line.end.y - line.start.y, line.end.x - line.start.x) * 180) / Math.PI)
  const normal = normalOf(angleDeg)
  const center = mapSize / 2
  return { angleDeg, offset: (line.start.x - center) * normal.x + (line.start.y - center) * normal.y }
}

/** Écart entre deux axes, en tenant compte du repli à 180° (le décalage change alors de signe). */
export function axisGap(left: Axis, right: Axis) {
  let angle = right.angleDeg - left.angleDeg
  let offset = right.offset
  if (angle > 90) {
    angle -= 180
    offset = -offset
  } else if (angle < -90) {
    angle += 180
    offset = -offset
  }
  return { angle: Math.abs(angle), offset: Math.abs(offset - left.offset) }
}

export function isNearAxis(
  candidate: Axis,
  axis: Axis,
  mapSize: number,
  tolerance: { angleDeg?: number; offsetRatio?: number } = {}
) {
  const gap = axisGap(axis, candidate)
  return (
    gap.angle <= (tolerance.angleDeg ?? AXIS_ANGLE_TOLERANCE_DEG) &&
    gap.offset <= mapSize * (tolerance.offsetRatio ?? AXIS_OFFSET_TOLERANCE_RATIO)
  )
}

/** Axe tourné de `deltaDeg` (sens horaire à l'écran) ; le décalage suit le repli à 180°. */
export function rotateAxis(axis: Axis, deltaDeg: number): Axis {
  const raw = axis.angleDeg + deltaDeg
  const turns = Math.floor(raw / 180)
  return { angleDeg: normalizeAngle(raw), offset: turns % 2 === 0 ? axis.offset : -axis.offset }
}

export function clampAxisOffset(offset: number, mapSize: number) {
  const limit = mapSize * AXIS_MAX_OFFSET_RATIO
  return Math.max(-limit, Math.min(limit, offset))
}

/** Axe passant par `point` avec l'angle donné (glisser la ligne pour la déplacer). */
export function axisThrough(point: Point, angleDeg: number, mapSize: number): Axis {
  const normal = normalOf(angleDeg)
  const center = mapSize / 2
  return {
    angleDeg: normalizeAngle(angleDeg),
    offset: clampAxisOffset((point.x - center) * normal.x + (point.y - center) * normal.y, mapSize),
  }
}

/** Pied de l'axe : point de l'axe le plus proche du centre de la carte, pivot de la rotation. */
export function axisPivot(axis: Axis, mapSize: number): Point {
  const normal = normalOf(axis.angleDeg)
  return { x: mapSize / 2 + axis.offset * normal.x, y: mapSize / 2 + axis.offset * normal.y }
}

/** Segment de l'axe découpé par la carte carrée `[0, mapSize]²`, `null` si l'axe passe à côté. */
export function axisSegment(axis: Axis, mapSize: number): FlightLine | null {
  const pivot = axisPivot(axis, mapSize)
  const radians = toRadians(axis.angleDeg)
  const direction = { x: Math.cos(radians), y: Math.sin(radians) }
  let low = -Infinity
  let high = Infinity
  for (const [origin, delta] of [
    [pivot.x, direction.x],
    [pivot.y, direction.y],
  ] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < 0 || origin > mapSize) return null
      continue
    }
    const first = (0 - origin) / delta
    const second = (mapSize - origin) / delta
    low = Math.max(low, Math.min(first, second))
    high = Math.min(high, Math.max(first, second))
  }
  if (!(high > low)) return null
  return {
    start: { x: pivot.x + low * direction.x, y: pivot.y + low * direction.y },
    end: { x: pivot.x + high * direction.x, y: pivot.y + high * direction.y },
  }
}

const CARDINALS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'] as const
export type Cardinal = (typeof CARDINALS)[number]

/** Point cardinal (8 secteurs) d'un cap compas en degrés (0 = nord, 90 = est). */
export function cardinalOfHeading(headingDeg: number): Cardinal {
  const normalized = ((headingDeg % 360) + 360) % 360
  return CARDINALS[Math.round(normalized / 45) % 8]
}

/** Cap compas de l'axe, dans le sens où il est décrit (`[90, 270)` : l'axe va toujours vers le sud). */
export function axisHeading(axis: Axis) {
  return Math.round(axis.angleDeg + 90) % 360
}

/** Direction de `from` vers `to`, en point cardinal (« sud de School »). */
export function cardinalBetween(from: Point, to: Point): Cardinal {
  const heading = (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI
  return cardinalOfHeading(heading)
}

/** « vers le sud-est », « vers l'est », « vers l'ouest ». */
export function towardsCardinal(cardinal: Cardinal) {
  return cardinal === 'est' || cardinal === 'ouest' ? `vers l’${cardinal}` : `vers le ${cardinal}`
}
