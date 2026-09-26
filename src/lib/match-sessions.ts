/**
 * Présentation des matchs du clan et d'une soirée (refonte du 2026-09-26, docs/features/matches.md) : bilan d'une
 * soirée, tonalité d'une place, répartition par mode, soirées voisines, libellés. Module pur, importable côté client.
 */

import { getPeriodRange, type Period } from '@/lib/period'
import type { SquadMatch } from '@/types/squad-matches'

export type TeamModeKey = 'duo' | 'trio' | 'squad'

export function teamModeOf(memberCount: number): TeamModeKey {
  if (memberCount <= 2) return 'duo'
  if (memberCount === 3) return 'trio'
  return 'squad'
}

/** Tonalité d'une place finale : or pour le top 1, vert jusqu'au top 5, bleu jusqu'au top 10. */
export type PlaceTone = 'gold' | 'pos' | 'sky' | 'neutral'

export function placeTone(place: number): PlaceTone {
  if (place === 1) return 'gold'
  if (place <= 5) return 'pos'
  if (place <= 10) return 'sky'
  return 'neutral'
}

/** Nombre décimal à la française (« 14,3 »). */
export function frDecimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',')
}

/** « 2 h 41 », « 41 min » (secondes). */
export function formatPlayTime(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

/** Parties dans l'ordre où elles ont été jouées. */
export function chronological<T extends Pick<SquadMatch, 'createdAt'>>(matches: readonly T[]): T[] {
  return [...matches].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export type SessionSummary = {
  games: number
  kills: number
  damage: number
  wins: number
  durationSeconds: number
  /** Meilleure place, première partie qui l'a atteinte. */
  best: { place: number; match: SquadMatch } | null
  averagePlace: number | null
  /** Début de la première partie, fin estimée de la dernière (début + durée). */
  start: string | null
  end: string | null
}

export function summarizeSession(matches: readonly SquadMatch[]): SessionSummary {
  const ordered = chronological(matches)
  let best: SessionSummary['best'] = null
  for (const match of ordered) {
    if (!best || match.placement < best.place) best = { place: match.placement, match }
  }
  const last = ordered.at(-1)
  return {
    games: ordered.length,
    kills: ordered.reduce((sum, match) => sum + match.totalKills, 0),
    damage: ordered.reduce((sum, match) => sum + match.totalDamage, 0),
    wins: ordered.filter((match) => match.isWin).length,
    durationSeconds: ordered.reduce((sum, match) => sum + match.durationSeconds, 0),
    best,
    averagePlace: ordered.length ? ordered.reduce((sum, match) => sum + match.placement, 0) / ordered.length : null,
    start: ordered[0]?.createdAt ?? null,
    end: last ? new Date(Date.parse(last.createdAt) + last.durationSeconds * 1000).toISOString() : null,
  }
}

export type ModeShare = { mode: TeamModeKey; games: number; kills: number; wins: number }

/** Parties par mode, dans l'ordre Duo, Trio, Squad ; les modes non joués sont absents. */
export function modeBreakdown(matches: readonly Pick<SquadMatch, 'members' | 'totalKills' | 'isWin'>[]): ModeShare[] {
  const modes: Record<TeamModeKey, ModeShare> = {
    duo: { mode: 'duo', games: 0, kills: 0, wins: 0 },
    trio: { mode: 'trio', games: 0, kills: 0, wins: 0 },
    squad: { mode: 'squad', games: 0, kills: 0, wins: 0 },
  }
  for (const match of matches) {
    const entry = modes[teamModeOf(match.members.length)]
    entry.games += 1
    entry.kills += match.totalKills
    entry.wins += match.isWin ? 1 : 0
  }
  return [modes.duo, modes.trio, modes.squad].filter((entry) => entry.games > 0)
}

const MODE_LABELS: Record<TeamModeKey, string> = { duo: 'duo', trio: 'trio', squad: 'squad' }

/** « 5 squad · 1 trio » — les modes les plus joués d'abord. */
export function modeSummaryText(matches: readonly Pick<SquadMatch, 'members' | 'totalKills' | 'isWin'>[]): string {
  return modeBreakdown(matches)
    .sort((a, b) => b.games - a.games)
    .map((entry) => `${entry.games} ${MODE_LABELS[entry.mode]}`)
    .join(' · ')
}

/** Carte du bandeau d'une soirée : celle de son premier top 1, sinon de sa première partie. */
export function sessionBannerMap(matches: readonly SquadMatch[]): string | null {
  const ordered = chronological(matches)
  return (ordered.find((match) => match.isWin) ?? ordered[0])?.mapName ?? null
}

/**
 * Soirées voisines pour le bandeau de navigation : dates triées de la plus récente à la plus ancienne, fenêtre de
 * `size` dates centrée sur la soirée courante, affichée de la plus ancienne à la plus récente.
 */
export function neighbourDates(datesNewestFirst: readonly string[], current: string, size = 5): string[] {
  const index = datesNewestFirst.indexOf(current)
  if (index < 0) return []
  const half = Math.floor(size / 2)
  let start = Math.max(0, index - half)
  const end = Math.min(datesNewestFirst.length, start + size)
  start = Math.max(0, end - size)
  return datesNewestFirst.slice(start, end).reverse()
}

/** Date d'une soirée (`AAAA-MM-JJ`) : jour et jour de semaine (« 26 », « sam. »), libellé complet. */
export function sessionDateParts(date: string): { day: string; weekday: string; full: string } {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  const full = value.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  return {
    day: String(day),
    weekday: value.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }),
    full: full.charAt(0).toUpperCase() + full.slice(1),
  }
}

/** Pastille de période du bandeau : « Septembre 2026 », « Semaine du 21 sept. ». */
export function periodChipLabel(period: Period, reference: Date = new Date()): string {
  const range = getPeriodRange(period, reference)
  if (!range) return 'Tout l’historique'
  if (period === 'week') {
    return `Semaine du ${range.start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
  }
  const label = range.start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Kills de chaque joueur d'une partie, en proportion du meilleur de la soirée (barres de la carte). */
export function killBars(
  members: readonly { displayName: string; kills: number }[],
  sessionMaxKills: number
): Array<{ name: string; kills: number; percent: number }> {
  return [...members]
    .sort((a, b) => b.kills - a.kills)
    .map((member) => ({
      name: member.displayName,
      kills: member.kills,
      percent: sessionMaxKills > 0 ? Math.round((member.kills / sessionMaxKills) * 100) : 0,
    }))
}

// ── Journée de jeu ───────────────────────────────────────────────────────────────────────────────

/** Heure (Paris) à laquelle commence une journée de jeu : une partie jouée avant compte dans la soirée de la veille. */
export const SESSION_DAY_START_HOUR = 6

const PARIS_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * Date de la soirée d'une partie (`AAAA-MM-JJ`), décision du 2026-09-26 : heure de Paris, journée de jeu commençant
 * à 06:00. Une soirée qui passe minuit reste entière, et une partie de 00:30 n'est plus rangée à la veille par l'UTC.
 * Source unique de toutes les pages de soirée (liste, soirée, pilotage de la télémétrie, récupérations, liens retour).
 */
export function sessionDateOf(createdAt: string | Date): string {
  const time = typeof createdAt === 'string' ? Date.parse(createdAt) : createdAt.getTime()
  return PARIS_DATE.format(new Date(time - SESSION_DAY_START_HOUR * 3_600_000))
}
