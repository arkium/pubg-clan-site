/**
 * Tournois de la vitrine publique (`/`) — docs/features/accueil.md, « Tournois » (maquette Claude Design
 * « Accueil - Tournois », 2026-10-08). Module pur : à partir des résumés de `listTournamentOverviews`, ce que la vitrine
 * montre — le ou les tournois en direct avec leur top 3, les prochains tournois, et le dernier vainqueur quand rien
 * n'est prévu.
 *
 * « En direct » suit la règle de la page `/tournaments` (`resolveTournamentPhase`) : un tournoi actif, entre sa date de
 * début et la fin de son dernier jour. Les brouillons n'apparaissent jamais.
 *
 * Les participants d'un tournoi sont des clans suivis ou leurs membres (`describeParticipant`) : aucun pseudo de
 * joueur extérieur au site ne peut sortir d'ici.
 */
import type { TournamentOverview } from '@/lib/tournament-overview'
import type { TournamentMode } from '@/lib/tournament-service'

/** Prochains tournois envoyés à la vitrine (trois affichés, quelques-uns de plus pour « Ensuite » et « Puis »). */
export const HOME_UPCOMING_LIMIT = 4
/** Lignes du classement en cours. */
export const HOME_LEADERS_LIMIT = 3

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

export type HomeLiveTournament = HomeTournament & { leaders: HomeTournamentLeader[] }

export type HomeTournamentsPayload = {
  /** Tournois en direct, le plus animé d'abord (dernière manche la plus récente). */
  live: HomeLiveTournament[]
  /** Prochains tournois, le plus proche d'abord, au plus `HOME_UPCOMING_LIMIT`. */
  upcoming: HomeTournament[]
  /** Nombre total de tournois à venir (pastille du lien « Tournois »). */
  upcomingCount: number
  /** Vainqueur du dernier tournoi terminé, pour l'état « aucun tournoi prévu ». */
  lastWinner: { tournamentId: string; title: string; label: string } | null
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

const time = (value: string | null) => (value ? new Date(value).getTime() : 0)

export function buildHomeTournaments(overviews: readonly TournamentOverview[]): HomeTournamentsPayload {
  const live = overviews
    .filter((overview) => overview.phase === 'live')
    .sort((left, right) => time(right.lastRoundAt) - time(left.lastRoundAt) || time(left.startDate) - time(right.startDate))
    .map((overview) => ({
      ...summarize(overview),
      // Un participant sans point n'est pas encore « en tête » : la vitrine attend la première manche.
      leaders: overview.leaders
        .filter((leader) => leader.totalPoints > 0)
        .slice(0, HOME_LEADERS_LIMIT)
        .map((leader) => ({ key: leader.key, label: leader.label, points: leader.totalPoints })),
    }))

  const upcomingAll = overviews
    .filter((overview) => overview.phase === 'upcoming')
    .sort((left, right) => time(left.startDate) - time(right.startDate))

  const lastFinished = overviews
    .filter((overview) => overview.phase === 'finished' && overview.winner)
    .sort((left, right) => time(right.endDate) - time(left.endDate))[0]

  return {
    live,
    upcoming: upcomingAll.slice(0, HOME_UPCOMING_LIMIT).map(summarize),
    upcomingCount: upcomingAll.length,
    lastWinner: lastFinished?.winner
      ? { tournamentId: lastFinished.id, title: lastFinished.title, label: lastFinished.winner.label }
      : null,
  }
}

/** « 5 manches », « 1 manche », « Aucune manche » (le total prévu n'existe pas : un tournoi compte ce qui se joue). */
export function roundCountLabel(count: number) {
  if (count <= 0) return 'Aucune manche'
  return `${count} manche${count > 1 ? 's' : ''}`
}
