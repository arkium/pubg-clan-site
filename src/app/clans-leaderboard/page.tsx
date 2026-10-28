import { Suspense } from 'react'

import LeagueFindings, { LeagueFormula } from '@/components/clan-league/LeagueFindings'
import LeaguePage from '@/components/clan-league/LeaguePage'

/**
 * Ligue des clans (docs/features/ligue-clans.md). Le classement interactif est un composant client ; la page serveur
 * lui ajoute le bloc « En bref » (podium, clans classés) et la formule du Power score, calculés ici pour être dans le
 * HTML (docs/TODO/geo-seo-propositions.md, lot 2), rangés dans la barre « Comment c'est calculé ? ». Les `Suspense` les
 * diffusent dès qu'ils sont prêts.
 */
export default function ClansLeaderboardPage() {
  return (
    <LeaguePage
      findings={
        <Suspense fallback={null}>
          <LeagueFindings />
        </Suspense>
      }
      formula={
        <Suspense fallback={null}>
          <LeagueFormula />
        </Suspense>
      }
    />
  )
}
