/**
 * Contrat des routes de l'entraînement au mortier (docs/features/mortier.md) — partagé par les routes, la page et les
 * tests e2e. Fichier pur, sans import `@/`.
 *
 *   POST /api/mortar/series                    { difficulty }          → MortarSeriesStart
 *   POST /api/mortar/series/:seriesId/finish   { shots: [{ setting, timeMs }] × 10 } → MortarSeriesFinish
 *   GET  /api/mortar/leaderboard?clanId=&difficulty=                    → MortarLeaderboard
 */
import type { MortarDifficulty, MortarSeriesScore } from './mortar-game'

/** Début de série : la graine fixe les dix cibles. Sans membre connecté, la série se joue sans enregistrement. */
export type MortarSeriesStart = {
  seriesId: string | null
  seed: string
  difficulty: MortarDifficulty
  /** `true` : la série sera enregistrée (membre connecté) ; `false` : visiteur, rien n'est gardé. */
  recorded: boolean
}

/** Fin de série enregistrée : score recalculé par le serveur à partir de la graine, record précédent du joueur. */
export type MortarSeriesFinish = {
  score: MortarSeriesScore
  /** Meilleur écart moyen du joueur à cette difficulté avant cette série ; `null` = première série. */
  previousBest: number | null
  isRecord: boolean
  /** Séries terminées par le joueur à cette difficulté, celle-ci comprise. */
  seriesCount: number
}

export type MortarLeaderboardRow = {
  rank: number
  memberId: number
  displayName: string
  /** Séries terminées à cette difficulté. */
  series: number
  /** Meilleur écart moyen (m), le plus bas en tête. */
  best: number
}

/** « Artilleurs du clan » : membres actifs du clan ayant terminé au moins une série à cette difficulté. */
export type MortarLeaderboard = {
  clanId: number
  difficulty: MortarDifficulty
  /** Les dix premiers. */
  rows: MortarLeaderboardRow[]
  /** Ligne du lecteur connecté s'il a joué, même hors des dix premiers ; `null` sinon. */
  viewer: MortarLeaderboardRow | null
}

/** Nombre de lignes du classement renvoyées. */
export const MORTAR_LEADERBOARD_SIZE = 10
