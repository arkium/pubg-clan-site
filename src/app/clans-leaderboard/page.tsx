import { Suspense } from 'react'

import LeagueFindings from '@/components/clan-league/LeagueFindings'
import LeaguePage from '@/components/clan-league/LeaguePage'

/**
 * Ligue des clans (docs/features/ligue-clans.md). Le classement interactif est un composant client ; la page serveur
 * lui ajoute le bloc « En bref » (podium, clans classés, formule du Power score), calculé ici pour être dans le HTML
 * (docs/TODO/geo-seo-propositions.md, lot 2). Le `Suspense` le diffuse dès qu'il est prêt.
 */
export default function ClansLeaderboardPage() {
  return (
    <LeaguePage
      findings={
        <Suspense fallback={null}>
          <LeagueFindings />
        </Suspense>
      }
    />
  )
}
