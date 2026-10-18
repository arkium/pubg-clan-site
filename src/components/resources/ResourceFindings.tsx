import { resourceFindings } from '@/lib/resources/resource-findings'
import { RESOURCE_MAPS } from '@/lib/resources/resource-map'
import { getResourceMapView } from '@/lib/resources/resource-service'

/**
 * Carte des ressources — « En bref », composant serveur (docs/TODO/geo-seo-propositions.md, lot 2) : chaque carte en une
 * phrase (parties analysées, emplacements de véhicules, le plus fréquent, points des joueurs) et la méthode, dans le
 * HTML. Vue d'un visiteur (`getResourceMapView(null, …)`, la lecture publique de `GET /api/resources`). Rendu dans un
 * `Suspense` par la page.
 */
export default async function ResourceFindings() {
  let findings = null
  try {
    findings = resourceFindings(await Promise.all(RESOURCE_MAPS.map((map) => getResourceMapView(null, map.key))), new Date())
  } catch (error) {
    console.error('[resources] Résumé illisible :', error instanceof Error ? error.name : 'UnknownError')
  }
  if (!findings) return null

  return (
    <section aria-labelledby="resource-findings-title" className="app-panel flex flex-col gap-3 p-4 sm:p-5" data-testid="resource-findings">
      <div className="flex flex-col gap-1">
        <h2 id="resource-findings-title" className="t-section-title">
          {findings.title}
        </h2>
        <p className="t-meta">{findings.scope}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {findings.maps.map((map) => (
          <li key={map.label} className="t-body text-gray-700">
            <b className="text-gray-900">{map.label}</b> — {map.sentence}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 border-t border-gray-200 pt-3">
        <h3 className="t-card-title">Comment c’est calculé</h3>
        <p className="t-body text-gray-700">{findings.method}</p>
      </div>
    </section>
  )
}
