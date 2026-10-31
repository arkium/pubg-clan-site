import { Map as MapIcon, Sparkles } from 'lucide-react'

import { resourceFindings } from '@/lib/resources/resource-findings'
import { RESOURCE_MAPS } from '@/lib/resources/resource-map'
import { getResourceMapView } from '@/lib/resources/resource-service'

const ICON = 'h-4 w-4 shrink-0 text-[var(--theme-ui-accent-text)]'

/**
 * Carte des ressources — « En bref », composant serveur (docs/TODO/geo-seo-propositions.md, lot 2) : chaque carte en une
 * phrase (parties analysées, emplacements de véhicules, le plus fréquent, points des joueurs), dans le HTML. Vue d'un
 * visiteur (`getResourceMapView(null, …)`, la lecture publique de `GET /api/resources`). Rendu dans un `Suspense` par la
 * page, rangé depuis le 2026-10-28 dans sa barre « Comment c'est calculé ? » (`CalculationHelp`), sous la méthode
 * (`RESOURCE_METHOD_PARTS`) : plus de panneau propre.
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
    <section aria-labelledby="resource-findings-title" className="flex flex-col gap-3" data-testid="resource-findings">
      <div className="flex flex-col gap-0.5">
        <h2 id="resource-findings-title" className="app-help-bar-card-title">
          <Sparkles className={ICON} aria-hidden="true" />
          <span>{findings.title}</span>
        </h2>
        <p className="t-meta">{findings.scope}</p>
      </div>
      <ul className="app-help-bar-rows">
        {findings.maps.map((map, index) => {
          const isOddLast = findings.maps.length % 2 === 1 && index === findings.maps.length - 1
          return (
            <li key={map.label} className={`app-panel-muted app-help-bar-row ${isOddLast ? 'app-help-bar-row--wide' : ''}`.trim()}>
              <h3 className="app-help-bar-card-title">
                <MapIcon className={ICON} aria-hidden="true" />
                <span>{map.label}</span>
              </h3>
              <div className="app-help-bar-card-body">
                <p>{map.sentence}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
