import { sessionDateOf } from '@/lib/match-sessions'
import type { DashboardMatch } from '@/types/dashboard'

/**
 * Carnet de vol d'un joueur (`/members/[id]/matches`, docs/features/matchs-joueur.md) : chiffres clés, chronologie
 * paginée, barre des modes et soirées, calculés depuis `GET /api/members/[id]/matches?limit=all`. Module pur, testé
 * par `player-matches.test.ts`.
 */

/** Membres du clan dans l'équipe (comme la Soirée du clan) ; `solo` : aucun coéquipier du clan (« Sans le clan »). */
export type PlayerMode = 'duo' | 'trio' | 'squad' | 'solo'
export const PLAYER_MODES: readonly PlayerMode[] = ['duo', 'trio', 'squad', 'solo']
export const PLAYER_MODE_LABELS: Record<PlayerMode, string> = { duo: 'Duo', trio: 'Trio', squad: 'Squad', solo: 'Sans le clan' }

export const modeOf = (match: Pick<DashboardMatch, 'clanMode'>): PlayerMode => match.clanMode

export function parsePlayerMode(value: string | null | undefined): PlayerMode | null {
  return PLAYER_MODES.includes(value as PlayerMode) ? (value as PlayerMode) : null
}

export function filterByMode<T extends Pick<DashboardMatch, 'clanMode'>>(matches: readonly T[], mode: PlayerMode | null): T[] {
  return mode ? matches.filter((match) => modeOf(match) === mode) : [...matches]
}

/** Nombre de parties par mode, pour le menu (modes présents seulement, dans l'ordre du site). */
export function modeCounts(matches: readonly Pick<DashboardMatch, 'clanMode'>[]) {
  return PLAYER_MODES.map((mode) => ({ mode, count: matches.filter((match) => modeOf(match) === mode).length })).filter((entry) => entry.count > 0)
}

const byTime = (a: Pick<DashboardMatch, 'pubgCreatedAt'>, b: Pick<DashboardMatch, 'pubgCreatedAt'>) => a.pubgCreatedAt.localeCompare(b.pubgCreatedAt)

/** Meilleure partie : la meilleure place, puis le plus de kills, puis la plus récente. */
export function bestMatch<T extends DashboardMatch>(matches: readonly T[]): T | null {
  return [...matches].sort((a, b) => a.placement - b.placement || b.kills - a.kills || b.pubgCreatedAt.localeCompare(a.pubgCreatedAt))[0] ?? null
}

export function playerKpis(matches: readonly DashboardMatch[]) {
  const games = matches.length
  const kills = matches.reduce((sum, match) => sum + match.kills, 0)
  const damage = matches.reduce((sum, match) => sum + match.damageDealt, 0)
  return {
    games,
    kills,
    killsPerGame: games > 0 ? kills / games : 0,
    damage,
    damagePerGame: games > 0 ? damage / games : 0,
    best: bestMatch(matches),
    averagePlace: games > 0 ? matches.reduce((sum, match) => sum + match.placement, 0) / games : null,
    wins: matches.filter((match) => match.placement === 1).length,
    playSeconds: matches.reduce((sum, match) => sum + match.duration, 0),
  }
}

export type ModeShare = { mode: PlayerMode; games: number; kills: number; wins: number }

export function modeShares(matches: readonly DashboardMatch[]): ModeShare[] {
  return PLAYER_MODES.map((mode) => {
    const group = matches.filter((match) => modeOf(match) === mode)
    return { mode, games: group.length, kills: group.reduce((sum, match) => sum + match.kills, 0), wins: group.filter((match) => match.placement === 1).length }
  }).filter((share) => share.games > 0)
}

// ── Chronologie ──────────────────────────────────────────────────────────────────────────────────

export type ChronologyStep<T> = { match: T; session: string; firstOfSession: boolean }

/**
 * Une page de la chronologie : parties de la plus ancienne à la plus récente, `perPage` par page. Les pages se comptent
 * depuis la plus ancienne ; `page = null` ouvre la dernière (les plus récentes). Le découpage part des plus récentes :
 * la page ouverte est pleine, c'est la plus ancienne qui est incomplète (163 parties : 3, puis 16 pages de 10).
 */
export function chronologyPage<T extends DashboardMatch>(matches: readonly T[], page: number | null, perPage: number) {
  const ordered = [...matches].sort(byTime)
  const pageCount = Math.max(1, Math.ceil(ordered.length / perPage))
  const current = page === null ? pageCount : Math.min(Math.max(1, page), pageCount)
  const end = ordered.length - (pageCount - current) * perPage
  const start = Math.max(0, end - perPage)
  const visible = ordered.slice(start, end)
  const steps: ChronologyStep<T>[] = visible.map((match, index) => {
    const session = sessionDateOf(match.pubgCreatedAt)
    return { match, session, firstOfSession: index === 0 || sessionDateOf(visible[index - 1].pubgCreatedAt) !== session }
  })
  return { steps, page: current, pageCount, from: ordered.length ? start + 1 : 0, to: start + visible.length, total: ordered.length }
}

// ── Soirées ──────────────────────────────────────────────────────────────────────────────────────

export type PlayerSession<T> = {
  /** Journée de jeu (`sessionDateOf`, 06:00 à 06:00 heure de Paris). */
  date: string
  /** Dans l'ordre du jeu. */
  matches: T[]
  kills: number
  wins: number
  bestPlace: number
  start: string
  /** Fin de la dernière partie (début + durée). */
  end: string
}

/** Soirées, la plus récente d'abord. */
export function groupSessions<T extends DashboardMatch>(matches: readonly T[]): PlayerSession<T>[] {
  const byDate = new Map<string, T[]>()
  for (const match of [...matches].sort(byTime)) {
    const date = sessionDateOf(match.pubgCreatedAt)
    byDate.set(date, [...(byDate.get(date) ?? []), match])
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, games]) => {
      const last = games[games.length - 1]
      return {
        date,
        matches: games,
        kills: games.reduce((sum, match) => sum + match.kills, 0),
        wins: games.filter((match) => match.placement === 1).length,
        bestPlace: Math.min(...games.map((match) => match.placement)),
        start: games[0].pubgCreatedAt,
        end: new Date(Date.parse(last.pubgCreatedAt) + last.duration * 1000).toISOString(),
      }
    })
}

export const SESSIONS_PER_PAGE = 4

/** Page (à partir de 1) de la soirée `date` dans la liste des soirées, la plus récente d'abord ; 1 si absente. */
export function sessionPageOf(sessions: readonly Pick<PlayerSession<unknown>, 'date'>[], date: string | null, perPage = SESSIONS_PER_PAGE) {
  const index = date ? sessions.findIndex((session) => session.date === date) : -1
  return index < 0 ? 1 : Math.floor(index / perPage) + 1
}

/** Date de soirée lue dans l'URL (`?soiree=2026-09-26`) ; `null` si absente ou mal formée. */
export function parseSessionDate(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

// ── Carte de fin de partie ───────────────────────────────────────────────────────────────────────

export type TelemetryBadge = { tone: 'pos' | 'warn' | 'neg' | 'muted'; label: string; title: string }

export function telemetryBadge(status: DashboardMatch['telemetryStatus']): TelemetryBadge {
  switch (status) {
    case 'success':
      return { tone: 'pos', label: 'Télémétrie prête', title: 'Télémétrie analysée : débriefing disponible' }
    case 'expired':
      return { tone: 'muted', label: 'Télémétrie expirée', title: 'Donnée expirée côté PUBG (rétention d’environ 14 jours).' }
    case 'failed':
      return { tone: 'neg', label: 'Télémétrie en erreur', title: 'L’analyse a échoué : détail dans l’audit technique.' }
    case 'pending':
      return { tone: 'warn', label: 'Télémétrie en attente', title: 'Analyse en cours, revenir plus tard.' }
    default:
      return { tone: 'muted', label: 'Sans coéquipier du clan', title: 'Aucune partie de clan enregistrée : pas de télémétrie ni de débriefing.' }
  }
}
