'use client'

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { mapDisplayName } from '@/lib/map-label-service'

/**
 * Commandes du bandeau des pages à carte (Zones de drop, Cartographie tactique — docs/features/drop-zones.md) :
 * sélecteur de carte ‹ › avec points de pagination, pastille qui ouvre un menu (joueur, périmètre).
 */

/** Nom court de la carte (« Erangel » plutôt que « Erangel (Remastered) ») : bandeau sur une ligne, étiquettes de la carte. */
export const mapLabel = (mapName: string) => mapDisplayName(mapName, {}).replace(/\s*\(.*\)$/, '')

// ── Carte ‹ › et menu ─────────────────────────────────────────────────────────────────

export function MapPager({
  maps,
  activeMap,
  onStep,
  onSelect,
  accent = '#f97316',
}: {
  maps: readonly string[]
  activeMap: string
  onStep: (direction: 'prev' | 'next') => void
  onSelect: (mapName: string) => void
  /** Couleur du point de la carte active (orange : zones de drop, cyan : cartographie tactique). */
  accent?: string
}) {
  if (maps.length === 0) return null
  return (
    <div className="flex min-w-0 flex-1 items-center rounded-[10px] border border-gray-200 bg-white p-0.5 sm:w-[220px] sm:flex-none sm:gap-0.5 sm:p-[3px]" role="group" aria-label="Carte">
      <button type="button" onClick={() => onStep('prev')} disabled={maps.length < 2} aria-label="Carte précédente" className="grid h-7 w-[22px] shrink-0 place-items-center rounded-md text-gray-900 hover:bg-gray-100 disabled:opacity-35 sm:w-7">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-[3px]">
        <b className="max-w-full truncate text-xs font-extrabold text-gray-900 sm:text-[13px] sm:uppercase sm:tracking-[0.06em]" data-testid="active-map">
          {mapLabel(activeMap)}
        </b>
        <span className="flex gap-1">
          {maps.map((mapName) => (
            <button
              key={mapName}
              type="button"
              onClick={() => mapName !== activeMap && onSelect(mapName)}
              aria-label={mapLabel(mapName)}
              aria-current={mapName === activeMap ? 'true' : undefined}
              className="h-1 rounded-sm transition-all"
              style={{ width: mapName === activeMap ? 16 : 6, backgroundColor: mapName === activeMap ? accent : 'var(--theme-ui-border)' }}
            />
          ))}
        </span>
      </div>
      <button type="button" onClick={() => onStep('next')} disabled={maps.length < 2} aria-label="Carte suivante" className="grid h-7 w-[22px] shrink-0 place-items-center rounded-md text-gray-900 hover:bg-gray-100 disabled:opacity-35 sm:w-7">
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export type PickerItem = { key: string; label: string; color: string | null; count?: number; active: boolean; onSelect: () => void }

/** Pastille du bandeau qui ouvre un menu (joueur filtré, ou périmètre sur la page d'un joueur). */
export function PickerChip({ label, color, items, ariaLabel }: { label: string; color: string | null; items: PickerItem[]; ariaLabel: string }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${ariaLabel} : ${label}`}
        className="flex h-[38px] items-center gap-2 rounded-[10px] border bg-white px-[5px] text-gray-900 sm:pr-2"
        style={{ borderColor: color ?? 'var(--theme-ui-border)' }}
      >
        <span className="grid h-[26px] w-[26px] place-items-center rounded-full text-xs font-black text-[#020617]" style={{ backgroundColor: color ?? 'var(--theme-ui-surface-strong)' }}>
          {color ? label.replace(/^Joueur\s+/, '').charAt(0).toUpperCase() : ''}
        </span>
        <span className="hidden max-w-[120px] truncate text-[13px] font-semibold sm:inline">{label}</span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-gray-500 sm:block" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label={ariaLabel} className="app-panel absolute right-0 top-[44px] z-50 flex max-h-[60vh] w-[230px] flex-col gap-0.5 overflow-y-auto p-1.5 shadow-xl">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitemradio"
              aria-checked={item.active}
              onClick={() => {
                item.onSelect()
                setOpen(false)
              }}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-left hover:bg-gray-100 ${item.active ? 'bg-gray-100' : ''}`}
            >
              <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11px] font-black text-[#020617]" style={{ backgroundColor: item.color ?? 'var(--theme-ui-surface-strong)' }}>
                {item.color ? item.label.replace(/^Joueur\s+/, '').charAt(0).toUpperCase() : ''}
              </span>
              <span className={`min-w-0 flex-1 truncate text-[13px] text-gray-900 ${item.active ? 'font-extrabold' : 'font-medium'}`}>{item.label}</span>
              {item.count !== undefined ? <span className="text-xs tabular-nums text-gray-500">{item.count}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
