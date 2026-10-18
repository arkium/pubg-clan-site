import { Suspense } from 'react'

import ClanDirectoryFindings from '@/components/clans/ClanDirectoryFindings'
import ClansDirectoryPage from '@/components/clans/ClansDirectoryPage'

/**
 * Annuaire des clans (docs/features/clans.md, « Annuaire »). L'annuaire interactif est un composant client ; la page
 * serveur lui ajoute le bloc « En bref » (totaux, clans les plus actifs, lien vers chaque clan suivi), calculé ici pour
 * être dans le HTML (docs/TODO/geo-seo-propositions.md, lot 2). Le `Suspense` le diffuse dès qu'il est prêt.
 */
export default function ClansDirectoryRoute() {
  return (
    <ClansDirectoryPage
      findings={
        <Suspense fallback={null}>
          <ClanDirectoryFindings />
        </Suspense>
      }
    />
  )
}
