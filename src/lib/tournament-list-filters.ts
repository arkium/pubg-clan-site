/**
 * Filtres et répartition de la liste publique des tournois (`/tournaments`), isolés de l'affichage pour être
 * testables. Refonte du 2026-09-27 (maquette « Tournois ») : recherche, statut et **mode** ; les filtres Format, Carte
 * et le tri ont disparu, la liste se lit en trois temps — en direct, à venir, palmarès.
 */
import { TOURNAMENT_MODE_DESCRIPTIONS } from '@/lib/tournament-guide'
import type { TournamentOverview, TournamentPhase } from '@/lib/tournament-overview'
// Types seulement : `tournament-service` importe Prisma, cette liste est aussi utilisée côté navigateur.
import type { TournamentMode } from '@/lib/tournament-service'

export type TournamentStatusFilter = 'all' | Extract<TournamentPhase, 'live' | 'upcoming' | 'finished'>

export type TournamentListFilters = {
  search: string
  status: TournamentStatusFilter
  /** `null` : tous les modes. */
  mode: TournamentMode | null
}

export const EMPTY_TOURNAMENT_FILTERS: TournamentListFilters = { search: '', status: 'all', mode: null }

export const TOURNAMENT_STATUS_OPTIONS: Array<{ value: TournamentStatusFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'live', label: 'En direct' },
  { value: 'upcoming', label: 'À venir' },
  { value: 'finished', label: 'Terminés' },
]

export function hasActiveTournamentFilters(filters: TournamentListFilters) {
  return filters.search.trim() !== '' || filters.status !== 'all' || filters.mode !== null
}

/** Un brouillon est annoncé avec les tournois à venir : il n'a encore rien joué. */
function statusOf(phase: TournamentPhase): Exclude<TournamentStatusFilter, 'all'> {
  return phase === 'draft' ? 'upcoming' : phase
}

/** La recherche porte sur le titre, la description, le clan organisateur et le vainqueur (« Tournoi ou clan »). */
function matchesSearch(tournament: TournamentOverview, needle: string) {
  if (!needle) return true
  return [
    tournament.title,
    tournament.description,
    tournament.organizerClan?.name,
    tournament.organizerClan?.tag,
    tournament.winner?.label,
    ...(tournament.winner?.clanTags ?? []),
  ]
    .filter((field): field is string => Boolean(field))
    .some((field) => field.toLowerCase().includes(needle))
}

/** Recherche et statut seulement : base du compteur des cartes de mode. */
export function filterBySearchAndStatus(tournaments: TournamentOverview[], filters: TournamentListFilters) {
  const needle = filters.search.trim().toLowerCase()
  return tournaments.filter(
    (tournament) =>
      (filters.status === 'all' || statusOf(tournament.phase) === filters.status) && matchesSearch(tournament, needle)
  )
}

export function filterTournaments(tournaments: TournamentOverview[], filters: TournamentListFilters) {
  return filterBySearchAndStatus(tournaments, filters).filter(
    (tournament) => filters.mode === null || tournament.mode === filters.mode
  )
}

/** Tournois par mode, pour les cartes qui servent à la fois de légende et de filtre. */
export function countTournamentsByMode(tournaments: TournamentOverview[]): Record<TournamentMode, number> {
  const counts = Object.fromEntries(TOURNAMENT_MODE_DESCRIPTIONS.map(({ value }) => [value, 0])) as Record<TournamentMode, number>
  for (const tournament of tournaments) counts[tournament.mode] += 1
  return counts
}

const byStart = (left: TournamentOverview, right: TournamentOverview) =>
  new Date(left.startDate).getTime() - new Date(right.startDate).getTime()

/**
 * Les trois temps de la page : en direct (le plus ancien d'abord, il finit le premier), à venir (le plus proche
 * d'abord, brouillons compris) et palmarès (le plus récent d'abord).
 */
export function splitTournamentsByPhase(tournaments: TournamentOverview[]) {
  return {
    live: tournaments.filter((tournament) => tournament.phase === 'live').sort(byStart),
    upcoming: tournaments.filter((tournament) => statusOf(tournament.phase) === 'upcoming').sort(byStart),
    finished: tournaments
      .filter((tournament) => tournament.phase === 'finished')
      .sort((left, right) => byStart(right, left)),
  }
}

/** Compteurs du bandeau d'image : « 1 en direct · 3 à venir · 14 terminés ». */
export function countTournamentsByPhase(tournaments: TournamentOverview[]) {
  const split = splitTournamentsByPhase(tournaments)
  return { live: split.live.length, upcoming: split.upcoming.length, finished: split.finished.length }
}
