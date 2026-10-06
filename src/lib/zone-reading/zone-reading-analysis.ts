/**
 * Lecture de zone — onglet Analyse, calculs purs (docs/features/lecture-de-zone.md).
 *
 * Chaque titre et chaque verdict de la page vient des chiffres : la maquette d'origine affirmait que « la zone finale
 * se termine presque toujours sur la ligne de vol », ce que les parties réelles démentent (mesure du 2026-10-06,
 * `scripts/measure-zone-reading.ts`). L'avion place le premier cercle ; ensuite, les cercles se déplacent au hasard.
 *
 * Unités : mètres (voir `zone-reading-geometry.ts`). Fichier pur, sans import `@/`.
 */
import {
  axisOfLine,
  cardinalBetween,
  distance,
  distanceToLine,
  isNearAxis,
  lineCrossesCircle,
  lineReferencePoint,
  type Axis,
  type Circle,
  type FlightLine,
  type Point,
} from './zone-reading-geometry'

/** En dessous, l'analyse d'une carte n'est pas affichée : quelques parties suffisent à fausser les écarts. */
export const ZONE_READING_MIN_MATCHES = 300
/** Demi-largeur de la bande tracée de part et d'autre de la ligne de vol. */
export const ZONE_READING_BAND_METERS = 200
/** Barres « Sens de fermeture » : du cercle 2 au cercle 8. */
export const ZONE_READING_CLOSING_CIRCLES = [2, 3, 4, 5, 6, 7, 8] as const
/** Tableau « La règle pratique » : du cercle 1 au cercle 4. */
export const ZONE_READING_RULE_CIRCLES = [1, 2, 3, 4] as const
/** Part au-delà de laquelle un cercle est dit « guidé » par l'avion (50 % = hasard). */
export const ZONE_READING_GUIDED_SHARE = 0.6
/** Part de parties où la ligne traverse le premier cercle au-delà de laquelle « l'avion place le premier cercle ». */
export const ZONE_READING_FIRST_CIRCLE_SHARE = 0.9
/** Grille « Où finit la zone » : 8 × 8 cases, lettres A–H en colonnes et I–P en lignes, comme la carte du jeu. */
export const ZONE_READING_GRID_CELLS = 8

export type ZoneReadingMatchGeometry = { line: FlightLine; circles: Circle[]; final: Point }

export type ZoneReadingClosingBar = { circle: number; share: number; total: number }
export type ZoneReadingRuleRow = { circle: number; center: number; line: number; total: number }

export type ZoneReadingStats = {
  matches: number
  /** Distance médiane entre la zone finale et la ligne de vol (m). */
  finalLineMedian: number
  /** Part des zones finales à moins de `ZONE_READING_BAND_METERS` de la ligne. */
  bandShare: number
  /** Même part en confrontant chaque zone finale à la ligne d'une autre partie : ce que donnerait le hasard. */
  bandRandomShare: number | null
  /** Part des parties où la ligne de vol traverse le premier cercle. */
  crossesFirstShare: number
  crossesFirstRandomShare: number | null
  /** Distance médiane du centre du premier cercle à la ligne (m). */
  firstCenterLineMedian: number
  closing: ZoneReadingClosingBar[]
  rule: ZoneReadingRuleRow[]
}

export function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const share = (part: number, total: number) => (total > 0 ? part / total : 0)

export function analyseZoneReading(matches: ZoneReadingMatchGeometry[]): ZoneReadingStats {
  const usable = matches.filter((match) => match.circles.length > 0)
  const finalDistances = usable.map((match) => distanceToLine(match.final, match.line))
  const firstDistances = usable.map((match) => distanceToLine(match.circles[0], match.line))
  const inBand = finalDistances.filter((value) => value <= ZONE_READING_BAND_METERS).length
  const crossesFirst = usable.filter((match) => lineCrossesCircle(match.line, match.circles[0])).length

  // Hasard : la zone finale (et le premier cercle) d'une partie face à la ligne de vol de la partie suivante.
  let randomBand = 0
  let randomCross = 0
  const randomTotal = usable.length >= 2 ? usable.length : 0
  for (let index = 0; index < randomTotal; index += 1) {
    const match = usable[index]
    const other = usable[(index + 1) % usable.length]
    if (distanceToLine(match.final, other.line) <= ZONE_READING_BAND_METERS) randomBand += 1
    if (lineCrossesCircle(other.line, match.circles[0])) randomCross += 1
  }

  const closing = ZONE_READING_CLOSING_CIRCLES.map((circle) => {
    let closer = 0
    let total = 0
    for (const match of usable) {
      const current = match.circles[circle - 1]
      const previous = match.circles[circle - 2]
      if (!current || !previous) continue
      total += 1
      if (distanceToLine(current, match.line) < distanceToLine(previous, match.line)) closer += 1
    }
    return { circle, share: share(closer, total), total }
  })

  const rule = ZONE_READING_RULE_CIRCLES.map((circle) => {
    const center: number[] = []
    const line: number[] = []
    for (const match of usable) {
      // Le cercle doit précéder la zone finale : un repère pris sur la zone finale elle-même ne prédit rien.
      if (match.circles.length <= circle) continue
      const reference = match.circles[circle - 1]
      center.push(distance(match.final, reference))
      line.push(distance(match.final, lineReferencePoint(reference, match.line)))
    }
    return { circle, center: median(center), line: median(line), total: center.length }
  })

  return {
    matches: usable.length,
    finalLineMedian: median(finalDistances),
    bandShare: share(inBand, usable.length),
    bandRandomShare: randomTotal ? share(randomBand, randomTotal) : null,
    crossesFirstShare: share(crossesFirst, usable.length),
    crossesFirstRandomShare: randomTotal ? share(randomCross, randomTotal) : null,
    firstCenterLineMedian: median(firstDistances),
    closing,
    rule,
  }
}

// ── Textes calculés ──────────────────────────────────────────────────────────────────

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/** « 1,2 sur 10 » : une part exprimée sur dix parties. */
export function formatOutOfTen(value: number) {
  return `${decimal.format(Math.round(value * 100) / 10)} sur 10`
}

/** Titre du bloc « L'avion et la zone » : la part des zones finales dans la bande, sur dix. */
export function bandHeadline(stats: Pick<ZoneReadingStats, 'bandShare'>) {
  const outOfTen = Math.round(stats.bandShare * 10)
  if (outOfTen === 0) return 'Moins d’une zone finale sur 10 finit dans cette bande'
  if (outOfTen === 1) return 'Seulement 1 zone finale sur 10 finit dans cette bande'
  const prefix = stats.bandShare < 0.5 ? 'Seulement ' : ''
  return `${prefix}${outOfTen} zones finales sur 10 finissent dans cette bande`
}

/** Phrase qui confronte la bande au hasard : la ligne attire-t-elle vraiment la zone finale ? */
export function bandExplanation(stats: Pick<ZoneReadingStats, 'bandShare' | 'bandRandomShare'>) {
  if (stats.bandRandomShare === null) return 'La bande couvre 200 m de chaque côté de la ligne de vol.'
  const random = formatOutOfTen(stats.bandRandomShare)
  if (stats.bandShare >= stats.bandRandomShare * 2 && stats.bandShare >= 0.5) {
    return `Au hasard, ce serait ${random} : la ligne de vol attire la zone finale.`
  }
  return `Au hasard, ${random} y tomberaient déjà : la ligne de vol donne le premier cercle, pas la zone finale.`
}

/** Nombre de cercles consécutifs, à partir du cercle 2, qui se rapprochent nettement de la ligne. */
export function guidedCircles(closing: ZoneReadingClosingBar[]) {
  let count = 0
  for (const bar of closing) {
    if (bar.total === 0 || bar.share < ZONE_READING_GUIDED_SHARE) break
    count += 1
  }
  return count
}

/** Verdict du bloc « Sens de fermeture ». */
export function closingVerdict(stats: Pick<ZoneReadingStats, 'closing' | 'crossesFirstShare'>) {
  const guided = guidedCircles(stats.closing)
  const placesFirst = stats.crossesFirstShare >= ZONE_READING_FIRST_CIRCLE_SHARE
  if (guided === stats.closing.length && guided > 0) return 'L’avion guide la zone jusqu’au bout.'
  if (placesFirst && guided === 0) return 'L’avion place le premier cercle. Ensuite, c’est le hasard.'
  if (placesFirst) return `L’avion guide les ${guided + 1} premiers cercles. Ensuite, c’est le hasard.`
  if (guided === 0) return 'Les cercles se déplacent au hasard autour de la ligne de vol.'
  return `L’avion guide les ${guided} cercles qui suivent le premier. Ensuite, c’est le hasard.`
}

export type ZoneReadingAim = 'center' | 'line'

export function bestAim(row: ZoneReadingRuleRow): ZoneReadingAim {
  return row.line < row.center ? 'line' : 'center'
}

const ordinal = (value: number) => (value === 1 ? '1er' : `${value}e`)

/** Règle pratique déduite du tableau : jusqu'à quel cercle viser la ligne, à partir duquel viser le centre. */
export function practicalRule(rows: ZoneReadingRuleRow[]) {
  const usable = rows.filter((row) => row.total > 0)
  if (usable.length === 0) return 'Pas assez de cercles pour dégager une règle.'
  const aims = usable.map(bestAim)
  const lineUntil = aims.findIndex((aim) => aim === 'center')
  const lineCount = lineUntil === -1 ? aims.length : lineUntil
  const consistent = aims.slice(lineCount).every((aim) => aim === 'center')
  if (!consistent) return 'Le meilleur repère change d’un cercle à l’autre : suis le tableau.'
  if (lineCount === 0) return 'Vise le centre du cercle, dès le premier. Viser la ligne de vol fait moins bien.'
  if (lineCount === aims.length) {
    return `Jusqu’au ${ordinal(usable[aims.length - 1].circle)} cercle, vise le point de la ligne de vol le plus proche du centre.`
  }
  const lastLine = usable[lineCount - 1].circle
  return `Jusqu’au ${ordinal(lastLine)} cercle, vise le point de la ligne de vol le plus proche du centre. À partir du ${ordinal(lastLine + 1)}, vise le centre.`
}

// ── Grille « Où finit la zone » ──────────────────────────────────────────────────────

export function gridCellOf(point: Point, mapSize: number) {
  const size = mapSize / ZONE_READING_GRID_CELLS
  const clamp = (value: number) => Math.max(0, Math.min(ZONE_READING_GRID_CELLS - 1, Math.floor(value / size)))
  return { col: clamp(point.x), row: clamp(point.y) }
}

/** Code de case façon carte du jeu : colonnes A–H, lignes I–P (« D-L »). */
export function gridCellCode(col: number, row: number) {
  return `${'ABCDEFGH'[col] ?? '?'}-${'IJKLMNOP'[row] ?? '?'}`
}

/** Fins de partie par case, indexées `row * 8 + col`. */
export function finalZoneGrid(finals: Point[], mapSize: number) {
  const counts = new Array<number>(ZONE_READING_GRID_CELLS * ZONE_READING_GRID_CELLS).fill(0)
  for (const point of finals) {
    const { col, row } = gridCellOf(point, mapSize)
    counts[row * ZONE_READING_GRID_CELLS + col] += 1
  }
  return counts
}

export type ZoneReadingTopCell = { index: number; col: number; row: number; code: string; count: number }

export function topGridCells(counts: number[], limit = 3): ZoneReadingTopCell[] {
  return counts
    .map((count, index) => {
      const col = index % ZONE_READING_GRID_CELLS
      const row = Math.floor(index / ZONE_READING_GRID_CELLS)
      return { index, col, row, code: gridCellCode(col, row), count }
    })
    .filter((cell) => cell.count > 0)
    .sort((left, right) => right.count - left.count || left.index - right.index)
    .slice(0, limit)
}

/** Taille d'une case en mètres : 1 km sur les cartes de 8 km, 500 m sur Sanhok. */
export function gridCellSizeMeters(mapSize: number) {
  return mapSize / ZONE_READING_GRID_CELLS
}

export type ZoneReadingPlace = { name: string; xPct: number; yPct: number; radiusPct: number }

/**
 * Nom d'une case : le lieu qui contient son centre (« Pochinki »), sinon la direction depuis le lieu le plus proche à
 * moins d'une case (« sud de School »), sinon rien.
 */
export function gridCellLabel(col: number, row: number, places: ZoneReadingPlace[]) {
  const cellPct = 100 / ZONE_READING_GRID_CELLS
  const center = { x: (col + 0.5) * cellPct, y: (row + 0.5) * cellPct }
  let nearest: { place: ZoneReadingPlace; gap: number } | null = null
  for (const place of places) {
    const gap = distance(center, { x: place.xPct, y: place.yPct }) - place.radiusPct
    if (gap <= 0) {
      if (!nearest || nearest.gap > 0 || gap < nearest.gap) nearest = { place, gap }
      continue
    }
    if (!nearest || (nearest.gap > 0 && gap < nearest.gap)) nearest = { place, gap }
  }
  if (!nearest) return ''
  if (nearest.gap <= 0) return nearest.place.name
  if (nearest.gap > cellPct) return ''
  const direction = cardinalBetween({ x: nearest.place.xPct, y: nearest.place.yPct }, center)
  return `${direction} de ${nearest.place.name}`
}

// ── Axes compacts, filtrés dans le navigateur ────────────────────────────────────────

/**
 * Une partie réduite à ce que la page filtre en direct : `[angle × 10, décalage (m), zone finale x (m), y (m)]`, en
 * entiers. Tourner ou déplacer l'axe ne demande ainsi aucun aller-retour serveur.
 */
export type ZoneReadingAxisEntry = [number, number, number, number]

export function encodeAxisEntry(match: ZoneReadingMatchGeometry, mapSize: number): ZoneReadingAxisEntry {
  const axis = axisOfLine(match.line, mapSize)
  // `|| 0` : pas de « -0 » dans le JSON.
  return [Math.round(axis.angleDeg * 10) || 0, Math.round(axis.offset) || 0, Math.round(match.final.x), Math.round(match.final.y)]
}

export function axisOfEntry(entry: ZoneReadingAxisEntry): Axis {
  return { angleDeg: entry[0] / 10, offset: entry[1] }
}

export function finalOfEntry(entry: ZoneReadingAxisEntry): Point {
  return { x: entry[2], y: entry[3] }
}

export function entriesNearAxis(entries: ZoneReadingAxisEntry[], axis: Axis, mapSize: number) {
  return entries.filter((entry) => isNearAxis(axisOfEntry(entry), axis, mapSize))
}

/**
 * Axe affiché par défaut : celui qui regroupe le plus de parties voisines (au plus 600 candidats examinés, répartis
 * régulièrement), pour que la carte montre d'emblée un cas fréquent plutôt qu'une ligne arbitraire.
 */
export function densestAxis(entries: ZoneReadingAxisEntry[], mapSize: number): Axis | null {
  if (entries.length === 0) return null
  const axes = entries.map(axisOfEntry)
  const step = Math.max(1, Math.floor(axes.length / 600))
  let best: { axis: Axis; count: number } | null = null
  for (let index = 0; index < axes.length; index += step) {
    const axis = axes[index]
    let count = 0
    for (const candidate of axes) if (isNearAxis(candidate, axis, mapSize)) count += 1
    if (!best || count > best.count) best = { axis, count }
  }
  return best?.axis ?? null
}
