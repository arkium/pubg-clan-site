'use client'

import { Lock } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { ArchivedClansSection, PendingClansSection } from '@/components/clan-lifecycle/ClanRequestsSections'
import { HealthSection } from '@/components/clan-lifecycle/HealthSection'
import {
  CountersLine,
  LIFECYCLE_TABS,
  LifecycleBanner,
  LifecycleTabs,
  ModeCallout,
  panelId,
  parseLifecycleTab,
  tabId,
  type LifecycleTab,
} from '@/components/clan-lifecycle/LifecycleHeader'
import { ErrorState, ToastStack, type LifecycleOverview, type Toast, type ToastTone } from '@/components/clan-lifecycle/LifecycleShared'
import { MutationsSection } from '@/components/clan-lifecycle/MutationsSection'
import { ParkingSection } from '@/components/clan-lifecycle/ParkingSection'
import { SettingsSection } from '@/components/clan-lifecycle/SettingsSection'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import ToolbarGroup from '@/components/ui/ToolbarGroup'

/**
 * Page SuperUser unique « Cycle de vie des clans » — chantier 5 (docs/features/cycle-de-vie-clan.md).
 *
 * Six onglets pour une seule thématique : mutations, clans en attente, clans archivés, parking, paramètres et santé.
 * Le regroupement comble aussi un trou fonctionnel — aucune page ne permettait jusqu'ici de valider un clan en attente.
 *
 * Charte UI (docs/ui/index.html, 04/10/2026) : bandeau photo, onglets dans un bandeau collant (`DockingToolbar`, rien
 * de docké sur mobile), sections dans src/components/clan-lifecycle/. La page ne garde que l'orchestration : vue
 * d'ensemble (`GET /api/settings/clan-lifecycle`), onglet courant (`?tab=`) et toasts.
 */

const TOAST_MS = 5000
const MAX_TOASTS = 3

function ClanLifecycleContent() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<LifecycleTab>(() => parseLifecycleTab(searchParams.get('tab')))
  const [overview, setOverview] = useState<LifecycleOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastSeq = useRef(0)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadOverview() {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch('/api/settings/clan-lifecycle', {
          cache: 'no-store',
          signal: controller.signal,
        })

        if (res.status === 403) {
          if (!cancelled) setForbidden(true)
          return
        }
        if (!res.ok) throw new Error('Impossible de charger la page.')

        const data = (await res.json()) as LifecycleOverview
        if (!cancelled) setOverview(data)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadOverview()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [refreshToken])

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])

  const showToast = useCallback(
    (text: string, tone: ToastTone) => {
      toastSeq.current += 1
      const id = toastSeq.current
      setToasts((current) => [...current, { id, text, tone }].slice(-MAX_TOASTS))
      window.setTimeout(() => dismissToast(id), TOAST_MS)
    },
    [dismissToast]
  )

  const currentTab = LIFECYCLE_TABS.find((entry) => entry.value === tab) ?? LIFECYCLE_TABS[0]

  function renderTab(data: LifecycleOverview) {
    switch (tab) {
      case 'settings':
        return <SettingsSection settings={data.settings} onSaved={refresh} onToast={showToast} />
      case 'health':
        return <HealthSection health={data.health} />
      case 'ungrouped':
        return <ParkingSection onChanged={refresh} onToast={showToast} />
      case 'pending':
        return <PendingClansSection onChanged={refresh} onToast={showToast} />
      case 'archived':
        return <ArchivedClansSection onChanged={refresh} onToast={showToast} />
      default:
        return <MutationsSection onChanged={refresh} onToast={showToast} />
    }
  }

  // Réglages et santé se lisent dans la vue d'ensemble : estompés pendant son rechargement, jamais repliés.
  const fadesWithOverview = tab === 'settings' || tab === 'health'

  return (
    <>
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Cycle de vie des clans"
          currentHref="/settings/clans/lifecycle"
          fallbackParent={{ href: '/settings', label: 'Plateforme' }}
        />
        <LifecycleBanner settings={overview?.settings ?? null} />
      </div>

      {forbidden ? (
        <div className="app-container app-gutter pb-8 pt-[18px]">
          <p className="app-panel flex items-start gap-2.5 p-4 text-[13px] text-gray-700" data-testid="clan-lifecycle-forbidden">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
            Accès réservé au SuperUser : le cycle de vie des clans s’applique à tous les clans.
          </p>
        </div>
      ) : !overview && error ? (
        <div className="app-container app-gutter pb-8 pt-[18px]">
          <section className="app-panel">
            <ErrorState message={error} onRetry={refresh} testId="clan-lifecycle-error" />
          </section>
        </div>
      ) : (
        <>
          {/* Bandeau des onglets ; sans période, rien de docké sur mobile (docs/TODO/sticky.md §2). */}
          <DockingToolbar ariaLabel="Sections du cycle de vie des clans" dockOnMobile={false}>
            {({ isSticky }) => (
              <div className="flex w-full min-w-0 flex-col gap-2">
                <ToolbarGroup label="Section" showLabel={!isSticky}>
                  <LifecycleTabs value={tab} onChange={setTab} counters={overview?.counters} short={isSticky} />
                </ToolbarGroup>
                {!isSticky && overview ? <CountersLine counters={overview.counters} /> : null}
              </div>
            )}
          </DockingToolbar>

          <div className="app-container app-gutter flex flex-col gap-[18px] pb-8">
            {overview ? <ModeCallout mode={overview.settings.mode} /> : null}
            {overview && error ? (
              <p className="text-[13px] font-semibold text-[var(--theme-ui-negative)]" role="alert">
                {error}
              </p>
            ) : null}
            <section role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)} aria-label={currentTab.label} data-testid="clan-lifecycle-panel">
              {!overview ? (
                <CardSkeleton />
              ) : (
                <div
                  className={`transition-opacity ${fadesWithOverview && loading ? 'opacity-60' : ''}`}
                  aria-busy={fadesWithOverview && loading ? true : undefined}
                >
                  {renderTab(overview)}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}

export default function ClanLifecyclePage() {
  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) ; `.game-ui` : jetons --game-*.
    <div className="app-main-flush game-ui charte flex-1">
      {/* `?tab=` sert les liens profonds (annuaire des joueurs, zone de danger d'un clan) ; useSearchParams impose une
          frontière Suspense (CLAUDE.md, piège n° 5). */}
      <Suspense
        fallback={
          <div className="app-container app-gutter">
            <CardSkeleton />
          </div>
        }
      >
        <ClanLifecycleContent />
      </Suspense>
    </div>
  )
}
