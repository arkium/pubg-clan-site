/**
 * Affichage de l'entraînement au mortier (`/mortier`, docs/features/mortier.md) : position des repères sur la carte,
 * textes du verdict, pastilles de la série, barres d'écart du bilan, curseur de distance.
 *
 * Fichier pur, sans import `@/` : la page et les tests e2e partagent les mêmes textes.
 */
import {
  MORTAR_MAP,
  MORTAR_RANGE,
  MORTAR_SHOT_TIME_BOUNDS,
  formatMeters,
  type MortarPoint,
  type MortarVerdict,
} from './mortar-game'

// --- Carte ---------------------------------------------------------------------------------------------------------

/** Cadre affiché, en mètres sur l'extrait `MORTAR_MAP` : toute la carte, ou un recadrage (illustrations du guide). */
export type MortarMapView = { x: number; y: number; width: number; height: number }

export const FULL_MORTAR_VIEW: MortarMapView = { x: 0, y: 0, width: MORTAR_MAP.width, height: MORTAR_MAP.height }

/** Position d'un point en pourcentage du cadre (gauche, haut). */
export function viewPercent(point: MortarPoint, view: MortarMapView = FULL_MORTAR_VIEW) {
  return {
    left: ((point.x - view.x) / view.width) * 100,
    top: ((point.y - view.y) / view.height) * 100,
  }
}

export type MortarLabelSide = 'above' | 'below' | 'left' | 'right'
/** Calage horizontal d'une étiquette posée au-dessus ou au-dessous : centrée, ou collée au repère près d'un bord. */
export type MortarLabelAlign = 'start' | 'center' | 'end'
export type MortarLabelPlacement = { side: MortarLabelSide; align: MortarLabelAlign }

/**
 * Place libre autour d'un repère, en pourcentage du cadre : une étiquette (≈ 20 px de haut, jusqu'à 90 px de large sur
 * une carte de 340 px) ne doit jamais sortir de la carte, qui la couperait.
 */
const LABEL_ROOM = { vertical: 16, horizontal: 30, edge: 15 } as const

function freeSides(point: MortarPoint, view: MortarMapView): Record<MortarLabelSide, boolean> {
  const { left, top } = viewPercent(point, view)
  return {
    above: top >= LABEL_ROOM.vertical,
    below: top <= 100 - LABEL_ROOM.vertical,
    left: left >= LABEL_ROOM.horizontal,
    right: left <= 100 - LABEL_ROOM.horizontal,
  }
}

function alignOf(point: MortarPoint, view: MortarMapView): MortarLabelAlign {
  const { left } = viewPercent(point, view)
  if (left < LABEL_ROOM.edge) return 'start'
  if (left > 100 - LABEL_ROOM.edge) return 'end'
  return 'center'
}

/**
 * Étiquette d'un repère, du côté opposé à l'autre repère (« Toi » et « Cible » ne se chevauchent jamais), sinon du
 * premier côté libre près d'un bord.
 */
export function labelPlacement(point: MortarPoint, away: MortarPoint | null, view: MortarMapView = FULL_MORTAR_VIEW): MortarLabelPlacement {
  const free = freeSides(point, view)
  const align = alignOf(point, view)
  if (!away) return { side: free.above ? 'above' : 'below', align }
  const dx = away.x - point.x
  const dy = away.y - point.y
  const fromX: MortarLabelSide = dx < 0 ? 'right' : 'left'
  const towardX: MortarLabelSide = dx < 0 ? 'left' : 'right'
  // Même verticale : à gauche d'abord ; même hauteur : au-dessus d'abord.
  const fromY: MortarLabelSide = dy < 0 ? 'below' : 'above'
  const towardY: MortarLabelSide = dy < 0 ? 'above' : 'below'
  const preferences = Math.abs(dx) >= Math.abs(dy) ? [fromX, fromY, towardY, towardX] : [fromY, fromX, towardX, towardY]
  return { side: preferences.find((side) => free[side]) ?? 'above', align }
}

/**
 * Étiquette « Impact » : l'impact est sur la ligne tireur → cible, son étiquette se met donc de travers (au-dessous
 * d'une ligne plutôt horizontale, à droite d'une ligne plutôt verticale), jamais du côté déjà pris par la cible.
 */
export function impactLabelPlacement(
  shooter: MortarPoint,
  target: MortarPoint,
  impact: MortarPoint,
  targetSide: MortarLabelSide,
  view: MortarMapView = FULL_MORTAR_VIEW
): MortarLabelPlacement {
  const free = freeSides(impact, view)
  const align = alignOf(impact, view)
  const horizontal = Math.abs(target.x - shooter.x) >= Math.abs(target.y - shooter.y)
  const across: MortarLabelSide[] = horizontal ? ['below', 'above'] : ['right', 'left']
  const along: MortarLabelSide[] = horizontal ? ['right', 'left'] : ['below', 'above']
  const side = [...across, ...along].find((candidate) => candidate !== targetSide && free[candidate])
  return { side: side ?? across[0], align }
}

// --- Verdict -------------------------------------------------------------------------------------------------------

/** « Au but », « Trop court de 18 m », « Trop long de 12 m ». */
export function verdictLabel(verdict: MortarVerdict, error: number) {
  if (verdict === 'hit') return 'Au but'
  return `${verdict === 'short' ? 'Trop court' : 'Trop long'} de ${formatMeters(Math.abs(error))}`
}

/** Dénivelé signé, « +20 m » / « −10 m ». */
export function formatElevation(elevation: number) {
  return formatMeters(elevation, { signed: true })
}

/** « Cible 20 m plus haute » / « Cible 10 m plus basse » ; `null` sur terrain plat. */
export function elevationLabel(elevation: number) {
  if (elevation === 0) return null
  return `Cible ${formatMeters(Math.abs(elevation))} plus ${elevation > 0 ? 'haute' : 'basse'}`
}

// --- Série ---------------------------------------------------------------------------------------------------------

export type MortarDotState = 'hit' | 'miss' | 'current' | 'pending'

/**
 * Les dix pastilles de la série : au but / raté pour les tirs faits, accent pour la cible en cours, neutre ensuite.
 * `current` : index de la cible affichée, `null` une fois la série terminée.
 */
export function seriesDots(verdicts: MortarVerdict[], current: number | null, total: number): MortarDotState[] {
  return Array.from({ length: total }, (_, index) => {
    if (index < verdicts.length) return verdicts[index] === 'hit' ? 'hit' : 'miss'
    return index === current ? 'current' : 'pending'
  })
}

/** Temps de visée d'une cible, de son affichage au tir : entier, borné comme le contrôle de la route de fin de série. */
export function aimTime(shownAt: number, firedAt: number) {
  return Math.min(MORTAR_SHOT_TIME_BOUNDS.max, Math.max(MORTAR_SHOT_TIME_BOUNDS.min, Math.round(firedAt - shownAt)))
}

// --- Bilan ---------------------------------------------------------------------------------------------------------

/** Échelle des barres d'écart du bilan (m) : le plus grand écart de la série, arrondi aux 5 m, 25 m au moins. */
export function deviationScale(errors: number[]) {
  const largest = errors.reduce((max, error) => Math.max(max, Math.abs(error)), 0)
  return Math.max(25, Math.ceil(largest / 5) * 5)
}

/** Longueur (0 à 1) de la barre d'un tir, de part et d'autre de l'axe central : à gauche trop court, à droite trop long. */
export function deviationBar(error: number, scale: number) {
  const ratio = Math.min(1, Math.abs(error) / Math.max(1, scale))
  return { short: error < 0 ? ratio : 0, long: error > 0 ? ratio : 0 }
}

// --- Curseur de distance -------------------------------------------------------------------------------------------

/** Repères sous le curseur. */
export const MORTAR_SLIDER_TICKS = [MORTAR_RANGE.min, 300, 500, MORTAR_RANGE.max] as const

/** Position d'une distance le long du curseur (0 à 100 %). */
export function sliderPercent(value: number) {
  return ((value - MORTAR_RANGE.min) / (MORTAR_RANGE.max - MORTAR_RANGE.min)) * 100
}

/** « 1 série », « 41 séries ». */
export function seriesCountLabel(count: number) {
  return `${count} série${count > 1 ? 's' : ''}`
}
