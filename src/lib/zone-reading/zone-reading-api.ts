/**
 * Contrat des routes de la Lecture de zone (docs/features/lecture-de-zone.md) — partagé par les routes, la page et les
 * tests e2e. Fichier pur, sans import `@/`.
 *
 *   GET  /api/zone-reading?map=&mode=&period=                         → ZoneReadingAnalysis (public)
 *   POST /api/zone-reading/series  { map, mode, period, clanId }       → ZoneReadingSeriesStart
 *   POST /api/zone-reading/series/:seriesId/guess  { round, step, x, y } → ZoneReadingGuessResult (membre)
 *   GET  /api/zone-reading/leaderboard?clanId=&map=                     → ZoneReadingLeaderboard (public)
 *
 * Coordonnées en mètres depuis le coin haut-gauche de la carte (`mapSizeMeters` de côté).
 */
import type { ZoneReadingAxisEntry, ZoneReadingStats } from './zone-reading-analysis'
import type { ZoneReadingRoundScore, ZoneReadingSeriesScore } from './zone-reading-game'
import type { Axis, Circle, FlightLine, Point } from './zone-reading-geometry'

/** Modes proposés : le site n'a presque aucune partie en solo (3 parties personnalisées le 2026-10-06). */
export const ZONE_READING_MODES = ['squad', 'duo'] as const
export type ZoneReadingMode = (typeof ZONE_READING_MODES)[number]
export const ZONE_READING_MODE_LABELS: Record<ZoneReadingMode, string> = { squad: 'Squad', duo: 'Duo' }

export function parseZoneReadingMode(value: unknown): ZoneReadingMode {
  return value === 'duo' ? 'duo' : 'squad'
}

export type ZoneReadingMapOption = { mapName: string; matches: number }

export type ZoneReadingAnalysis = {
  /** Carte affichée : celle demandée si elle a des parties, sinon la plus jouée ; `null` sans aucune partie. */
  mapName: string | null
  mapSizeMeters: number
  mode: ZoneReadingMode
  period: string
  /** Cartes ayant des parties pour ce mode et cette période, la plus jouée en tête. */
  mapOptions: ZoneReadingMapOption[]
  matchCount: number
  /** Date (ISO) de la plus ancienne partie analysée. */
  since: string | null
  threshold: number
  /** `false` sous le seuil : la page affiche le compteur à la place des chiffres. */
  ready: boolean
  stats: ZoneReadingStats | null
  /** Une entrée par partie, pour tourner et déplacer l'axe sans aller-retour serveur. */
  axes: ZoneReadingAxisEntry[]
  defaultAxis: Axis | null
  /** Nom de chacune des 64 cases (`row * 8 + col`), chaîne vide sans lieu proche. */
  cellLabels: string[]
}

/** Ce qu'une partie montre avant d'être jouée : ligne de vol si la partie se joue avec l'avion, et cercle 1. */
export type ZoneReadingRoundPublic = {
  index: number
  /** Date (ISO) de la partie rejouée. */
  matchDate: string
  mapName: string
  mode: ZoneReadingMode
  withPlane: boolean
  line: FlightLine | null
  circles: Circle[]
}

/** Partie complète : envoyée d'emblée à un visiteur, dont la série se joue sans enregistrement ni classement. */
export type ZoneReadingRoundFull = ZoneReadingRoundPublic & { line: FlightLine; circles: Circle[]; final: Point }

export type ZoneReadingSeriesStart = {
  seriesId: string | null
  /** `true` : membre connecté, chaque étape passe par le serveur ; `false` : visiteur, rien n'est gardé. */
  recorded: boolean
  mapName: string
  mapSizeMeters: number
  /** `clan` : parties du clan choisi ; `site` : pas assez de parties du clan, parties de tout le site. */
  source: 'clan' | 'site'
  rounds: ZoneReadingRoundPublic[] | ZoneReadingRoundFull[]
}

export type ZoneReadingReveal = {
  round: number
  line: FlightLine
  circles: Circle[]
  final: Point
  score: ZoneReadingRoundScore
}

export type ZoneReadingSeriesFinish = {
  score: ZoneReadingSeriesScore
  /** Meilleur écart moyen du joueur sur cette carte avant cette série ; `null` = première série. */
  previousBest: number | null
  isRecord: boolean
  /** Séries terminées par le joueur sur cette carte, celle-ci comprise. */
  seriesCount: number
}

/** Réponse à une étape : le cercle suivant, ou la révélation de la partie (et le bilan après la dixième). */
export type ZoneReadingGuessResult =
  | { kind: 'circle'; round: number; step: number; circle: Circle }
  | { kind: 'reveal'; reveal: ZoneReadingReveal; finish: ZoneReadingSeriesFinish | null }

export type ZoneReadingLeaderboardRow = {
  rank: number
  memberId: number
  displayName: string
  series: number
  /** Écart moyen (m) sur toutes ses séries terminées sur cette carte, le plus bas en tête. */
  average: number
}

export type ZoneReadingLeaderboard = {
  clanId: number
  mapName: string
  rows: ZoneReadingLeaderboardRow[]
  viewer: ZoneReadingLeaderboardRow | null
}

export const ZONE_READING_LEADERBOARD_SIZE = 10
