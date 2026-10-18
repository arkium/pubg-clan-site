import { Suspense } from 'react'

import ZoneReadingFindings from '@/components/zone-reading/ZoneReadingFindings'
import ZoneReadingPage from '@/components/zone-reading/ZoneReadingPage'

/**
 * Lecture de zone (docs/features/lecture-de-zone.md). La page interactive est un composant client ; la page serveur lui
 * ajoute le bloc « En bref », calculé ici pour être dans le HTML (docs/TODO/geo-seo-propositions.md, lot 2). Le
 * `Suspense` le diffuse dès qu'il est prêt, sans retarder le reste de la page.
 */
export default function LectureDeZonePage() {
  return (
    <ZoneReadingPage
      findings={
        <Suspense fallback={null}>
          <ZoneReadingFindings />
        </Suspense>
      }
    />
  )
}
