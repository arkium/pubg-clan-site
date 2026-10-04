'use client'

import { Check, Pencil, Users, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import type { ResourceDecision, ResourceQueueItem } from '@/lib/resources/resource-api'
import { authorsLine, kindLabel, playersLabel, queueItemGrid, queueItemKinds, queueItemNature, queueItemTitle } from '@/lib/resources/resource-admin-view'
import { RESOURCE_POINT_KINDS, type ResourcePointKind } from '@/lib/resources/resource-map'

import { ButtonSpinner, InlineError, KindIcon, ToneChip, toneButtonProps } from './ResourceAdminShared'
import { EmptyMiniMap, ResourceMiniMap, ResourcePositionPicker } from './ResourceMiniMap'

/**
 * Une ligne de la file de validation (maquette « Carte des ressources - superuser », §4) : case de sélection, mini-cartes
 * Avant / Après, type et repère, nature, auteurs et commentaires, puis Valider · Modifier · Refuser. « Modifier » ouvre
 * sous la ligne l'éditeur (type en tuiles, marqueur à glisser) qui enregistre et valide en une décision `edit`.
 */

export type EditDecision = { kind: ResourcePointKind; x: number; y: number }

function MiniMapFigure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col items-center gap-1">
      {children}
      <figcaption className="t-label leading-none" aria-hidden="true">
        {caption}
      </figcaption>
    </figure>
  )
}

function BeforeAfter({ item }: { item: ResourceQueueItem }) {
  const grid = queueItemGrid(item)
  const missing = item.reportKind === 'missing'
  return (
    <div className="flex shrink-0 gap-1.5" data-testid="queue-minimaps">
      <MiniMapFigure caption="Avant">
        {item.before ? (
          <ResourceMiniMap
            mapKey={item.map}
            point={item.before}
            kind={item.before.kind}
            label={`Avant : ${kindLabel(item.before.kind)} en ${item.before.grid}`}
            testId="minimap-before"
          />
        ) : (
          <EmptyMiniMap label="Avant : aucun point (nouvelle proposition)" testId="minimap-before-empty" />
        )}
      </MiniMapFigure>
      <MiniMapFigure caption="Après">
        {item.after ? (
          <ResourceMiniMap mapKey={item.map} point={item.after} kind={item.after.kind} requested label={`Après : ${kindLabel(item.after.kind)} en ${item.after.grid}`} testId="minimap-after" />
        ) : missing && item.before ? (
          <ResourceMiniMap mapKey={item.map} point={item.before} kind={item.before.kind} crossed label={`Après : point retiré de ${grid}`} testId="minimap-after-removed" />
        ) : (
          <EmptyMiniMap label="Après : aucun point" testId="minimap-after-empty" />
        )}
      </MiniMapFigure>
    </div>
  )
}

/** Éditeur en ligne : type en tuiles (choisi à l'accent), marqueur à glisser, « Enregistrer et valider ». */
function QueueRowEditor({
  item,
  busy,
  onSubmit,
}: {
  item: ResourceQueueItem
  busy: boolean
  onSubmit: (edit: EditDecision) => void
}) {
  const start = item.after ?? item.before ?? { x: 0, y: 0, kind: item.kind, grid: '' }
  const [kind, setKind] = useState<ResourcePointKind>(queueItemKinds(item).to)
  const [point, setPoint] = useState({ x: Math.round(start.x), y: Math.round(start.y) })
  const labelId = useId()
  const save = toneButtonProps('pos')

  return (
    // Mobile : tuiles, mini-carte puis bouton ; à partir de 640 px, la mini-carte passe à droite.
    <div
      className="app-panel-muted mx-3 mb-3.5 grid gap-3 p-3 sm:mx-4 sm:grid-cols-[minmax(0,1fr)_16rem] sm:gap-x-4 sm:p-3.5"
      data-testid="queue-editor"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:col-start-1 sm:row-start-1">
        <div className="flex flex-col gap-1.5">
          <span id={labelId} className="t-label">
            Type :
          </span>
          <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-2">
            {RESOURCE_POINT_KINDS.map((option) => {
              const checked = option === kind
              return (
                <label
                  key={option}
                  className={`flex min-h-9 cursor-pointer items-center gap-1 rounded-[10px] border px-2 py-1.5 text-[13px] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--theme-ui-accent-ring)] sm:gap-1.5 sm:px-2.5 ${
                    checked
                      ? 'border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] font-bold text-[var(--theme-ui-accent-text)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]'
                      : 'border-gray-200 bg-white font-semibold text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <input type="radio" name={`kind-${item.id}`} value={option} checked={checked} onChange={() => setKind(option)} className="sr-only" />
                  <KindIcon kind={option} className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{kindLabel(option)}</span>
                </label>
              )
            })}
          </div>
        </div>
        <p className="t-meta">ou glisse le marqueur sur la mini-carte</p>
      </div>
      <div className="sm:col-start-2 sm:row-span-2 sm:row-start-1">
        <ResourcePositionPicker
          mapKey={item.map}
          mapLabel={item.mapLabel}
          start={start}
          value={point}
          previous={item.before}
          previousKind={item.before?.kind}
          kind={kind}
          onChange={setPoint}
        />
      </div>
      <div className="sm:col-start-1 sm:row-start-2 sm:self-end">
        <button
          type="button"
          onClick={() => onSubmit({ kind, x: point.x, y: point.y })}
          disabled={busy}
          className={`app-btn app-btn--sm gap-1.5 max-sm:w-full ${save.className}`}
          style={save.style}
        >
          {busy ? <ButtonSpinner /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          Enregistrer et valider
        </button>
      </div>
    </div>
  )
}

export default function ResourceQueueRow({
  item,
  selected,
  onToggleSelected,
  pending,
  locked,
  error,
  editing,
  onToggleEdit,
  onDecide,
}: {
  item: ResourceQueueItem
  selected: boolean
  onToggleSelected: () => void
  /** Décision en cours d'envoi pour cette ligne. */
  pending: ResourceDecision | null
  /** Une autre action (sélection multiple) est en cours : boutons désactivés. */
  locked: boolean
  error: string | null
  editing: boolean
  onToggleEdit: () => void
  onDecide: (decision: ResourceDecision, edit?: EditDecision) => void
}) {
  const titleId = useId()
  const title = queueItemTitle(item)
  const kinds = queueItemKinds(item)
  const nature = queueItemNature(item)
  const grid = queueItemGrid(item)
  const disabled = locked || pending !== null
  const validate = toneButtonProps('pos')
  const refuse = toneButtonProps('neg')

  return (
    <li className="border-b border-gray-200 last:border-b-0" data-testid="queue-row" data-item-id={item.id} aria-labelledby={titleId}>
      {/* Grille : case et mini-cartes sur deux rangées ; type et actions en haut, détails dessous (sous les actions
          aussi, pour laisser la place au texte) ; actions sur toute la largeur en dernière rangée sur mobile. */}
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-4 py-3.5 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
        <label className="col-start-1 row-span-2 row-start-1 -m-2 grid cursor-pointer place-items-start p-2 pt-[14px]">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            disabled={locked}
            aria-label={`Sélectionner : ${title} · ${item.mapLabel} · ${grid}`}
            className="h-[18px] w-[18px] cursor-pointer accent-[var(--theme-ui-accent)] disabled:cursor-not-allowed"
          />
        </label>
        <div className="col-start-2 row-span-2 row-start-1">
          <BeforeAfter item={item} />
        </div>
        <p className="col-start-3 row-start-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 sm:min-h-9">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[14px] font-bold text-gray-900">
            <KindIcon kind={kinds.to} className="h-4 w-4 shrink-0 text-gray-700" />
            <span id={titleId} data-testid="queue-row-title">
              {kinds.from ? (
                <>
                  <span className="whitespace-nowrap">{kindLabel(kinds.from)} →</span> <span className="whitespace-nowrap">{kindLabel(kinds.to)}</span>
                </>
              ) : (
                <span className="whitespace-nowrap">{title}</span>
              )}
            </span>
          </span>
          <span className="t-meta t-num whitespace-nowrap">
            {item.mapLabel} · {grid}
          </span>
        </p>
        <div className="col-start-3 row-start-2 flex min-w-0 flex-col gap-1 sm:col-end-5">
          <p className="flex flex-wrap items-center gap-1.5">
            <ToneChip tone={nature.tone} testId="queue-row-nature">
              {nature.label}
            </ToneChip>
            {item.authors.length > 1 ? (
              <ToneChip tone="neutral" icon={Users} testId="queue-row-group">
                {playersLabel(item.authors.length)}
              </ToneChip>
            ) : null}
          </p>
          <p className="t-meta" data-testid="queue-row-authors">
            {authorsLine(item.authors, item.createdAt)}
          </p>
          {item.comments.map((comment, index) => (
            <p key={index} className="t-body break-words text-gray-700" data-testid="queue-row-comment">
              «&nbsp;{comment}&nbsp;»
            </p>
          ))}
          {error ? <InlineError testId="queue-row-error">{error}</InlineError> : null}
        </div>
        <div className="col-span-full row-start-3 mt-1.5 flex items-start gap-2 self-start sm:col-span-1 sm:col-start-4 sm:row-start-1 sm:mt-0 [&>button]:max-sm:flex-1">
          <button
            type="button"
            onClick={() => onDecide('validate')}
            disabled={disabled}
            className={`app-btn app-btn--sm gap-1.5 ${validate.className}`}
            style={validate.style}
          >
            {pending === 'validate' ? <ButtonSpinner /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            Valider
          </button>
          <button
            type="button"
            onClick={onToggleEdit}
            disabled={disabled}
            aria-expanded={editing}
            className="app-btn app-btn--sm app-btn--secondary gap-1.5"
            // Éditeur ouvert : bouton teinté à l'accent (état actif). En style : `.app-btn--secondary` est hors couche.
            style={editing ? { borderColor: 'var(--theme-ui-accent-ring)', backgroundColor: 'var(--theme-ui-accent-soft)', color: 'var(--theme-ui-accent-text)' } : undefined}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Modifier
          </button>
          <button
            type="button"
            onClick={() => onDecide('refuse')}
            disabled={disabled}
            className={`app-btn app-btn--sm gap-1.5 ${refuse.className}`}
            style={refuse.style}
          >
            {pending === 'refuse' ? <ButtonSpinner /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
            Refuser
          </button>
        </div>
      </div>
      {editing ? <QueueRowEditor item={item} busy={pending === 'edit' || locked} onSubmit={(edit) => onDecide('edit', edit)} /> : null}
    </li>
  )
}
