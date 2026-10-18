import { mapDisplayName } from '@/lib/map-label-service'
import { zoneReadingFindings } from '@/lib/zone-reading/zone-reading-findings'
import { loadZoneReadingAnalysis } from '@/lib/zone-reading/zone-reading-service'

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** Libellé court d'une carte, comme le sélecteur de carte de la page (`mapLabel`). */
const mapLabel = (mapName: string) => mapDisplayName(mapName, {}).replace(/\s*\(.*\)$/, '')

/**
 * Lecture de zone — « En bref », composant serveur (docs/TODO/geo-seo-propositions.md, lot 2) : l'analyse par défaut
 * de la page (carte la plus jouée, Squad, toutes les parties) en phrases, dans le HTML. Même calcul et même cache que
 * `GET /api/zone-reading` : l'appel que la page fait ensuite trouve le résultat déjà prêt. Rendu dans un `Suspense`
 * par la page, il n'en retarde pas le reste.
 */
export default async function ZoneReadingFindings() {
  let findings = null
  try {
    findings = zoneReadingFindings(await loadZoneReadingAnalysis({ mapName: null, mode: 'squad', period: 'all' }), mapLabel, new Date())
  } catch (error) {
    // La page garde son analyse interactive : ce bloc n'est qu'un résumé.
    console.error('[zone-reading] Résumé illisible :', error instanceof Error ? error.name : 'UnknownError')
  }
  if (!findings) return null

  return (
    <section aria-labelledby="zone-reading-findings-title" className="app-panel flex flex-col gap-3 p-4 sm:p-5" data-testid="zone-reading-findings">
      <div className="flex flex-col gap-1">
        <h2 id="zone-reading-findings-title" className="t-section-title">
          {findings.title}
        </h2>
        <p className="t-meta">{findings.scope}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {findings.findings.map((finding) => (
          <li key={finding.lead} className="t-body text-gray-700">
            <b className="text-gray-900">{finding.lead}</b> {finding.detail}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 border-t border-gray-200 pt-3">
        <h3 className="t-card-title">Comment c’est calculé</h3>
        <p className="t-body text-gray-700">{findings.method}</p>
        <p className="t-meta t-num">
          Parties analysées par carte :{' '}
          {findings.maps.map((map, index) => (
            <span key={map.label}>
              {index > 0 ? ' · ' : ''}
              {map.label} {integer.format(map.matches)}
            </span>
          ))}
        </p>
      </div>
    </section>
  )
}
