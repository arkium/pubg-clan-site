import { buildHomeTournaments, type HomeTournamentsPayload } from '@/lib/home-tournaments'
import { listTournamentOverviews } from '@/lib/tournament-overview'

/**
 * Tournois de la vitrine (`GET /api/home/tournaments`) — docs/features/accueil.md. La vitrine est publique : la réponse
 * est gardée en mémoire du process web pendant `HOME_TOURNAMENTS_CACHE_TTL_MS`, les appels simultanés partagent la même
 * lecture, et une lecture en échec n'est pas gardée (comme `home-showcase-service`).
 */

export const HOME_TOURNAMENTS_CACHE_TTL_MS = 5 * 60_000

let cache: { at: number; value: Promise<HomeTournamentsPayload> } | null = null

export function resetHomeTournamentsCache() {
  cache = null
}

export function getHomeTournaments(now: number = Date.now()): Promise<HomeTournamentsPayload> {
  if (cache && now - cache.at < HOME_TOURNAMENTS_CACHE_TTL_MS) return cache.value
  const value = listTournamentOverviews(new Date(now)).then(buildHomeTournaments)
  cache = { at: now, value }
  value.catch(() => {
    if (cache?.value === value) cache = null
  })
  return value
}
