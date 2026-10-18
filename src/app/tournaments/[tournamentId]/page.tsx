import { Suspense } from 'react'

import TournamentDetailPage from '@/components/tournaments/TournamentDetailPage'
import TournamentFindings, { TournamentStructuredData } from '@/components/tournaments/TournamentFindings'

/**
 * Page d'un tournoi (docs/features/tournois.md). Le classement complet est un composant client chargé par l'API ; la
 * page serveur lui passe un résumé du tournoi, rendu ici pour être dans le HTML (docs/TODO/geo-seo-propositions.md,
 * lot 2), et pose à côté ses données structurées (`SportsEvent`, lot 3), qui restent quand le résumé s'efface.
 */
export default async function TournamentPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const tournamentId = decodeURIComponent((await params).tournamentId)
  return (
    <>
      <Suspense fallback={null}>
        <TournamentStructuredData tournamentId={tournamentId} />
      </Suspense>
      <TournamentDetailPage
        findings={
          <Suspense fallback={null}>
            <TournamentFindings tournamentId={tournamentId} />
          </Suspense>
        }
      />
    </>
  )
}
