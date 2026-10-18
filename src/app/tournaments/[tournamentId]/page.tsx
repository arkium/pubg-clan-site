import { Suspense } from 'react'

import TournamentDetailPage from '@/components/tournaments/TournamentDetailPage'
import TournamentFindings from '@/components/tournaments/TournamentFindings'

/**
 * Page d'un tournoi (docs/features/tournois.md). Le classement complet est un composant client chargé par l'API ; la
 * page serveur lui passe un résumé du tournoi, rendu ici pour être dans le HTML (docs/TODO/geo-seo-propositions.md,
 * lot 2).
 */
export default async function TournamentPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params
  return (
    <TournamentDetailPage
      findings={
        <Suspense fallback={null}>
          <TournamentFindings tournamentId={decodeURIComponent(tournamentId)} />
        </Suspense>
      }
    />
  )
}
