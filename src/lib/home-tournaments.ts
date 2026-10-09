/**
 * Tournois de la vitrine publique (`/`) — docs/features/accueil.md, « Tournois » (maquette Claude Design
 * « Accueil - Tournois », 2026-10-08). Module pur : à partir des résumés de `listTournamentOverviews`, ce que la vitrine
 * montre — le ou les tournois en direct avec leur top 3, les tournois qui commencent bientôt, et les résultats d'un
 * tournoi terminé depuis peu. Rien d'autre : sans aucun des trois, la vitrine n'affiche pas de tournoi.
 *
 * « En direct » suit la règle de la page `/tournaments` (`resolveTournamentPhase`) : un tournoi actif, entre sa date de
 * début et la fin de son dernier jour. Les brouillons n'apparaissent jamais.
 *
 * Les participants d'un tournoi sont des clans suivis ou leurs membres (`describeParticipant`) : aucun pseudo de
 * joueur extérieur au site ne peut sortir d'ici.
 */
import type { TournamentOverview } from '@/lib/tournament-overview'
import type { TournamentMode } from '@/lib/tournament-service'

/** Un tournoi à venir s'annonce sur la vitrine à partir de 14 jours avant son début (décision du 2026-10-08). */
export const HOME_UPCOMING_WINDOW_DAYS = 14
/** Les résultats d'un tournoi terminé restent 3 jours après son dernier jour (décision du 2026-10-08). */
export const HOME_RESULTS_WINDOW_DAYS = 3
/** Prochains tournois envoyés à la vitrine : trois pages de trois, parcourues par chevrons (le reste dans « Tous les tournois »). */
export const HOME_UPCOMING_LIMIT = 9
/** Lignes d'un classement (en cours ou final). */
export const HOME_LEADERS_LIMIT = 3

const DAY_MS = 86_400_000

export type HomeTournamentLeader = {
  key: string
  label: string
  points: number
}

export type HomeTournament = {
  id: string
  title: string
  mode: TournamentMode
  startDate: string
  endDate: string
  gameMode: string | null
  mapName: string | null
  organizerClan: { id: number; name: string; tag: string | null } | null
  /** Manches comptées jusqu'ici. */
  roundCount: number
  /** Participants classés, selon le mode : clans, équipes, joueurs ou escouades. */
  participantCount: number
  lastRoundAt: string | null
}

/** Tournoi en direct ou terminé : son classement (en cours ou final), trois premiers ayant marqué. */
export type HomeRankedTournament = HomeTournament & { leaders: HomeTournamentLeader[] }

export type HomeTournamentsPayload = {
  /** Tournois en direct, le plus animé d'abord (dernière manche la plus récente). */
  live: HomeRankedTournament[]
  /** Tournois qui commencent dans les `HOME_UPCOMING_WINDOW_DAYS` jours, le plus proche d'abord, au plus `HOME_UPCOMING_LIMIT`. */
  upcoming: HomeTournament[]
  /** Nombre de tournois dans cette fenêtre (pastille du lien « Tournois »). */
  upcomingCount: number
  /** Tournois terminés depuis moins de `HOME_RESULTS_WINDOW_DAYS` jours et qui ont un vainqueur, le plus récent d'abord. */
  results: HomeRankedTournament[]
}

function summarize(overview: TournamentOverview): HomeTournament {
  return {
    id: overview.id,
    title: overview.title,
    mode: overview.mode,
    startDate: overview.startDate,
    endDate: overview.endDate,
    gameMode: overview.gameMode,
    mapName: overview.mapName,
    organizerClan: overview.organizerClan,
    roundCount: overview.roundCount,
    participantCount: overview.participantCount,
    lastRoundAt: overview.lastRoundAt,
  }
}

function ranked(overview: TournamentOverview): HomeRankedTournament {
  return {
    ...summarize(overview),
    // Un participant sans point n'est pas « en tête » : pas de podium avant la première manche marquée.
    leaders: overview.leaders
      .filter((leader) => leader.totalPoints > 0)
      .slice(0, HOME_LEADERS_LIMIT)
      .map((leader) => ({ key: leader.key, label: leader.label, points: leader.totalPoints })),
  }
}

const time = (value: string | null) => (value ? new Date(value).getTime() : 0)

export function buildHomeTournaments(overviews: readonly TournamentOverview[], now: Date = new Date()): HomeTournamentsPayload {
  const nowMs = now.getTime()

  const live = overviews
    .filter((overview) => overview.phase === 'live')
    .sort((left, right) => time(right.lastRoundAt) - time(left.lastRoundAt) || time(left.startDate) - time(right.startDate))
    .map(ranked)

  const upcomingAll = overviews
    .filter((overview) => overview.phase === 'upcoming' && time(overview.startDate) - nowMs <= HOME_UPCOMING_WINDOW_DAYS * DAY_MS)
    .sort((left, right) => time(left.startDate) - time(right.startDate))

  // Fin d'un tournoi = la fin de son dernier jour (date à minuit) : on compte la fenêtre depuis le lendemain.
  const results = overviews
    .filter(
      (overview) =>
        overview.phase === 'finished' &&
        overview.winner !== null &&
        nowMs - time(overview.endDate) <= (HOME_RESULTS_WINDOW_DAYS + 1) * DAY_MS
    )
    .sort((left, right) => time(right.endDate) - time(left.endDate))
    .map(ranked)
    .filter((tournament) => tournament.leaders.length > 0)

  return {
    live,
    upcoming: upcomingAll.slice(0, HOME_UPCOMING_LIMIT).map(summarize),
    upcomingCount: upcomingAll.length,
    results,
  }
}

/** « 5 manches », « 1 manche », « Aucune manche » (le total prévu n'existe pas : un tournoi compte ce qui se joue). */
export function roundCountLabel(count: number) {
  if (count <= 0) return 'Aucune manche'
  return `${count} manche${count > 1 ? 's' : ''}`
}

/** La vitrine affiche-t-elle des tournois ? (section, ticket, pastille) */
export function hasHomeTournaments(payload: HomeTournamentsPayload | null) {
  return Boolean(payload && (payload.live.length > 0 || payload.upcoming.length > 0 || payload.results.length > 0))
}
