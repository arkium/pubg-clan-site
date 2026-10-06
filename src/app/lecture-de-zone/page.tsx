'use client'

import { ArrowLeftRight, ChartColumn, CircleDot, Crosshair } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { MapPager } from '@/components/maps/MapToolbarControls'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import ZoneReadingAnalysis from '@/components/zone-reading/ZoneReadingAnalysis'
import ZoneReadingTraining from '@/components/zone-reading/ZoneReadingTraining'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { ROLLING_PERIODS } from '@/lib/period'
import {
  ZONE_READING_MODES,
  ZONE_READING_MODE_LABELS,
  type ZoneReadingAnalysis as ZoneReadingAnalysisPayload,
  type ZoneReadingMode,
} from '@/lib/zone-reading/zone-reading-api'
import type { Axis } from '@/lib/zone-reading/zone-reading-geometry'

/**
 * Lecture de zone — analyse et entraînement (docs/features/lecture-de-zone.md ; maquette Claude Design « Lecture de
 * zone - A faire », recadrée sur les données réelles le 2026-10-06). Page globale comme le Mortier : l'analyse porte
 * sur toutes les parties du site, l'entraînement rejoue des parties du clan sélectionné. Onglet dans l'URL
 * (`?tab=training`) ; l'entraînement reste monté une fois ouvert, pour ne pas perdre la série en cours.
 */

type ZoneReadingTab = 'analysis' | 'training'

const TABS: Array<{ value: ZoneReadingTab; label: string; icon: typeof Crosshair }> = [
  { value: 'analysis', label: 'Analyse', icon: ChartColumn },
  { value: 'training', label: 'Entraînement', icon: Crosshair },
]

const MODE_OPTIONS = ZONE_READING_MODES.map((value) => ({ value, label: ZONE_READING_MODE_LABELS[value] }))

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

const HAZARD_NOTE = 'La zone garde une part de hasard : ces chiffres donnent des probabilités, pas des certitudes.'

function summaryOf(payload: ZoneReadingAnalysisPayload | null) {
  if (!payload || payload.matchCount === 0) return ''
  const since = payload.since ? ` depuis le ${longDate.format(new Date(payload.since))}` : ''
  return `Calculé sur ${integer.format(payload.matchCount)} partie${payload.matchCount > 1 ? 's' : ''}${since}`
}

function ZoneReadingContent() {
  const searchParams = useSearchParams()
  const tab: ZoneReadingTab = searchParams.get('tab') === 'training' ? 'training' : 'analysis'
  const { clanId } = useSelectedClan()

  // Période de la page : URL, puis mémoire de la visite, puis « Tous » (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(ROLLING_PERIODS, 'all')
  const [mode, setMode] = useState<ZoneReadingMode>('squad')
  const [requestedMap, setRequestedMap] = useState('')
  const [payload, setPayload] = useState<ZoneReadingAnalysisPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Axe du C-130 partagé par les blocs 01 et 04 ; revient à l'axe par défaut quand la carte, le mode ou la période change.
  const [axisState, setAxisState] = useState<{ key: string; axis: Axis } | null>(null)
  // Série demandée : change à « Rejouer » (la carte, le mode et la période relancent aussi une série).
  const [round, setRound] = useState(0)
  const [trainingOpened, setTrainingOpened] = useState(false)
  if (tab === 'training' && !trainingOpened) setTrainingOpened(true)

  const tabsRef = useRef<HTMLDivElement>(null)
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!periodReady) return
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError('')
        const search = new URLSearchParams({ mode, period })
        if (requestedMap) search.set('map', requestedMap)
        const response = await fetch(`/api/zone-reading?${search.toString()}`, { cache: 'no-store' })
        const data = (await response.json().catch(() => null)) as (ZoneReadingAnalysisPayload & { error?: string }) | null
        if (cancelled) return
        if (!response.ok || !data || !Array.isArray(data.mapOptions)) {
          setError(data?.error ?? 'Chargement impossible.')
          return
        }
        setPayload(data)
      } catch {
        if (!cancelled) setError('Chargement impossible.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [mode, period, periodReady, requestedMap])

  const maps = (payload?.mapOptions ?? []).map((option) => option.mapName)
  const activeMap = payload?.mapName ?? ''
  const axisKey = payload ? `${payload.mapName}|${payload.mode}|${payload.period}` : ''
  const axis = axisState && axisState.key === axisKey ? axisState.axis : (payload?.defaultAxis ?? null)
  const changeAxis = useCallback((next: Axis) => setAxisState({ key: axisKey, axis: next }), [axisKey])

  function stepMap(direction: 'prev' | 'next') {
    if (maps.length < 2) return
    const index = Math.max(0, maps.indexOf(activeMap))
    setRequestedMap(maps[(index + (direction === 'next' ? 1 : -1) + maps.length) % maps.length])
  }

  // Même mécanique que la période et le Mortier : `replaceState`, sans nouveau montage (la série en cours est gardée).
  const setTab = useCallback((next: ZoneReadingTab) => {
    const params = new URLSearchParams(window.location.search)
    if (next === 'training') params.set('tab', 'training')
    else params.delete('tab')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  }, [])

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    setTab(TABS[nextIndex].value)
    tabButtons.current[nextIndex]?.focus()
  }

  const summary = summaryOf(payload)

  return (
    // `.charte` : page à la charte UI (accent jaune, Teko, classes de rôle) ; `.game-ui` : jetons de jeu (--game-*).
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        {/* Invisible : inscrit la page dans la pile du fil d'Ariane (retour depuis une page suivante). */}
        <NavigationTrail
          currentLabel="Lecture de zone"
          currentHref={tab === 'training' ? '/lecture-de-zone?tab=training' : '/lecture-de-zone'}
          fallbackParent={null}
          hidden
        />
        {/* Hauteur standard des bandeaux d'image (docs/ui/index.html#en-tetes). Sans l'image, dégradé de repli. */}
        <header
          className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/lecture-de-zone.jpg')`, backgroundPosition: 'center 40%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/35 sm:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3.5 py-3 sm:px-6 sm:py-5">
            <div className="flex items-center gap-2">
              <CircleDot className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title text-white drop-shadow-md">Lecture de zone</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md sm:text-sm">L’avion donne le premier cercle, pas la zone finale.</p>
          </div>
        </header>
      </div>

      {/* Carte, mode et période sur une ligne, docké sur mobile aussi : on change de carte en regardant la carte. */}
      <DockingToolbar ariaLabel="Filtres de la lecture de zone">
        <div className="flex w-full flex-nowrap items-center gap-1.5 sm:gap-2">
          <MapPager maps={maps} activeMap={activeMap} onStep={stepMap} onSelect={setRequestedMap} />
          <div role="group" aria-label="Mode" className="hidden shrink-0 sm:block">
            <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} size="xs" />
          </div>
          {/* Mobile : un bouton qui passe au mode suivant (comme le critère de la Ligue), la carte garde sa place. */}
          <div className="flex shrink-0 self-stretch sm:hidden">
            <button
              type="button"
              onClick={() => setMode(mode === 'squad' ? 'duo' : 'squad')}
              aria-label={`Mode : ${ZONE_READING_MODE_LABELS[mode]} (toucher pour passer au suivant)`}
              className="app-menu-trigger app-menu-trigger--active"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
              {ZONE_READING_MODE_LABELS[mode]}
            </button>
          </div>
          <PeriodFilter periods={ROLLING_PERIODS} value={period} onChange={setPeriod} size="xs" className="map-toolbar-period" />
          <span className="ml-auto hidden whitespace-nowrap text-[13px] tabular-nums text-gray-500 lg:inline" data-testid="zone-reading-summary">
            {summary}
          </span>
        </div>
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-[18px] pb-8">
        <div ref={tabsRef} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Lecture de zone" className="app-segmented-control inline-flex w-full border border-gray-200 sm:w-fit">
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
                  id={`zone-reading-tab-${entry.value}`}
                  aria-selected={active}
                  aria-controls={`zone-reading-panel-${entry.value}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(entry.value)}
                  onKeyDown={(event) => handleTabKey(event, index)}
                  className={`app-segmented-control__item app-segmented-control__item--sm inline-flex flex-1 items-center justify-center gap-1.5 font-medium transition-colors sm:flex-none ${
                    active ? 'app-segmented-control__item--active' : ''
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {entry.label}
                </button>
              )
            })}
          </div>
          {summary ? (
            <p className="t-meta t-num lg:hidden" data-testid="zone-reading-summary-mobile">
              {summary}
            </p>
          ) : null}
        </div>

        {error ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}

        <div role="tabpanel" id="zone-reading-panel-analysis" aria-labelledby="zone-reading-tab-analysis" hidden={tab !== 'analysis'}>
          {loading && !payload ? <CardSkeleton /> : null}
          {payload && payload.mapOptions.length === 0 && !loading ? (
            <p className="app-panel-muted t-body p-4 text-gray-600">
              Aucune partie analysée en {ZONE_READING_MODE_LABELS[mode]} sur cette période. Les lignes de vol et les cercles sont écrits à
              l’analyse de la télémétrie des parties.
            </p>
          ) : null}
          {/* Pendant un rechargement, l'analyse précédente reste affichée, estompée : la page ne se replie pas. */}
          {payload && payload.mapOptions.length > 0 ? (
            <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
              <ZoneReadingAnalysis payload={payload} axis={axis} onAxisChange={changeAxis} onSelectMap={setRequestedMap} />
            </div>
          ) : null}
        </div>

        {trainingOpened ? (
          <div role="tabpanel" id="zone-reading-panel-training" aria-labelledby="zone-reading-tab-training" hidden={tab !== 'training'}>
            {payload ? (
              <ZoneReadingTraining
                mapName={activeMap}
                mode={mode}
                period={period}
                clanId={clanId}
                round={round}
                onReplay={() => {
                  setRound((value) => value + 1)
                  if ((tabsRef.current?.getBoundingClientRect().top ?? 0) < 0) tabsRef.current?.scrollIntoView({ block: 'start' })
                }}
              />
            ) : (
              <CardSkeleton />
            )}
          </div>
        ) : null}

        <p className="t-meta border-t border-gray-200 pt-3" data-testid="zone-reading-hazard">
          {HAZARD_NOTE}
        </p>
      </div>
    </div>
  )
}

export default function ZoneReadingPage() {
  // useSearchParams (onglet) : frontière Suspense obligatoire (CLAUDE.md, piège 5).
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
      <ZoneReadingContent />
    </Suspense>
  )
}

