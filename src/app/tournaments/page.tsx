import TournamentsPage from '@/components/tournaments/TournamentsPage'
import { isAuthDisabled } from '@/lib/auth-mode'
import { listTournamentOverviews, type TournamentOverview } from '@/lib/tournament-overview'

/**
 * Tournois (docs/features/tournois.md). La liste est lue ici, côté serveur, pour que les cartes soient dans le HTML
 * (docs/TODO/geo-seo-propositions.md, lot 2) ; le composant client la reprend telle quelle puis relit l'API. Seulement
 * en mode visiteur : sinon la liste est réservée aux connectés (`GET /api/tournaments`), le client la charge comme avant.
 */
export default async function TournamentsListPage() {
  const renderedAt = new Date()
  let initialTournaments: TournamentOverview[] | null = null
  if (isAuthDisabled()) {
    try {
      initialTournaments = await listTournamentOverviews(renderedAt)
    } catch (error) {
      // Le client charge la liste lui-même : la page reste utilisable.
      console.error('[tournaments] Liste illisible au rendu serveur :', error instanceof Error ? error.name : 'UnknownError')
    }
  }
  return <TournamentsPage initialTournaments={initialTournaments} renderedAt={renderedAt.toISOString()} />
}
