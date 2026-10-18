import { isAuthDisabled } from '@/lib/auth-mode'
import { getSessionFromRequest } from '@/lib/auth-session'
import { parsePeriod, STANDARD_PERIODS } from '@/lib/period'
import { parseCompareKeys, parsePlayersMode } from '@/lib/players-ranking'
import { getPlayersComparison } from '@/lib/players-ranking-service'

/**
 * Comparateur de joueurs (page `/players`, onglet Comparateur — docs/features/joueurs.md) :
 * `?ids=12,34,clan-5&period=&mode=` — deux ou trois éléments, joueurs ou moyenne d'un clan. Même garde que le classement.
 */
export async function GET(request: Request) {
  if (!(await getSessionFromRequest(request)) && !isAuthDisabled()) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const keys = parseCompareKeys(params.get('ids'))
  if (keys.length < 2) {
    return Response.json({ error: 'Choisis au moins deux joueurs à comparer' }, { status: 400 })
  }

  try {
    return Response.json(await getPlayersComparison(keys, parsePeriod(params.get('period'), STANDARD_PERIODS, 'week'), parsePlayersMode(params.get('mode'))))
  } catch (error) {
    console.error('Error comparing players:', error)
    return Response.json({ error: 'Failed to compare players' }, { status: 500 })
  }
}
