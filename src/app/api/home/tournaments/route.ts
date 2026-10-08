import { isAuthDisabled } from '@/lib/auth-mode'
import { getSessionFromRequest } from '@/lib/auth-session'
import { getHomeTournaments } from '@/lib/home-tournaments-service'

/**
 * Tournois de la vitrine de l'accueil (docs/features/accueil.md) : en direct avec leur top 3, prochains tournois,
 * dernier vainqueur. Mêmes droits que la liste `/api/tournaments` (décision du 2026-09-16) : un utilisateur connecté,
 * ou tout le monde en mode visiteur. Sinon 401, et la vitrine n'affiche aucun tournoi.
 */
export async function GET(request: Request) {
  if (!isAuthDisabled() && !(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    return Response.json(await getHomeTournaments())
  } catch (error) {
    console.error('[api/home/tournaments] Lecture impossible', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
