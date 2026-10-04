'use client'

import { RefreshCw, ShieldCheck } from 'lucide-react'

import type { ResourceMapSummary } from '@/lib/resources/resource-api'
import { dayMonth, savedPointsLabel } from '@/lib/resources/resource-admin-view'
import { resourceMapImage } from '@/lib/resources/resource-map'

import { ButtonSpinner, ToneChip } from './ResourceAdminShared'

/**
 * Panneau « Par carte » de l'onglet Validation : après une mise à jour PUBG, un SuperUser marque une carte « à
 * revérifier » (confirmation en modale, ouverte par l'onglet) ; ses points saisis passent « à confirmer » jusqu'au
 * prochain « Toujours là ». Une carte déjà à revérifier se marque « vérifiée ».
 */
export default function ResourceMapsPanel({
  maps,
  busyKey,
  onRecheck,
  onVerify,
}: {
  maps: ResourceMapSummary[]
  /** Carte dont l'action « Marquer vérifiée » est en cours. */
  busyKey: string | null
  onRecheck: (map: ResourceMapSummary) => void
  onVerify: (map: ResourceMapSummary) => void
}) {
  return (
    <aside className="app-panel flex flex-col gap-3 p-4" aria-labelledby="resource-maps-title" data-testid="resource-maps-panel">
      <div className="flex flex-col gap-1">
        <h2 id="resource-maps-title" className="t-label">
          Par carte
        </h2>
        <p className="t-meta">
          Après une mise à jour PUBG, marque la carte&nbsp;: ses points saisis passent «&nbsp;à confirmer&nbsp;» jusqu’à ce qu’un joueur clique «&nbsp;Toujours là&nbsp;».
        </p>
      </div>
      {/* Empilé sous la file (tablette) : deux colonnes de cartes ; à côté de la file : une seule. */}
      <ul className="grid sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-1">
        {maps.map((map) => {
          const empty = map.validatedPoints <= 0
          return (
            <li key={map.key} className="flex flex-col gap-2 border-t border-gray-200 py-3 last:pb-0" data-testid="resource-map-row" data-map={map.key} aria-label={map.label}>
              <div className="flex items-center gap-2.5">
                <span
                  className="bg-map-fallback h-10 w-10 shrink-0 rounded-[8px] bg-cover bg-center ring-1 ring-[var(--theme-ui-border)]"
                  style={{ backgroundImage: `url(${resourceMapImage(map.key)})` }}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] font-bold text-gray-900">{map.label}</span>
                  <span className="t-meta t-num">
                    {savedPointsLabel(map.validatedPoints)}
                    {!map.recheckSince && map.verifiedAt ? ` · vérifiée le ${dayMonth(map.verifiedAt)}` : ''}
                  </span>
                </div>
              </div>
              {map.recheckSince ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ToneChip tone="warn" testId="resource-map-recheck">
                    À revérifier depuis le {dayMonth(map.recheckSince)}
                  </ToneChip>
                  <button
                    type="button"
                    onClick={() => onVerify(map)}
                    disabled={busyKey === map.key}
                    className="app-btn app-btn--xs app-btn--secondary gap-1.5"
                  >
                    {busyKey === map.key ? <ButtonSpinner /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                    Marquer vérifiée
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onRecheck(map)}
                  disabled={empty}
                  title={empty ? 'Aucun point saisi' : undefined}
                  className="app-btn app-btn--xs app-btn--secondary w-full gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  À revérifier après mise à jour PUBG
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
