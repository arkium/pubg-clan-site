'use client'

import { AlertTriangle, CheckCircle2, MapPinPlus, Plus, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { DropZoneMapViewportHandle } from '@/components/drop-zones/DropZoneMapViewport'
import { MapPager } from '@/components/maps/MapToolbarControls'
import ResourceCancelModal from '@/components/resources/ResourceCancelModal'
import ResourceFlowPanel, {
  isPlacingStep,
  newProposeFlow,
  newReportFlow,
  type FlowPatch,
  type ResourceFlow,
} from '@/components/resources/ResourceFlowPanel'
import ResourceLayersPanel, { type DropZoneFilterState } from '@/components/resources/ResourceLayersPanel'
import ResourceMapCanvas, { type ResourceSelection } from '@/components/resources/ResourceMapCanvas'
import { RESOURCE_LOGIN_HREF, ResourceChip, ResourcePointSheet, ResourceSpotSheet } from '@/components/resources/ResourceSheet'
import type { ResourceMapQuery } from '@/components/resources/useResourceMap'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { usePageData } from '@/hooks/usePageData'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type {
  ResourceDropZonesResponse,
  ResourcePointView,
  ResourceProposalResponse,
  ResourceReportResponse,
} from '@/lib/resources/resource-api'
import {
  DROP_ZONE_RADIUS_METERS,
  RESOURCE_MAPS,
  resourceMap,
  type ObservedFamily,
  type ResourceMapDefinition,
  type ResourcePointKind,
} from '@/lib/resources/resource-map'
import {
  applyCancellation,
  applyConfirmation,
  applyProposal,
  applyReport,
  buildProposalBody,
  buildReportBody,
  dropZoneSummary,
  familyCounts,
  kindCounts,
  mapStateChip,
  recheckNotice,
  reportNextStep,
  reportPreviousStep,
  shownFamilies,
  spotKey,
  visiblePoints,
  visibleSpots,
} from '@/lib/resources/resource-view'

/**
 * Vue « Carte » de la Carte des ressources (maquette « Carte des ressources : carte, fiche, signaler et proposer ») :
 * sélecteur de carte ‹ › et état de la carte, bandeau « à revérifier », carte à gauche, panneau à droite (couches et
 * légende au repos, fiche d'un point, parcours « Signaler » / « Proposer »). Sur mobile : carte pleine largeur, puis
 * l'état, puis le panneau. Contrat des routes : src/lib/resources/resource-api.ts.
 */

const MAP_KEYS = RESOURCE_MAPS.map((map) => map.key)
const mapLabelOf = (key: string) => resourceMap(key)?.label ?? key

const pickDropZones = (payload: unknown) =>
  payload && typeof payload === 'object' && Array.isArray((payload as ResourceDropZonesResponse).centers) ? (payload as ResourceDropZonesResponse) : null

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok || !payload) throw new Error(payload?.error ?? 'L’envoi n’a pas abouti. Réessaie dans un instant.')
  return payload
}

const pointPath = (pointId: string, action: 'cancel' | 'confirm' | 'reports') => `/api/resources/points/${encodeURIComponent(pointId)}/${action}`

function MapStateBadge({ chip }: { chip: ReturnType<typeof mapStateChip> }) {
  if (!chip) return null
  return (
    <ResourceChip tone={chip.tone} icon={chip.tone === 'warn' ? RefreshCw : CheckCircle2} testId="map-state">
      {chip.text}
    </ResourceChip>
  )
}

/** État de l'interrupteur « Autour de nos drop zones ». Tant que le clan sélectionné n'est pas lu : « recherche », plutôt
 * qu'un « Choisis un clan » qui clignoterait. */
function dropZoneFilterState(input: {
  clanKnown: boolean
  clanId: number | null
  loading: boolean
  error: boolean
  centers: ReadonlyArray<{ name: string }>
  radius: number
  mapLabel: string
}): DropZoneFilterState {
  if (!input.clanKnown) return { status: 'loading' }
  if (!input.clanId) return { status: 'no-clan' }
  if (input.loading) return { status: 'loading' }
  if (input.error) return { status: 'error' }
  if (input.centers.length === 0) return { status: 'empty', mapLabel: input.mapLabel }
  return { status: 'ready', summary: dropZoneSummary(input.centers, input.radius) }
}

/** « Proposer un point » : bouton principal pour un joueur connecté, invitation à se connecter pour un visiteur. */
function ProposeAction({
  signedIn,
  disabled,
  onStart,
  label,
  short,
}: {
  signedIn: boolean
  disabled: boolean
  onStart: () => void
  label: string
  /** Libellé court sous 640 px (« Proposer »). */
  short?: string
}) {
  const content = (
    <>
      <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
      {short ? (
        <>
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </>
  )
  if (!signedIn) {
    return (
      <Link href={RESOURCE_LOGIN_HREF} aria-label={label} className="app-btn app-btn--md app-btn--primary gap-1.5">
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onStart} disabled={disabled} aria-label={label} className="app-btn app-btn--md app-btn--primary gap-1.5">
      {content}
    </button>
  )
}

export default function ResourceMapExplorer({
  mapKey,
  onMapChange,
  resource,
}: {
  mapKey: string
  onMapChange: (key: string) => void
  resource: ResourceMapQuery
}) {
  const { data, loading, error, update, reload } = resource
  const requestedMap = resourceMap(mapKey) ?? RESOURCE_MAPS[0]
  // Carte affichée : celle de la réponse reçue ; pendant le chargement d'une autre, l'ancienne reste, estompée.
  const shownMap: ResourceMapDefinition = data ? { key: data.map.key, label: data.map.label, sizeMeters: data.map.sizeMeters } : requestedMap
  const viewer = data?.viewer ?? resource.viewer
  const signedIn = viewer?.signedIn ?? false

  const viewportRef = useRef<DropZoneMapViewportHandle>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { clanId, hydrated: clanKnown } = useSelectedClan()
  const dropZones = usePageData(clanId ? `/api/resources/drop-zones?clanId=${clanId}&map=${encodeURIComponent(mapKey)}` : null, pickDropZones)

  const [hiddenFamilies, setHiddenFamilies] = useState<ObservedFamily[]>([])
  const [hiddenKinds, setHiddenKinds] = useState<ResourcePointKind[]>([])
  const [nearOn, setNearOn] = useState(false)
  const [selection, setSelection] = useState<ResourceSelection | null>(null)
  const [flow, setFlow] = useState<ResourceFlow | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<ResourcePointView | null>(null)
  const [cancelState, setCancelState] = useState<{ sending: boolean; error: string | null }>({ sending: false, error: null })
  const [notice, setNotice] = useState<string | null>(null)

  const points = useMemo(() => data?.points ?? [], [data])
  const spots = useMemo(() => data?.observed.spots ?? [], [data])

  // Filtre « Autour de nos drop zones » : centres de la carte affichée seulement.
  const centers = dropZones.data && dropZones.data.map === shownMap.key ? dropZones.data.centers : []
  const radius = dropZones.data?.radiusMeters ?? DROP_ZONE_RADIUS_METERS
  const dropZoneState = dropZoneFilterState({
    clanKnown,
    clanId,
    loading: dropZones.loading,
    error: Boolean(dropZones.error),
    centers,
    radius,
    mapLabel: requestedMap.label,
  })
  const nearActive = nearOn && dropZoneState.status === 'ready'
  const near = nearActive ? { centers, radius } : null

  const filter = { hiddenFamilies, hiddenKinds, near }
  const shownSpots = visibleSpots(spots, filter)
  const shownPoints = visiblePoints(points, filter)
  const families = shownFamilies(spots)

  const selectedPoint = selection?.type === 'point' ? (points.find((point) => point.id === selection.id) ?? null) : null
  const selectedSpot = selection?.type === 'spot' ? (spots.find((spot) => spotKey(spot) === selection.key) ?? null) : null
  const reportedPoint = flow?.type === 'report' ? (points.find((point) => point.id === flow.pointId) ?? null) : null

  const placing = isPlacingStep(flow)
  const draftKind = flow?.type === 'propose' ? flow.kind : (reportedPoint?.kind ?? null)
  const draft =
    flow && flow.step !== 'done' && flow.position && (flow.type === 'propose' || flow.reason === 'misplaced') ? { ...flow.position, kind: draftKind } : null

  const chip = data ? mapStateChip(data.state) : null
  const recheck = data ? recheckNotice(data.state) : null
  const firstLoad = !data && loading
  const showEmpty = Boolean(data) && !loading && !flow && points.length === 0

  /** Sur mobile, le panneau est sous la carte : on l'amène à l'écran quand il change de contenu. */
  const revealPanel = useCallback(() => {
    requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel || window.matchMedia('(min-width: 768px)').matches) return
      if (panel.getBoundingClientRect().top > window.innerHeight - 120) panel.scrollIntoView({ block: 'start' })
    })
  }, [])

  function selectMap(key: string) {
    if (key === mapKey) return
    setSelection(null)
    setFlow(null)
    setNotice(null)
    setSheetError(null)
    viewportRef.current?.reset()
    onMapChange(key)
  }

  function stepMap(direction: 'prev' | 'next') {
    const index = MAP_KEYS.indexOf(requestedMap.key)
    selectMap(MAP_KEYS[(index + (direction === 'next' ? 1 : MAP_KEYS.length - 1)) % MAP_KEYS.length])
  }

  function select(next: ResourceSelection) {
    setSelection(next)
    setSheetError(null)
    setNotice(null)
    revealPanel()
  }

  function closeSheet() {
    setSelection(null)
    setSheetError(null)
  }

  function startProposal() {
    setSelection(null)
    setNotice(null)
    setSheetError(null)
    setFlow(newProposeFlow())
  }

  function startReport(point: ResourcePointView) {
    setSheetError(null)
    setFlow(newReportFlow(point.id))
  }

  function patchFlow(patch: FlowPatch) {
    setFlow((current) => (current ? ({ ...current, ...patch, error: null } as ResourceFlow) : current))
  }

  function nextStep() {
    setFlow((current) => {
      if (!current || current.step === 'done') return current
      if (current.type === 'report') return current.reason ? { ...current, step: reportNextStep(current.step, current.reason), error: null } : current
      return { ...current, step: current.step === 1 ? 2 : 3, error: null }
    })
  }

  function previousStep() {
    setFlow((current) => {
      if (!current || current.step === 'done') return current
      if (current.type === 'report') return current.reason ? { ...current, step: reportPreviousStep(current.step, current.reason), error: null } : current
      return { ...current, step: current.step === 3 ? 2 : 1, error: null }
    })
  }

  /** Fermer un parcours : « Signaler » revient à la fiche du point, « Proposer » au panneau des couches. */
  function closeFlow() {
    if (flow?.type === 'propose' || flow?.step === 'done') setSelection(null)
    setFlow(null)
  }

  async function submitFlow() {
    if (!flow || flow.step === 'done' || flow.sending) return
    setFlow({ ...flow, sending: true, error: null })
    try {
      if (flow.type === 'propose') {
        if (!flow.position || !flow.kind) throw new Error('Place le point et choisis son type.')
        const body = buildProposalBody({ map: shownMap.key, kind: flow.kind, position: flow.position, comment: flow.comment })
        const result = await postJson<ResourceProposalResponse>('/api/resources/points', body)
        update((current) => applyProposal(current, result.point, result.validatedCount))
        setFlow({ ...flow, step: 'done', sending: false, validatedCount: result.validatedCount })
      } else {
        if (!flow.reason) throw new Error('Choisis un motif.')
        const body = buildReportBody({ reason: flow.reason, position: flow.position, proposedKind: flow.kind, comment: flow.comment })
        const result = await postJson<ResourceReportResponse>(pointPath(flow.pointId, 'reports'), body)
        const pointId = flow.pointId
        update((current) => applyReport(current, pointId, result.validatedCount))
        setFlow({ ...flow, step: 'done', sending: false, validatedCount: result.validatedCount })
      }
      revealPanel()
    } catch (caught) {
      setFlow({ ...flow, sending: false, error: caught instanceof Error ? caught.message : 'L’envoi n’a pas abouti.' })
    }
  }

  async function confirmPoint(point: ResourcePointView) {
    setConfirming(true)
    setSheetError(null)
    try {
      const result = await postJson<{ point: ResourcePointView }>(pointPath(point.id, 'confirm'))
      update((current) => applyConfirmation(current, result.point))
    } catch (caught) {
      setSheetError(caught instanceof Error ? caught.message : 'La confirmation n’a pas abouti.')
    } finally {
      setConfirming(false)
    }
  }

  async function cancelProposal() {
    if (!cancelTarget) return
    const pointId = cancelTarget.id
    setCancelState({ sending: true, error: null })
    try {
      await postJson<{ ok: true }>(pointPath(pointId, 'cancel'))
      update((current) => applyCancellation(current, pointId))
      setCancelTarget(null)
      setCancelState({ sending: false, error: null })
      setSelection(null)
      setNotice('Ta proposition est annulée.')
    } catch (caught) {
      setCancelState({ sending: false, error: caught instanceof Error ? caught.message : 'L’annulation n’a pas abouti.' })
    }
  }

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value])

  let panel
  if (flow) {
    panel = (
      <ResourceFlowPanel
        flow={flow}
        map={shownMap}
        point={reportedPoint}
        onChange={patchFlow}
        onBack={previousStep}
        onNext={nextStep}
        onSubmit={submitFlow}
        onClose={closeFlow}
      />
    )
  } else if (selectedPoint) {
    panel = (
      <ResourcePointSheet
        point={selectedPoint}
        mapLabel={shownMap.label}
        signedIn={signedIn}
        confirming={confirming}
        error={sheetError}
        onClose={closeSheet}
        onConfirm={() => confirmPoint(selectedPoint)}
        onReport={() => startReport(selectedPoint)}
        onCancelProposal={() => {
          setCancelState({ sending: false, error: null })
          setCancelTarget(selectedPoint)
        }}
      />
    )
  } else if (selectedSpot) {
    panel = <ResourceSpotSheet spot={selectedSpot} mapLabel={shownMap.label} analysedMatches={data?.observed.analysedMatches ?? 0} onClose={closeSheet} />
  } else if (firstLoad) {
    panel = <CardSkeleton />
  } else {
    panel = (
      <ResourceLayersPanel
        families={families}
        familyCounts={familyCounts(spots, near)}
        hiddenFamilies={hiddenFamilies}
        onToggleFamily={(family) => setHiddenFamilies((current) => toggle(current, family))}
        kindCounts={kindCounts(points, near)}
        hiddenKinds={hiddenKinds}
        onToggleKind={(kind) => setHiddenKinds((current) => toggle(current, kind))}
        dropZones={dropZoneState}
        nearActive={nearActive}
        onNearChange={setNearOn}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="resource-explorer" data-drop-zones={dropZoneState.status}>
      {/* Ligne sous le bandeau : carte ‹ ›, état de la carte (sous la carte sur mobile), « Proposer un point ». */}
      <div className="flex items-stretch gap-2">
        <MapPager maps={MAP_KEYS} activeMap={requestedMap.key} onStep={stepMap} onSelect={selectMap} labelOf={mapLabelOf} />
        <div className="hidden min-w-0 items-center md:flex">
          <MapStateBadge chip={chip} />
        </div>
        <div className="ml-auto flex shrink-0">
          <ProposeAction signedIn={signedIn} disabled={loading || Boolean(error)} onStart={startProposal} label="Proposer un point" short="Proposer" />
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-[color-mix(in_srgb,var(--theme-ui-negative)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-ui-negative)_8%,transparent)] px-3.5 py-3"
          data-testid="resource-error"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--theme-ui-negative)]" aria-hidden="true" />
          <p className="t-body min-w-0 flex-1 text-gray-900">{error}</p>
          <button type="button" onClick={reload} className="app-btn app-btn--sm app-btn--secondary">
            Réessayer
          </button>
        </div>
      ) : null}

      {recheck ? (
        <div
          className="flex items-start gap-2.5 rounded-[14px] border border-[color-mix(in_srgb,var(--game-warn)_45%,transparent)] bg-[var(--game-warn-soft)] px-3.5 py-3"
          data-testid="resource-recheck"
        >
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-[var(--game-warn)]" aria-hidden="true" />
          <p className="t-body text-gray-900">{recheck}</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_17.5rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-2.5">
          <ResourceMapCanvas
            viewportRef={viewportRef}
            map={shownMap}
            spots={shownSpots}
            points={shownPoints}
            selection={flow?.type === 'report' ? { type: 'point', id: flow.pointId } : selection}
            draft={draft}
            placing={placing}
            interactive={!flow && !loading}
            near={near}
            faded={loading && Boolean(data)}
            onSelect={select}
            onPlace={(position) => patchFlow({ position })}
            overlay={
              showEmpty ? (
                <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center p-4">
                  <div
                    className="pointer-events-auto flex max-w-[22rem] flex-col items-center gap-2 rounded-[14px] border border-white/25 bg-slate-950/85 p-4 text-center text-white shadow-xl backdrop-blur"
                    data-testid="resource-empty"
                  >
                    <MapPinPlus className="h-6 w-6 text-[var(--theme-ui-accent)]" aria-hidden="true" />
                    <p className="text-[15px] font-bold">Aucun point saisi sur {shownMap.label}</p>
                    <p className="text-[13px] text-white/80">
                      Stations-service, garages, pontons : tu connais un bon spot ? Place le premier, un superuser le validera.
                    </p>
                    <div className="mt-1">
                      <ProposeAction signedIn={signedIn} disabled={false} onStart={startProposal} label="Proposer le premier point" />
                    </div>
                  </div>
                </div>
              ) : null
            }
          />
          <div className="md:hidden">
            <MapStateBadge chip={chip} />
          </div>
        </div>

        <div ref={panelRef} className="flex min-w-0 flex-col gap-3">
          {notice ? (
            <p role="status" className="app-panel-muted t-body flex items-center gap-2 px-3 py-2 text-gray-700" data-testid="resource-notice">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--game-pos)]" aria-hidden="true" />
              {notice}
            </p>
          ) : null}
          {panel}
        </div>
      </div>

      {cancelTarget ? (
        <ResourceCancelModal
          point={cancelTarget}
          sending={cancelState.sending}
          error={cancelState.error}
          onClose={() => setCancelTarget(null)}
          onConfirm={cancelProposal}
        />
      ) : null}
    </div>
  )
}
