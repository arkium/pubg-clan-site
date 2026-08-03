'use client'

import { useEffect, useRef, useState } from 'react'

import WeaponIcon from '@/components/ui/WeaponIcon'
import { resolveWeaponName } from '@/lib/pubg-assets'

type WeaponSelectProps = {
  label: string
  value: string
  weapons: string[]
  onChange: (value: string) => void
  allLabel?: string
  className?: string
}

export default function WeaponSelect({
  label,
  value,
  weapons,
  onChange,
  allLabel = 'Toutes les armes',
  className,
}: WeaponSelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selectedLabel = value === 'all' ? allLabel : resolveWeaponName(value)

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-700"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          {value !== 'all' ? <WeaponIcon id={value} size="sm" /> : <span className="text-slate-400">🔫</span>}
        </span>
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path fill="currentColor" d="M5.25 7.5 10 12.25 14.75 7.5H5.25Z" />
        </svg>
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <li role="option" aria-selected={value === 'all'}>
            <button
              type="button"
              onClick={() => {
                onChange('all')
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                value === 'all' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700'
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-400">🔫</span>
              {allLabel}
            </button>
          </li>

          {weapons.map((weapon) => (
            <li key={weapon} role="option" aria-selected={value === weapon}>
              <button
                type="button"
                onClick={() => {
                  onChange(weapon)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  value === weapon ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700'
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <WeaponIcon id={weapon} size="sm" />
                </span>
                <span className="truncate">{resolveWeaponName(weapon)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
