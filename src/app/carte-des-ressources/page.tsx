import { Suspense } from 'react'

import ResourceFindings from '@/components/resources/ResourceFindings'
import ResourceMapPage from '@/components/resources/ResourceMapPage'

/**
 * Carte des ressources (docs/features/carte-ressources.md). La carte interactive est un composant client ; la page
 * serveur lui ajoute le bloc « En bref » (chiffres de chaque carte, méthode), calculé ici pour être dans le HTML
 * (docs/TODO/geo-seo-propositions.md, lot 2). Le `Suspense` le diffuse dès qu'il est prêt.
 */
export default function ResourceMapRoute() {
  return (
    <ResourceMapPage
      findings={
        <Suspense fallback={null}>
          <ResourceFindings />
        </Suspense>
      }
    />
  )
}
