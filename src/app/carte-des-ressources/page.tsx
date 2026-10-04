'use client'

import { History, ListChecks, Map as MapIcon, MapPinned, ShieldCheck } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useRef, useState, type KeyboardEvent } from 'react'

import ResourceHistoryTab from '@/components/resources/admin/ResourceHistoryTab'
import ResourceValidationTab from '@/components/resources/admin/ResourceValidationTab'
import ResourceMapExplorer from '@/components/resources/ResourceMapExplorer'
import { useResourceMap } from '@/components/resources/useResourceMap'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { RESOURCE_MAPS, resourceMap } from '@/lib/resources/resource-map'

/**
 * Carte des ressources (docs/features/carte-ressources.md ; maquette « Carte des ressources : carte, fiche, signaler et
 * proposer »). Carte dans l'URL (`?map=Baltic_Main`). Pour un SuperUser, onglets « Carte | Validation | Historique »
 * (`?tab=validation|history`) : la vue Carte reste montée pendant un passage par un autre onglet, pour garder la carte,
 * le zoom et la fiche ouverte. Charte UI : docs/ui/index.html.
 */

type ResourceTab = 'map' | 'validation' | 'history'

const TABS: Array<{ value: ResourceTab; label: string; icon: typeof MapIcon }> = [
  { value: 'map', label: 'Carte', icon: MapIcon },
  { value: 'validation', label: 'Validation', icon: ListChecks },
  { value: 'history', label: 'Historique', icon: History },
]

const DEFAULT_MAP = RESOURCE_MAPS[0].key

/**
 * Même mécanique que la période (usePagePeriod) et le mortier : `window.history.replaceState`, suivi par
 * `useSearchParams`, sans rendu serveur ni nouveau montage de la page.
 */
function replaceQuery(change: (params: URLSearchParams) => void) {
  const params = new URLSearchParams(window.location.search)
  change(params)
  const query = params.toString()
  // `null`, pas `window.history.state` : un état marqué par Next.js (`__NA`) court-circuite la synchronisation du routeur.
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
}

function ResourcesContent() {
  const searchParams = useSearchParams()
  const mapKey = resourceMap(searchParams.get('map'))?.key ?? DEFAULT_MAP
  const tabParam = searchParams.get('tab')
  const resource = useResourceMap(mapKey)
  const isSuperUser = resource.viewer?.isSuperUser ?? false
  const tab: ResourceTab = isSuperUser && (tabParam === 'validation' || tabParam === 'history') ? tabParam : 'map'
  // Pastille de l'onglet Validation : la réponse de la carte, puis l'onglet lui-même quand il a lu sa file.
  const [queueOverride, setQueueOverride] = useState<number | null>(null)
  const queueCount = queueOverride ?? resource.viewer?.queueCount ?? 0

  const tabButtons = useRef<Array<HTMLButtonElement | null>>([])

  const setMap = useCallback((key: string) => replaceQuery((params) => params.set('map', key)), [])
  const setTab = useCallback(
    (next: ResourceTab) =>
      replaceQuery((params) => {
        if (next === 'map') params.delete('tab')
        else params.set('tab', next)
      }),
    []
  )

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    setTab(TABS[nextIndex].value)
    tabButtons.current[nextIndex]?.focus()
  }

  const query = searchParams.toString()

  return (
    // `.charte` : page à la charte UI (accent jaune, Teko, classes de rôle) ; `.game-ui` : jetons de jeu (--game-*).
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        {/* Invisible : inscrit la page dans la pile du fil d'Ariane (retour depuis une page suivante). */}
        <NavigationTrail
          currentLabel="Carte des ressources"
          currentHref={`/carte-des-ressources${query ? `?${query}` : ''}`}
          fallbackParent={null}
          hidden
        />

        {/* Hauteur standard des bandeaux d'image (docs/ui/index.html#en-tetes), image de la cartographie tactique. */}
        <header
          className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/cartographie-tactique.jpg')`, backgroundPosition: 'center 55%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/35 sm:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <MapPinned className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title text-white drop-shadow-md">Carte des ressources</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md sm:text-sm">Véhicules repérés dans nos parties, et points utiles placés par les joueurs.</p>
          </div>
        </header>

        {isSuperUser ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div role="tablist" aria-label="Carte des ressources" className="app-segmented-control inline-flex w-full border border-gray-200 sm:w-fit">
              {TABS.map((entry, index) => {
                const active = entry.value === tab
                const Icon = entry.icon
                return (
                  <button
                    key={entry.value}
                    ref={(node) => {
                      tabButtons.current[index] = node
                    }}
                    type="button"
                    role="tab"
                    id={`resources-tab-${entry.value}`}
                    aria-selected={active}
                    aria-controls={`resources-panel-${entry.value}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setTab(entry.value)}
                    onKeyDown={(event) => handleTabKey(event, index)}
                    className={`app-segmented-control__item app-segmented-control__item--sm inline-flex flex-1 items-center justify-center gap-1.5 font-medium transition-colors sm:flex-none ${
                      active ? 'app-segmented-control__item--active' : ''
                    }`}
                  >
                    <span className="hidden sm:inline-flex">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </span>
                    {entry.label}
                    {entry.value === 'validation' && queueCount > 0 ? (
                      <span
                        className="t-num grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--theme-ui-negative)] px-1 text-[11px] font-bold leading-none text-white"
                        data-testid="queue-badge"
                      >
                        {queueCount}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            <span className="t-meta inline-flex items-center gap-1.5" data-testid="superuser-mention">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
              Vue superuser
            </span>
          </div>
        ) : null}
      </div>

      <div className="app-container app-gutter mt-4 flex flex-col gap-4">
        <div role={isSuperUser ? 'tabpanel' : undefined} id="resources-panel-map" aria-labelledby={isSuperUser ? 'resources-tab-map' : undefined} hidden={tab !== 'map'}>
          <ResourceMapExplorer mapKey={mapKey} onMapChange={setMap} resource={resource} />
        </div>
        {tab === 'validation' ? (
          <div role="tabpanel" id="resources-panel-validation" aria-labelledby="resources-tab-validation">
            <ResourceValidationTab onQueueCountChange={setQueueOverride} />
          </div>
        ) : null}
        {tab === 'history' ? (
          <div role="tabpanel" id="resources-panel-history" aria-labelledby="resources-tab-history">
            <ResourceHistoryTab />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function ResourcesPage() {
  // useSearchParams (carte, onglet) : frontière Suspense obligatoire (CLAUDE.md, piège 5).
  return (
    <Suspense
      fallback={
        <div className="app-main-flush flex-1">
          <div className="app-container app-gutter">
            <CardSkeleton />
          </div>
        </div>
      }
    >
      <ResourcesContent />
    </Suspense>
  )
}
