/**
 * Filtres et tri de la liste publique des tournois (`/tournaments`), isolés de l'affichage pour être testables.
 */
import type { TournamentOverview, TournamentPhase } from '@/lib/tournament-overview'

export type TournamentStatusFilter = 'all' | Extract<TournamentPhase, 'live' | 'upcoming' | 'finished'>
export type TournamentSortKey = 'recent' | 'oldest' | 'title' | 'organizer'

export type TournamentListFilters = {
  search: string
  status: TournamentStatusFilter
  gameMode: string
  mapName: string
}

export const EMPTY_TOURNAMENT_FILTERS: TournamentListFilters = {
  search: '',
  status: 'all',
  gameMode: 'all',
  mapName: 'all',
}

export function hasActiveTournamentFilters(filters: TournamentListFilters) {
  return (
    filters.search.trim() !== '' ||
    filters.status !== 'all' ||
    filters.gameMode !== 'all' ||
    filters.mapName !== 'all'
  )
}

/** La recherche porte sur le titre, la description et le clan organisateur (nom comme tag). */
export function filterTournaments(
  tournaments: TournamentOverview[],
  filters: TournamentListFilters
): TournamentOverview[] {
  const needle = filters.search.trim().toLowerCase()

  return tournaments.filter((tournament) => {
    if (filters.status !== 'all' && tournament.phase !== filters.status) return false
    if (filters.gameMode !== 'all' && tournament.gameMode !== filters.gameMode) return false
    if (filters.mapName !== 'all' && tournament.mapName !== filters.mapName) return false
    if (!needle) return true

    return [tournament.title, tournament.description, tournament.organizerClan?.name, tournament.organizerClan?.tag]
      .filter((field): field is string => Boolean(field))
      .some((field) => field.toLowerCase().includes(needle))
  })
}

export function sortTournaments(
  tournaments: TournamentOverview[],
  key: TournamentSortKey
): TournamentOverview[] {
  return [...tournaments].sort((left, right) => {
    if (key === 'title') return left.title.localeCompare(right.title)
    if (key === 'organizer') return (left.organizerClan?.name ?? '').localeCompare(right.organizerClan?.name ?? '')
    const delta = new Date(right.startDate).getTime() - new Date(left.startDate).getTime()
    return key === 'oldest' ? -delta : delta
  })
}

/** Un brouillon reste avec le direct et les tournois à venir : il n'a pas sa place dans les archives. */
export function splitTournamentsByPhase(tournaments: TournamentOverview[]) {
  return {
    current: tournaments.filter((tournament) => tournament.phase !== 'finished'),
    archived: tournaments.filter((tournament) => tournament.phase === 'finished'),
  }
}
