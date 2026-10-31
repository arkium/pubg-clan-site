import { CircleDot, Compass, Map as MapIcon, Plane, Sparkles, Target } from 'lucide-react'

import { mapDisplayName } from '@/lib/map-label-service'
import { zoneReadingFindings } from '@/lib/zone-reading/zone-reading-findings'
import { loadZoneReadingAnalysis } from '@/lib/zone-reading/zone-reading-service'

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const ICON = 'h-4 w-4 shrink-0 text-[var(--theme-ui-accent-text)]'
const FINDING_ICONS = [Plane, Target, CircleDot, Compass] as const

/** Libellé court d'une carte, comme le sélecteur de carte de la page (`mapLabel`). */
const mapLabel = (mapName: string) => mapDisplayName(mapName, {}).replace(/\s*\(.*\)$/, '')

/**
 * Lecture de zone — « En bref », composant serveur (docs/TODO/geo-seo-propositions.md, lot 2) : l'analyse par défaut
 * de la page (carte la plus jouée, Squad, toutes les parties) en phrases, dans le HTML. Même calcul et même cache que
 * `GET /api/zone-reading` : l'appel que la page fait ensuite trouve le résultat déjà prêt. Rendu dans un `Suspense`
 * par la page, il n'en retarde pas le reste. Rangé depuis le 2026-10-28 dans la barre « Comment c'est calculé ? » de la
 * page (`CalculationHelp`), sous la méthode (`ZONE_READING_METHOD_PARTS`) : plus de panneau propre.
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
    <section aria-labelledby="zone-reading-findings-title" className="flex flex-col gap-3" data-testid="zone-reading-findings">
      <div className="flex flex-col gap-0.5">
        <h2 id="zone-reading-findings-title" className="app-help-bar-card-title">
          <Sparkles className={ICON} aria-hidden="true" />
          <span>{findings.title}</span>
        </h2>
        <p className="t-meta">{findings.scope}</p>
      </div>
      <ul className="app-help-bar-rows">
        {findings.findings.map((finding, index) => {
          const Icon = FINDING_ICONS[index % FINDING_ICONS.length]
          const isOddLast = findings.findings.length % 2 === 1 && index === findings.findings.length - 1
          return (
            <li key={finding.lead} className={`app-panel-muted app-help-bar-row ${isOddLast ? 'app-help-bar-row--wide' : ''}`.trim()}>
              <h3 className="app-help-bar-card-title">
                <Icon className={ICON} aria-hidden="true" />
                <span>{finding.lead}</span>
              </h3>
              <div className="app-help-bar-card-body">
                <p>{finding.detail}</p>
              </div>
            </li>
          )
        })}
        <li className="app-panel-muted app-help-bar-row app-help-bar-row--wide">
          <h3 className="app-help-bar-card-title">
            <MapIcon className={ICON} aria-hidden="true" />
            <span>Parties analysées par carte</span>
          </h3>
          <div className="app-help-bar-chips">
            {findings.maps.map((map) => (
              <span key={map.label} className="app-help-bar-chip t-num">
                <b className="text-gray-900">{map.label}</b> {integer.format(map.matches)}
              </span>
            ))}
          </div>
        </li>
      </ul>
    </section>
  )
}
