import { getSessionFromRequest } from '@/lib/auth-session'
import { listTournamentOverviews } from '@/lib/tournament-overview'

// Réservé aux utilisateurs connectés (2026-09-16) : le proxy ne protège que les pages, pas `/api`.
export async function GET(request: Request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    return Response.json({ tournaments: await listTournamentOverviews() })
  } catch (error) {
    console.error('Error fetching tournaments:', error)
    return Response.json({ error: 'Failed to fetch tournaments' }, { status: 500 })
  }
}
