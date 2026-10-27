'use client'

import { ChevronDown, Gamepad2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { MATCH_TYPE_FILTER_OPTIONS } from '@/lib/clan-league'
import type { ClanMatchTypeFilter } from '@/types/squad-matches'

const playerMatchTypeLabel = (value: ClanMatchTypeFilter) =>
  MATCH_TYPE_FILTER_OPTIONS.find((choice) => choice.value === value)?.label ?? 'Tous'

/**
 * Filtre « Type de partie » des pages joueur (docs/TODO/aide-des-pages.md, lot 7) : une pastille qui ouvre un menu,
 * pour tenir sur la ligne du bandeau à côté de la période et du périmètre (cinq boutons segmentés n'y tiennent pas sur
 * mobile). Même menu que la pastille de périmètre (`PickerChip`, classes `app-menu`) ; état actif en accent.
 */
export default function MatchTypeMenu({ value, onChange }: { value: ClanMatchTypeFilter; onChange: (value: ClanMatchTypeFilter) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const label = playerMatchTypeLabel(value)

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
    <div ref={rootRef} className="relative flex shrink-0 self-stretch" data-testid="match-type-menu">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Type de partie : ${label}`}
        className="flex items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-2 text-[13px] font-semibold text-gray-900"
      >
        <Gamepad2 className="h-4 w-4 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
        {/* Sous 640 px, l'icône seule, comme la pastille de périmètre : la ligne du bandeau doit tenir. */}
        <span className="hidden whitespace-nowrap sm:inline">{label}</span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-gray-500 sm:block" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="Type de partie" className="app-menu absolute right-0 top-full z-50 mt-1.5 w-[190px]">
          {MATCH_TYPE_FILTER_OPTIONS.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="menuitemradio"
              aria-checked={choice.value === value}
              onClick={() => {
                onChange(choice.value)
                setOpen(false)
              }}
              className={`app-menu__item justify-start ${choice.value === value ? 'app-menu__item--active' : ''}`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
