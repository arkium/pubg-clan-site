/**
 * Lecture de zone — règles de l'entraînement « Où finit la zone ? » (docs/features/lecture-de-zone.md).
 *
 * Une série rejoue dix vraies parties. Pour chacune, le joueur voit le cercle 1 (et la ligne de vol une partie sur
 * deux), pose son marqueur là où il pense que la partie finira, puis dévoile les cercles 2, 3 et 4 en déplaçant son
 * marqueur s'il le veut. **Chaque étape est notée** : l'écart du marqueur à la zone finale au moment où le cercle
 * suivant se dévoile. Le score d'une partie est la moyenne des quatre écarts, comparée aux deux repères calculés sur
 * le même cercle — « en visant le centre » et « en visant la ligne » (`lineReferencePoint`). Noter seulement la
 * dernière étape (décision du 2026-10-06) aurait rendu le jeu trivial : après le cercle 4 la zone finale est à
 * quelques centaines de mètres, et les repères, eux, auraient été calculés sur le cercle 1.
 *
 * Fichier pur, sans import `@/` : partagé par les routes, la page et les tests e2e.
 */
import { distance, lineReferencePoint, type Circle, type FlightLine, type Point } from './zone-reading-geometry'

export const ZONE_READING_ROUNDS = 10
/** Étapes notées par partie : cercles 1 à 4. */
export const ZONE_READING_STEPS = 4
/** Une partie d'entraînement doit avoir les cercles 1 à 4 et au moins un cercle après eux (la zone finale). */
export const ZONE_READING_MIN_CIRCLES = ZONE_READING_STEPS + 1

/** Une partie sur deux sans la ligne de vol : la première avec, la deuxième sans, etc. Le bilan compare les deux. */
export function withPlaneForRound(index: number) {
  return index % 2 === 0
}

export type ZoneReadingRoundGeometry = { line: FlightLine; circles: Circle[]; final: Point }

export type ZoneReadingStepScore = {
  circle: number
  guess: Point
  center: Point
  linePoint: Point
  you: number
  centerError: number
  lineError: number
}

export type ZoneReadingRoundScore = {
  steps: ZoneReadingStepScore[]
  /** Écart moyen du joueur sur les quatre étapes (m, au dixième). */
  you: number
  /** Écart moyen en visant le centre de chaque cercle. */
  center: number
  /** Écart moyen en visant le point de la ligne le plus proche du centre. */
  line: number
}

const round1 = (value: number) => Math.round(value * 10) / 10
const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0)

export function scoreZoneReadingRound(round: ZoneReadingRoundGeometry, guesses: Point[]): ZoneReadingRoundScore {
  const steps = round.circles.slice(0, ZONE_READING_STEPS).map((circle, index) => {
    const guess = guesses[index] ?? guesses[guesses.length - 1] ?? circle
    const linePoint = lineReferencePoint(circle, round.line)
    return {
      circle: index + 1,
      guess,
      center: { x: circle.x, y: circle.y },
      linePoint,
      you: round1(distance(guess, round.final)),
      centerError: round1(distance(circle, round.final)),
      lineError: round1(distance(linePoint, round.final)),
    }
  })
  return {
    steps,
    you: round1(mean(steps.map((step) => step.you))),
    center: round1(mean(steps.map((step) => step.centerError))),
    line: round1(mean(steps.map((step) => step.lineError))),
  }
}

export type ZoneReadingRoundVerdict = 'both' | 'one' | 'none'

export function roundVerdict(score: Pick<ZoneReadingRoundScore, 'you' | 'center' | 'line'>): ZoneReadingRoundVerdict {
  const beaten = Number(score.you < score.center) + Number(score.you < score.line)
  return beaten === 2 ? 'both' : beaten === 1 ? 'one' : 'none'
}

export const ROUND_VERDICT_LABELS: Record<ZoneReadingRoundVerdict, string> = {
  both: 'Mieux que les deux repères',
  one: 'Un repère faisait mieux',
  none: 'Les deux repères faisaient mieux',
}

export type ZoneReadingRoundResult = { index: number; withPlane: boolean; you: number; center: number; line: number }

export type ZoneReadingSeriesScore = {
  rounds: ZoneReadingRoundResult[]
  meanError: number
  center: number
  line: number
  /** Parties où le joueur fait mieux que le repère « centre » / « ligne ». */
  betterThanCenter: number
  betterThanLine: number
  withPlane: { meanError: number | null; rounds: number }
  withoutPlane: { meanError: number | null; rounds: number }
}

export function scoreZoneReadingSeries(rounds: ZoneReadingRoundResult[]): ZoneReadingSeriesScore {
  const withPlane = rounds.filter((entry) => entry.withPlane)
  const withoutPlane = rounds.filter((entry) => !entry.withPlane)
  const meanOf = (entries: ZoneReadingRoundResult[]) => (entries.length ? round1(mean(entries.map((entry) => entry.you))) : null)
  return {
    rounds,
    meanError: round1(mean(rounds.map((entry) => entry.you))),
    center: round1(mean(rounds.map((entry) => entry.center))),
    line: round1(mean(rounds.map((entry) => entry.line))),
    betterThanCenter: rounds.filter((entry) => entry.you < entry.center).length,
    betterThanLine: rounds.filter((entry) => entry.you < entry.line).length,
    withPlane: { meanError: meanOf(withPlane), rounds: withPlane.length },
    withoutPlane: { meanError: meanOf(withoutPlane), rounds: withoutPlane.length },
  }
}

/** Position reçue d'un client : deux nombres finis dans la carte, sinon `null`. */
export function parseZoneReadingGuess(value: unknown, mapSize: number): Point | null {
  if (!value || typeof value !== 'object') return null
  const { x, y } = value as { x?: unknown; y?: unknown }
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null
  if (x < 0 || y < 0 || x > mapSize || y > mapSize) return null
  return { x: round1(x), y: round1(y) }
}

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** « 118 m », « 1 016 m ». */
export function formatDistance(meters: number) {
  return `${integer.format(Math.round(meters))} m`
}
