'use client'

import { Check, type LucideIcon } from 'lucide-react'
import { useId } from 'react'

import { Switch } from '@/components/clan-lifecycle/LifecycleShared'
import { FAMILY_ICONS, KIND_ICONS } from '@/components/resources/resource-icons'
import {
  OBSERVED_FAMILY_LABELS,
  RESOURCE_POINT_KINDS,
  RESOURCE_POINT_KIND_LABELS,
  type ObservedFamily,
  type ResourcePointKind,
} from '@/lib/resources/resource-map'

/**
 * Panneau de droite au repos : couches (observés, saisis), interrupteur « Autour de nos drop zones » et légende.
 * Cases et interrupteur de la charte (§5e : case 18 px rayon 6 à l'accent, interrupteur 36 × 20). Sur mobile, les
 * couches passent sur deux colonnes.
 */

export type DropZoneFilterState =
  | { status: 'no-clan' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty'; mapLabel: string }
  | { status: 'ready'; summary: string }

type Props = {
  families: ObservedFamily[]
  familyCounts: Record<ObservedFamily, number>
  hiddenFamilies: readonly ObservedFamily[]
  onToggleFamily: (family: ObservedFamily) => void
  kindCounts: Record<ResourcePointKind, number>
  hiddenKinds: readonly ResourcePointKind[]
  onToggleKind: (kind: ResourcePointKind) => void
  dropZones: DropZoneFilterState
  nearActive: boolean
  onNearChange: (active: boolean) => void
}

function LayerCheckbox({
  icon: Icon,
  label,
  count,
  checked,
  onChange,
  testId,
}: {
  icon: LucideIcon
  label: string
  count: number
  checked: boolean
  onChange: () => void
  testId: string
}) {
  return (
    <label
      className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[8px] px-1.5 py-1 transition-colors hover:bg-gray-50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--theme-ui-accent-ring)]"
      data-testid={testId}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] ${
          checked ? 'bg-[var(--theme-ui-accent)] text-[#1c1003]' : 'border-[1.5px] border-gray-300 bg-white'
        }`}
        aria-hidden="true"
      >
        {checked ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}
      </span>
      <Icon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
      <span className="t-body min-w-0 flex-1 leading-tight text-gray-900">{label}</span>
      <span className="t-num text-xs font-bold text-gray-500" data-testid="layer-count">
        {count}
      </span>
    </label>
  )
}

function dropZoneHelp(state: DropZoneFilterState) {
  switch (state.status) {
    case 'ready':
      return state.summary
    case 'no-clan':
      return 'Choisis un clan pour filtrer autour de ses drop zones.'
    case 'loading':
      return 'Recherche des drop zones du clan…'
    case 'error':
      return 'Drop zones indisponibles pour le moment.'
    default:
      return `Aucun drop du clan sur ${state.mapLabel} pour l’instant.`
  }
}

/** Marqueurs de la légende, sur un fond de carte : les mêmes formes que sur la map. */
function LegendSwatch({ variant }: { variant: 'observed' | 'validated' | 'pending' | 'to_confirm' }) {
  return (
    <span className="bg-map-fallback grid h-7 w-7 shrink-0 place-items-center rounded-[6px]" aria-hidden="true">
      {variant === 'observed' ? (
        <span className="flex items-end gap-0.5">
          <span className="h-2 w-2 rounded-full bg-white/95 opacity-60" />
          <span className="h-3.5 w-3.5 rounded-full bg-white/95" />
        </span>
      ) : (
        <span
          className={`h-3.5 w-3.5 rounded-[4px] border-2 bg-slate-950/90 ${
            variant === 'to_confirm' ? 'border-dashed border-[var(--game-warn)]' : variant === 'pending' ? 'border-dashed border-white/90' : 'border-white/90'
          }`}
        />
      )}
    </span>
  )
}

const LEGEND: Array<{ variant: 'observed' | 'validated' | 'pending' | 'to_confirm'; label: string }> = [
  { variant: 'observed', label: 'Observé : plus c’est gros, plus c’est fréquent' },
  { variant: 'validated', label: 'Saisi et validé' },
  { variant: 'pending', label: 'En attente, visible par toi' },
  { variant: 'to_confirm', label: 'À confirmer' },
]

export default function ResourceLayersPanel({
  families,
  familyCounts,
  hiddenFamilies,
  onToggleFamily,
  kindCounts,
  hiddenKinds,
  onToggleKind,
  dropZones,
  nearActive,
  onNearChange,
}: Props) {
  const nearLabelId = useId()
  const nearHelpId = useId()
  return (
    <section className="app-panel flex flex-col gap-4 p-4" aria-label="Couches de la carte" data-testid="resource-layers">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="t-label mb-1.5">Observés dans les parties</legend>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 md:grid-cols-1">
          {families.map((family) => (
            <LayerCheckbox
              key={family}
              icon={FAMILY_ICONS[family]}
              label={OBSERVED_FAMILY_LABELS[family]}
              count={familyCounts[family]}
              checked={!hiddenFamilies.includes(family)}
              onChange={() => onToggleFamily(family)}
              testId={`layer-${family}`}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="t-label mb-1.5">Saisis par les joueurs</legend>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 md:grid-cols-1">
          {RESOURCE_POINT_KINDS.map((kind) => (
            <LayerCheckbox
              key={kind}
              icon={KIND_ICONS[kind]}
              label={RESOURCE_POINT_KIND_LABELS[kind].plural}
              count={kindCounts[kind]}
              checked={!hiddenKinds.includes(kind)}
              onChange={() => onToggleKind(kind)}
              testId={`layer-${kind}`}
            />
          ))}
        </div>
      </fieldset>

      <div className="flex items-start gap-3 border-t border-gray-200 pt-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={nearLabelId} className="t-body font-semibold text-gray-900">
            Autour de nos drop zones
          </span>
          <span id={nearHelpId} className="t-meta" data-testid="near-help">
            {dropZoneHelp(dropZones)}
          </span>
        </div>
        <Switch
          checked={nearActive}
          onChange={onNearChange}
          disabled={dropZones.status !== 'ready'}
          labelledBy={nearLabelId}
          describedBy={nearHelpId}
          testId="near-switch"
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-gray-200 pt-3.5">
        <h2 className="t-label">Légende</h2>
        <ul className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-1" data-testid="resource-legend">
          {LEGEND.map((entry) => (
            <li key={entry.variant} className="flex items-center gap-2.5 text-xs text-gray-700">
              <LegendSwatch variant={entry.variant} />
              {entry.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
