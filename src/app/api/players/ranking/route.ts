import { isAuthDisabled } from '@/lib/auth-mode'
import { getSessionFromRequest } from '@/lib/auth-session'
import { parsePeriod, STANDARD_PERIODS } from '@/lib/period'
import { parsePlayersMode } from '@/lib/players-ranking'
import { getPlayersRanking } from '@/lib/players-ranking-service'

/**
 * Classement inter-clans des joueurs (page `/players`, docs/features/joueurs.md) : `?period=week|month|all&mode=duo|squad|all`.
 * Lecture réservée aux utilisateurs connectés, ou ouverte à tous en mode visiteur (DISABLE_AUTH_PERMISSIONS) — même
 * règle que les tournois : le proxy ne protège que les pages, pas `/api`.
 */
export async function GET(request: Request) {
  if (!(await getSessionFromRequest(request)) && !isAuthDisabled()) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  try {
    return Response.json(await getPlayersRanking(parsePeriod(params.get('period'), STANDARD_PERIODS, 'week'), parsePlayersMode(params.get('mode'))))
  } catch (error) {
    console.error('Error fetching players ranking:', error)
    return Response.json({ error: 'Failed to fetch players ranking' }, { status: 500 })
  }
}
