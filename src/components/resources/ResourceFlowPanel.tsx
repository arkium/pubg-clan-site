'use client'

import { AlertTriangle, Award, CheckCircle2, Crosshair, X, type LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { KIND_ICONS, REPORT_ICONS } from '@/components/resources/resource-icons'
import type { ResourcePointView } from '@/lib/resources/resource-api'
import {
  RESOURCE_COMMENT_MAX,
  RESOURCE_POINT_KINDS,
  RESOURCE_REPORT_KINDS,
  RESOURCE_REPORT_KIND_LABELS,
  gridLabel,
  type ResourceMapDefinition,
  type ResourcePointKind,
  type ResourceReportKind,
} from '@/lib/resources/resource-map'
import { pointKindLabel, validatedCountLabel, type FlowStep } from '@/lib/resources/resource-view'

/**
 * Parcours en trois étapes du panneau de droite (maquette) : « Signaler un problème » (motif → nouvelle position ou
 * nouveau type → envoi ; « N'existe plus » saute l'étape 2) et « Proposer un point » (placer → type → envoi). Étape
 * « n / 3 » et barre en trois segments à l'accent ; fin : remerciement, nombre de points validés du joueur, « Retour à
 * la carte ». Présentation seulement : l'état et les envois vivent dans `ResourceMapExplorer`.
 */

type FlowBase = {
  step: FlowStep | 'done'
  position: { x: number; y: number } | null
  kind: ResourcePointKind | null
  comment: string
  sending: boolean
  error: string | null
  validatedCount: number | null
}

export type ProposeFlow = FlowBase & { type: 'propose' }
export type ReportFlow = FlowBase & { type: 'report'; pointId: string; reason: ResourceReportKind | null }
export type ResourceFlow = ProposeFlow | ReportFlow
export type FlowPatch = Partial<Pick<FlowBase, 'position' | 'kind' | 'comment'>> & { reason?: ResourceReportKind }

export function newProposeFlow(): ProposeFlow {
  return { type: 'propose', step: 1, position: null, kind: null, comment: '', sending: false, error: null, validatedCount: null }
}

export function newReportFlow(pointId: string): ReportFlow {
  return { type: 'report', pointId, reason: null, step: 1, position: null, kind: null, comment: '', sending: false, error: null, validatedCount: null }
}

/** Étape où l'on clique sur la carte. */
export function isPlacingStep(flow: ResourceFlow | null) {
  if (!flow) return false
  return flow.type === 'propose' ? flow.step === 1 : flow.step === 2 && flow.reason === 'misplaced'
}

type Props = {
  flow: ResourceFlow
  map: ResourceMapDefinition
  /** Point signalé (parcours « Signaler »). */
  point: ResourcePointView | null
  onChange: (patch: FlowPatch) => void
  onBack: () => void
  onNext: () => void
  onSubmit: () => void
  onClose: () => void
}

function stepTitle(flow: ResourceFlow) {
  if (flow.type === 'propose') return flow.step === 1 ? 'Placer le point' : flow.step === 2 ? 'Type' : 'Envoyer'
  if (flow.step === 1) return 'Motif'
  if (flow.step === 2) return flow.reason === 'wrong_kind' ? 'Nouveau type' : 'Nouvelle position'
  return 'Envoyer'
}

function Tile({
  name,
  checked,
  disabled = false,
  icon: Icon,
  label,
  hint,
  onSelect,
  vertical = false,
}: {
  name: string
  checked: boolean
  disabled?: boolean
  icon: LucideIcon
  label: string
  hint?: string
  onSelect: () => void
  vertical?: boolean
}) {
  return (
    <label
      className={`flex min-h-11 items-center gap-2 rounded-[10px] border p-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--theme-ui-accent-ring)] ${
        vertical ? 'flex-col justify-center text-center' : ''
      } ${
        checked
          ? 'border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]'
          : disabled
            ? 'cursor-not-allowed border-gray-200 bg-white opacity-45'
            : 'cursor-pointer border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onSelect} className="sr-only" />
      <Icon className={`h-[18px] w-[18px] shrink-0 ${checked ? 'text-[var(--theme-ui-accent-text)]' : 'text-gray-500'}`} aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span className={`text-[13px] font-bold leading-tight ${checked ? 'text-[var(--theme-ui-accent-text)]' : 'text-gray-900'}`}>{label}</span>
        {hint ? <span className="t-meta">{hint}</span> : null}
      </span>
    </label>
  )
}

function KindTiles({ value, current, onSelect }: { value: ResourcePointKind | null; current?: ResourcePointKind; onSelect: (kind: ResourcePointKind) => void }) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label="Type du point" className="grid grid-cols-2 gap-2">
      {RESOURCE_POINT_KINDS.map((kind) => (
        <Tile
          key={kind}
          name={name}
          checked={value === kind}
          disabled={kind === current}
          icon={KIND_ICONS[kind]}
          label={pointKindLabel(kind)}
          hint={kind === current ? 'Type actuel' : undefined}
          onSelect={() => onSelect(kind)}
        />
      ))}
    </div>
  )
}

function PlacementStatus({ map, position, help }: { map: ResourceMapDefinition; position: { x: number; y: number } | null; help: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="t-body text-gray-700">{help}</p>
      <p
        className={`flex items-center gap-1.5 text-[13px] font-semibold ${position ? 'text-[var(--theme-ui-accent-text)]' : 'text-gray-500'}`}
        data-testid="placement-status"
        aria-live="polite"
      >
        <Crosshair className="h-4 w-4 shrink-0" aria-hidden="true" />
        {position ? `Placé en grille ${gridLabel(map, position.x, position.y)}` : 'Pas encore placé'}
      </p>
    </div>
  )
}

function CommentField({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="t-label">
        Commentaire (facultatif)
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={RESOURCE_COMMENT_MAX}
        rows={3}
        placeholder={placeholder}
        className="app-input min-h-[5.5rem] w-full resize-y py-2"
      />
      <span className="t-meta t-num self-end">
        {value.length} / {RESOURCE_COMMENT_MAX}
      </span>
    </div>
  )
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3">{children}</div>
}

export default function ResourceFlowPanel({ flow, map, point, onChange, onBack, onNext, onSubmit, onClose }: Props) {
  const reasonName = useId()
  const report = flow.type === 'report' ? flow : null
  const title = report ? 'Signaler un problème' : 'Proposer un point'
  const meta = report && point ? `${pointKindLabel(point.kind)} · ${map.label} · grille ${point.grid}` : map.label

  if (flow.step === 'done') {
    return (
      <section className="app-panel flex flex-col items-start gap-3 p-4" aria-labelledby="resource-flow-title" data-testid="resource-flow" data-step="done">
        <span className="grid h-11 w-11 place-items-center rounded-[10px] bg-[var(--game-pos-soft)] text-[var(--game-pos)]" aria-hidden="true">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div role="status" className="flex flex-col gap-1">
          <h2 id="resource-flow-title" className="t-card-title">
            {report ? 'Merci, ton signalement attend la validation' : 'Merci, ta proposition attend la validation'}
          </h2>
          <p className="t-body text-gray-700">
            {report
              ? 'Un superuser le vérifie. Si d’autres joueurs signalent la même chose, ça ira plus vite.'
              : 'Un superuser la vérifie. En attendant, le point apparaît en pointillés, pour toi seulement.'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--theme-ui-surface-strong)] px-2.5 py-1 text-xs font-bold text-gray-700" data-testid="validated-count">
          <Award className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {validatedCountLabel(flow.validatedCount ?? 0)}
        </span>
        <button type="button" onClick={onClose} className="app-btn app-btn--md app-btn--secondary">
          Retour à la carte
        </button>
      </section>
    )
  }

  const step = flow.step
  const canContinue = report
    ? step === 1
      ? report.reason !== null
      : report.reason === 'misplaced'
        ? report.position !== null
        : report.kind !== null
    : step === 1
      ? flow.position !== null
      : flow.kind !== null

  return (
    <section className="app-panel flex flex-col gap-4 p-4" aria-labelledby="resource-flow-title" data-testid="resource-flow" data-step={step}>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="resource-flow-title" className="t-card-title">
            {title}
          </h2>
          <p className="t-meta">{meta}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="-mr-1 -mt-1 shrink-0 rounded-[8px] p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="t-label">{stepTitle(flow)}</span>
          <span className="t-meta t-num" data-testid="flow-step">
            Étape {step} / 3
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1" aria-hidden="true">
          {[1, 2, 3].map((index) => (
            <span key={index} className={`h-1 rounded-full ${index <= step ? 'bg-[var(--theme-ui-accent)]' : 'bg-[var(--theme-ui-surface-strong)]'}`} />
          ))}
        </div>
      </div>

      {report && step === 1 ? (
        <div role="radiogroup" aria-label="Motif du signalement" className="grid grid-cols-3 gap-2">
          {RESOURCE_REPORT_KINDS.map((reason) => (
            <Tile
              key={reason}
              name={reasonName}
              checked={report.reason === reason}
              icon={REPORT_ICONS[reason]}
              label={RESOURCE_REPORT_KIND_LABELS[reason]}
              onSelect={() => onChange({ reason })}
              vertical
            />
          ))}
        </div>
      ) : null}

      {report && step === 2 && report.reason === 'misplaced' ? (
        <PlacementStatus map={map} position={report.position} help="Clique sur la carte à la bonne position. Zoome pour être précis." />
      ) : null}

      {report && step === 2 && report.reason === 'wrong_kind' ? (
        <KindTiles value={report.kind} current={point?.kind} onSelect={(kind) => onChange({ kind })} />
      ) : null}

      {!report && step === 1 ? (
        <PlacementStatus map={map} position={flow.position} help="Clique sur la carte à l’endroit du point. Zoome pour être précis." />
      ) : null}

      {!report && step === 2 ? <KindTiles value={flow.kind} onSelect={(kind) => onChange({ kind })} /> : null}

      {step === 3 ? (
        <CommentField
          value={flow.comment}
          placeholder={report ? 'ex. Détruite depuis la mise à jour' : 'ex. Derrière la grange, côté route'}
          onChange={(comment) => onChange({ comment })}
        />
      ) : null}

      {flow.error ? (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] font-semibold text-[var(--theme-ui-negative)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {flow.error}
        </p>
      ) : null}

      <Footer>
        <button type="button" onClick={step === 1 ? onClose : onBack} disabled={flow.sending} className="app-btn app-btn--md app-btn--secondary">
          {step === 1 ? 'Annuler' : 'Retour'}
        </button>
        {step === 3 ? (
          <button type="button" onClick={onSubmit} disabled={flow.sending} className="app-btn app-btn--md app-btn--primary">
            {flow.sending ? 'Envoi…' : 'Envoyer'}
          </button>
        ) : (
          <button type="button" onClick={onNext} disabled={!canContinue} className="app-btn app-btn--md app-btn--primary">
            Continuer
          </button>
        )}
      </Footer>
    </section>
  )
}
