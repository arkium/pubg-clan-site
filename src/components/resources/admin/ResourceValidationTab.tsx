'use client'

import { CheckCheck, Inbox, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  ResourceDecision,
  ResourceDecisionInput,
  ResourceDecisionsResponse,
  ResourceMapSummary,
  ResourceQueueItem,
  ResourceQueueResponse,
} from '@/lib/resources/resource-api'
import { decisionToastLabel, pendingSummary, pruneSelection, savedPointsLabel, selectionState, toggleAll, toggleSelected } from '@/lib/resources/resource-admin-view'

import {
  ButtonSpinner,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InlineError,
  TOAST_MS,
  ToastStack,
  postJson,
  useAdminResource,
  useToasts,
  type ResourceToast,
} from './ResourceAdminShared'
import ResourceMapsPanel from './ResourceMapsPanel'
import ResourceQueueRow, { type EditDecision } from './ResourceQueueRow'

/**
 * Onglet « Validation » de la Carte des ressources (SuperUser) — docs/features/carte-ressources.md §5, maquette
 * « Carte des ressources - superuser » (§4 · File de validation). File de toutes les cartes à gauche (propositions et
 * signalements regroupés, sélection multiple, Valider / Modifier / Refuser par ligne, chaque décision annulable par la
 * notification), panneau « Par carte » à droite (empilés sur mobile).
 *
 * Interface figée (la page l'importe) : `onQueueCountChange(pendingCount)` après chaque chargement et chaque décision,
 * pour la pastille de l'onglet.
 */

const QUEUE_URL = '/api/resources/admin/queue'
const DECISIONS_URL = '/api/resources/admin/decisions'
const undoUrl = (actionId: string) => `/api/resources/admin/history/${encodeURIComponent(actionId)}/undo`
const mapUrl = (key: string) => `/api/resources/admin/maps/${encodeURIComponent(key)}`

const NO_IDS: ReadonlySet<string> = new Set()

type DecisionEntry = { item: ResourceQueueItem; decision: ResourceDecision; edit?: EditDecision }

function QueueSkeleton() {
  return (
    <ul className="flex flex-col" aria-busy="true" aria-label="Chargement de la file">
      {Array.from({ length: 3 }, (_, index) => (
        <li key={index} className="flex items-start gap-3 border-b border-gray-200 px-4 py-3.5 last:border-b-0">
          <span className="mt-3.5 h-[18px] w-[18px] shrink-0 animate-pulse rounded-[6px] bg-[var(--theme-ui-surface-strong)]" />
          <span className="h-[46px] w-[46px] shrink-0 animate-pulse rounded-[8px] bg-[var(--theme-ui-surface-strong)]" />
          <span className="h-[46px] w-[46px] shrink-0 animate-pulse rounded-[8px] bg-[var(--theme-ui-surface-strong)]" />
          <span className="flex flex-1 flex-col gap-2 pt-1">
            <span className="h-3.5 w-1/3 animate-pulse rounded-[6px] bg-[var(--theme-ui-surface-strong)]" />
            <span className="h-3 w-1/2 animate-pulse rounded-[6px] bg-[var(--theme-ui-surface-strong)]" />
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function ResourceValidationTab({ onQueueCountChange }: { onQueueCountChange?: (count: number) => void }) {
  const [token, setToken] = useState(0)
  const queue = useAdminResource<ResourceQueueResponse>(QUEUE_URL, token)
  const data = queue.data
  const reload = useCallback(() => setToken((value) => value + 1), [])

  // Pastille de l'onglet : à chaque réponse de la file (le rappel le plus récent de la page, sans relancer l'effet).
  const countCallback = useRef(onQueueCountChange)
  useEffect(() => {
    countCallback.current = onQueueCountChange
  }, [onQueueCountChange])
  const reportCount = useCallback((count: number) => countCallback.current?.(count), [])
  useEffect(() => {
    if (data) reportCount(data.pendingCount)
  }, [data, reportCount])

  // Lignes traitées, masquées jusqu'à la réponse suivante de la file ; corrections locales des cartes, de même.
  const [done, setDone] = useState<{ source: ResourceQueueResponse | null; ids: ReadonlySet<string> }>({ source: null, ids: NO_IDS })
  const doneIds = done.source === data ? done.ids : NO_IDS
  const [mapPatch, setMapPatch] = useState<{ source: ResourceQueueResponse | null; maps: Record<string, ResourceMapSummary> }>({ source: null, maps: {} })
  const patchedMaps = mapPatch.source === data ? mapPatch.maps : {}

  const [selectedRaw, setSelected] = useState<ReadonlySet<string>>(NO_IDS)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, setPending] = useState<Record<string, ResourceDecision>>({})
  const [batchBusy, setBatchBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [recheck, setRecheck] = useState<{ map: ResourceMapSummary; busy: boolean; error: string | null } | null>(null)
  const [verifyingKey, setVerifyingKey] = useState<string | null>(null)
  const { toasts, push, update, dismiss } = useToasts()

  const items = (data?.items ?? []).filter((item) => !doneIds.has(item.id))
  const ids = items.map((item) => item.id)
  const selected = pruneSelection(selectedRaw, ids)
  const selection = selectionState(ids, selected)
  const maps = (data?.maps ?? []).map((map) => patchedMaps[map.key] ?? map)
  const pendingCount = Math.max(0, (data?.pendingCount ?? 0) - doneIds.size)

  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selection === 'some'
  }, [selection])

  async function decide(entries: DecisionEntry[], batch = false) {
    if (entries.length === 0) return
    const entryIds = entries.map((entry) => entry.item.id)
    const source = data
    if (batch) setBatchBusy(true)
    setPending((current) => ({ ...current, ...Object.fromEntries(entries.map((entry) => [entry.item.id, entry.decision])) }))
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !entryIds.includes(id))))

    const decisions: ResourceDecisionInput[] = entries.map(({ item, decision, edit }) => ({ itemId: item.id, decision, ...(edit ?? {}) }))
    const result = await postJson<ResourceDecisionsResponse>(DECISIONS_URL, { decisions })

    setPending((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !entryIds.includes(id))))
    if (batch) setBatchBusy(false)
    if (!result.ok) {
      setErrors((current) => ({ ...current, ...Object.fromEntries(entryIds.map((id) => [id, result.error])) }))
      return
    }

    const byId = new Map(result.data.results.map((row) => [row.itemId, row]))
    const succeeded = entryIds.filter((id) => byId.get(id)?.ok)
    const failures = entryIds
      .filter((id) => !byId.get(id)?.ok)
      .map((id) => [id, byId.get(id)?.error || 'Décision non enregistrée — réessaie.'] as const)
    if (failures.length > 0) setErrors((current) => ({ ...current, ...Object.fromEntries(failures) }))

    if (succeeded.length > 0) {
      setDone((current) => ({ source, ids: new Set([...(current.source === source ? current.ids : []), ...succeeded]) }))
      setSelected((current) => new Set([...current].filter((id) => !succeeded.includes(id))))
      setEditingId((current) => (current && succeeded.includes(current) ? null : current))
      const actionIds = succeeded.map((id) => byId.get(id)?.actionId).filter((id): id is string => Boolean(id))
      const decision = entries.find((entry) => entry.item.id === succeeded[0])?.decision ?? 'validate'
      push({ text: decisionToastLabel(decision, succeeded.length), tone: 'success', undo: actionIds.length > 0 ? { actionIds } : undefined })
    }
    reportCount(result.data.pendingCount)
    reload()
  }

  async function undo(toast: ResourceToast) {
    if (!toast.undo || toast.undo.busy) return
    const actionIds = toast.undo.actionIds
    update(toast.id, { undo: { actionIds, busy: true } })
    let failure: string | null = null
    for (const actionId of actionIds) {
      const result = await postJson<{ ok: true }>(undoUrl(actionId))
      if (!result.ok) {
        failure = result.error
        break
      }
    }
    if (failure) update(toast.id, { text: `Annulation impossible : ${failure}`, tone: 'error', undo: undefined }, TOAST_MS)
    else update(toast.id, { text: actionIds.length > 1 ? 'Décisions annulées' : 'Décision annulée', undo: undefined }, TOAST_MS)
    reload()
  }

  async function confirmRecheck() {
    if (!recheck) return
    const target = recheck.map
    setRecheck({ map: target, busy: true, error: null })
    const result = await postJson<{ map: ResourceMapSummary }>(mapUrl(target.key), { action: 'recheck' })
    if (!result.ok) {
      setRecheck({ map: target, busy: false, error: result.error })
      return
    }
    setMapPatch((current) => ({ source: data, maps: { ...(current.source === data ? current.maps : {}), [target.key]: result.data.map } }))
    setRecheck(null)
    push({ text: `${target.label} : points à confirmer par les joueurs`, tone: 'success' })
  }

  async function verify(map: ResourceMapSummary) {
    setVerifyingKey(map.key)
    const result = await postJson<{ map: ResourceMapSummary }>(mapUrl(map.key), { action: 'verify' })
    setVerifyingKey(null)
    if (!result.ok) {
      push({ text: `${map.label} : ${result.error}`, tone: 'error' })
      return
    }
    setMapPatch((current) => ({ source: data, maps: { ...(current.source === data ? current.maps : {}), [map.key]: result.data.map } }))
    push({ text: `${map.label} marquée vérifiée`, tone: 'success' })
  }

  const selectedItems = items.filter((item) => selected.has(item.id))
  const refreshing = queue.loading && data !== null

  let body
  if (!data && queue.loading) body = <QueueSkeleton />
  else if (!data) body = <ErrorState message={queue.error || 'Chargement impossible.'} onRetry={reload} testId="resource-queue-error" />
  else if (items.length === 0)
    body = (
      <div className="p-4">
        <EmptyState icon={Inbox} title="Rien à valider" text="Les propositions et signalements des joueurs apparaîtront ici." testId="resource-queue-empty" />
      </div>
    )
  else
    body = (
      <ul aria-label="Éléments à valider" aria-busy={refreshing} className={`flex flex-col transition-opacity duration-150 ${refreshing ? 'opacity-60' : ''}`}>
        {items.map((item) => (
          <ResourceQueueRow
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggleSelected={() => setSelected((current) => toggleSelected(pruneSelection(current, ids), item.id))}
            pending={pending[item.id] ?? null}
            locked={batchBusy}
            error={errors[item.id] ?? null}
            editing={editingId === item.id}
            onToggleEdit={() => setEditingId((current) => (current === item.id ? null : item.id))}
            onDecide={(decision, edit) => void decide([{ item, decision, edit }])}
          />
        ))}
      </ul>
    )

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17.5rem]" data-testid="resource-validation">
      <section className="app-panel min-w-0 overflow-hidden" aria-labelledby="resource-queue-title" data-testid="resource-queue">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-gray-200 px-4 py-3">
          <label className="-m-2 grid shrink-0 cursor-pointer place-items-center p-2">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={selection === 'all'}
              onChange={() => setSelected((current) => toggleAll(ids, pruneSelection(current, ids)))}
              disabled={items.length === 0 || batchBusy}
              aria-label="Tout sélectionner"
              className="h-[18px] w-[18px] cursor-pointer accent-[var(--theme-ui-accent)] disabled:cursor-not-allowed disabled:opacity-45"
            />
          </label>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id="resource-queue-title" className="t-card-title">
              File de validation
            </h2>
            <p className="t-meta t-num" data-testid="resource-queue-summary">
              {data ? pendingSummary(pendingCount) : 'Chargement…'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void decide(selectedItems.map((item) => ({ item, decision: 'validate' as const })), true)}
            disabled={selectedItems.length === 0 || batchBusy}
            className="app-btn app-btn--sm app-btn--primary w-full gap-1.5 sm:w-auto"
          >
            {batchBusy ? <ButtonSpinner /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
            Valider la sélection
            {selectedItems.length > 0 ? <span className="t-num">({selectedItems.length})</span> : null}
          </button>
        </header>
        {data && queue.error ? (
          <div className="border-b border-gray-200 px-4 py-2">
            <InlineError>{queue.error}</InlineError>
          </div>
        ) : null}
        {body}
      </section>

      {data ? (
        <ResourceMapsPanel maps={maps} busyKey={verifyingKey} onRecheck={(map) => setRecheck({ map, busy: false, error: null })} onVerify={(map) => void verify(map)} />
      ) : null}

      {recheck ? (
        <ConfirmDialog
          icon={RefreshCw}
          tone="warn"
          title={`Marquer ${recheck.map.label} à revérifier ?`}
          confirmLabel="Marquer à revérifier"
          busy={recheck.busy}
          error={recheck.error}
          onCancel={() => setRecheck(null)}
          onConfirm={() => void confirmRecheck()}
          testId="resource-recheck-dialog"
        >
          {recheck.map.validatedPoints > 1
            ? `Ses ${savedPointsLabel(recheck.map.validatedPoints)} passeront « à confirmer »`
            : 'Son point saisi passera « à confirmer »'}{' '}
          jusqu’à ce qu’un joueur clique «&nbsp;Toujours là&nbsp;». À faire après une mise à jour PUBG qui a modifié la carte.
        </ConfirmDialog>
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismiss} onUndo={(toast) => void undo(toast)} />
    </div>
  )
}
