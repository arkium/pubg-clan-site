import type { PlayerStatsEntry } from '@/types/leaderboard'

/**
 * Tri du classement du clan, côté client (docs/TODO/refonte-ui.md §4.A). L'API renvoie toutes les lignes de la période ;
 * trier par un en-tête ne recharge rien.
 *
 * Le rang suit toujours l'ordre **décroissant** du critère : en tri croissant, les médailles restent aux meilleurs
 * joueurs, affichés en bas. À égalité, l'ordre reçu de l'API est conservé (tri stable), comme `sortLeaderboard`
 * côté serveur.
 */

export type LeaderboardSortKey = 'kills' | 'matches' | 'kpm' | 'damage' | 'wins' | 'winRate' | 'timePlayed' | 'activeDays'
export type LeaderboardSortDirection = 'asc' | 'desc'

const number = new Intl.NumberFormat('fr-FR')
const decimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function formatPlayTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours} h ${String(minutes).padStart(2, '0')}`
}

export const formatInteger = (value: number) => number.format(Math.round(value))
export const formatKpm = (value: number) => decimal.format(value)
export const formatWinRate = (ratio: number) => `${percent.format(ratio * 100)} %`

export const LEADERBOARD_SORT_COLUMNS: Record<
  LeaderboardSortKey,
  { label: string; value: (entry: PlayerStatsEntry) => number; format: (entry: PlayerStatsEntry) => string }
> = {
  kills: { label: 'Kills', value: (e) => e.totalKills, format: (e) => formatInteger(e.totalKills) },
  matches: { label: 'Matchs', value: (e) => e.matchesPlayed, format: (e) => formatInteger(e.matchesPlayed) },
  kpm: { label: 'K/M', value: (e) => e.avgKillsPerGame, format: (e) => formatKpm(e.avgKillsPerGame) },
  damage: { label: 'Dégâts', value: (e) => e.totalDamage, format: (e) => formatInteger(e.totalDamage) },
  wins: { label: 'Top 1', value: (e) => e.matchesWon, format: (e) => formatInteger(e.matchesWon) },
  winRate: { label: 'Win rate', value: (e) => e.winRate, format: (e) => formatWinRate(e.winRate) },
  timePlayed: { label: 'Temps', value: (e) => e.timePlayedSeconds, format: (e) => formatPlayTime(e.timePlayedSeconds) },
  activeDays: { label: 'Jours actifs', value: (e) => e.activeDays, format: (e) => formatInteger(e.activeDays) },
}

export type Ranked<T> = { entry: T; rank: number }
export type RankedEntry = Ranked<PlayerStatsEntry>

/**
 * Lignes dans l'ordre d'affichage, chacune avec son rang : sa position dans l'ordre **décroissant** du critère. En tri
 * croissant, l'affichage s'inverse mais les médailles restent aux meilleurs. Tri stable : à égalité, l'ordre reçu.
 * Sert à tous les tableaux de classement (docs/TODO/refonte-ui.md §4.B).
 */
export function rankBy<T>(entries: readonly T[], value: (entry: T) => number, direction: LeaderboardSortDirection): Ranked<T>[] {
  const ranked = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => value(b.entry) - value(a.entry) || a.index - b.index)
    .map(({ entry }, index) => ({ entry, rank: index + 1 }))
  return direction === 'desc' ? ranked : ranked.reverse()
}

/** Classement du clan : `rankBy` sur la colonne choisie. */
export function rankLeaderboard(
  entries: readonly PlayerStatsEntry[],
  key: LeaderboardSortKey,
  direction: LeaderboardSortDirection
): RankedEntry[] {
  return rankBy(entries, LEADERBOARD_SORT_COLUMNS[key].value, direction)
}
