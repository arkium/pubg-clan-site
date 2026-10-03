'use client'

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { mapDisplayName } from '@/lib/map-label-service'
import { ROSTER_ROLES } from '@/lib/member-roster'

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
  accent = 'var(--theme-ui-accent)',
}: {
  maps: readonly string[]
  activeMap: string
  onStep: (direction: 'prev' | 'next') => void
  onSelect: (mapName: string) => void
  /** Couleur du point de la carte active (accent de la page : zones de drop ; cyan : cartographie tactique). */
  accent?: string
}) {
  if (maps.length === 0) return null
  return (
    // Étiré à la hauteur de la ligne du bandeau (celle du segmented voisin) : une seule hauteur par ligne (charte).
    <div className="flex min-w-0 flex-1 items-stretch self-stretch rounded-[10px] border border-gray-200 bg-white p-0.5 sm:w-[220px] sm:flex-none sm:gap-0.5" role="group" aria-label="Carte">
      <button type="button" onClick={() => onStep('prev')} disabled={maps.length < 2} aria-label="Carte précédente" className="grid w-[22px] shrink-0 place-items-center rounded-md text-gray-900 hover:bg-gray-100 disabled:opacity-35 sm:w-7">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px]">
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
      <button type="button" onClick={() => onStep('next')} disabled={maps.length < 2} aria-label="Carte suivante" className="grid w-[22px] shrink-0 place-items-center rounded-md text-gray-900 hover:bg-gray-100 disabled:opacity-35 sm:w-7">
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Entrée du menu de la pastille. `avatar` : un joueur (initiale dans une pastille) plutôt qu'un groupe (« Tout le clan »,
 * « Son meilleur duo ») ; par défaut, dès qu'il a une couleur. `color` : sur les zones de drop, le style de jeu du joueur
 * sur la période ; `null` : pastille neutre. `style` : identifiant du style, exposé pour les tests (`data-style`).
 */
export type PickerItem = {
  key: string
  label: string
  color: string | null
  avatar?: boolean
  style?: string | null
  count?: number
  active: boolean
  onSelect: () => void
}

const initialOf = (label: string) => label.replace(/^Joueur\s+/, '').charAt(0).toUpperCase()

/** Pastille ronde d'un joueur : initiale sur sa couleur, ou neutre (fond atténué, encre du thème). */
export function PlayerDot({ label, color, avatar, size, style }: { label: string; color: string | null; avatar: boolean; size: 22 | 26 | 32; style?: string | null }) {
  const text = size === 32 ? 'text-sm' : size === 26 ? 'text-xs' : 'text-[11px]'
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-black ${text}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color ?? 'var(--theme-ui-surface-strong)',
        // Encre sombre sur une couleur de style ; encre du thème sur la pastille neutre.
        color: color ? '#020617' : 'var(--theme-ui-text-secondary)',
      }}
      data-style={style ?? undefined}
      aria-hidden="true"
    >
      {avatar ? initialOf(label) : ''}
    </span>
  )
}

/** Légende des couleurs de pastille : le style de jeu dominant sur la période (couleurs de la liste des membres). */
export function PlaystyleLegend({ className = '' }: { className?: string }) {
  return (
    <span className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-gray-500 ${className}`}>
      Style de jeu sur la période :
      {ROSTER_ROLES.map((role) => (
        <span key={role.id} className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: role.color }} aria-hidden="true" />
          {role.label}
        </span>
      ))}
    </span>
  )
}

/** Pastille du bandeau qui ouvre un menu (joueur filtré, ou périmètre sur la page d'un joueur). */
export function PickerChip({
  label,
  color,
  avatar = color !== null,
  items,
  ariaLabel,
  legend,
}: {
  label: string
  color: string | null
  /** Le choix courant est un joueur (initiale affichée), même sans couleur. */
  avatar?: boolean
  items: PickerItem[]
  ariaLabel: string
  /** Pied du menu : ce que veut dire la couleur des pastilles. */
  legend?: ReactNode
}) {
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
    // Étirée à la hauteur de la ligne du bandeau, comme le sélecteur de carte.
    <div ref={rootRef} className="relative flex shrink-0 self-stretch">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${ariaLabel} : ${label}`}
        className="flex items-center gap-2 rounded-[10px] border bg-white px-[3px] text-gray-900 sm:pr-2"
        style={{ borderColor: color ?? 'var(--theme-ui-border)' }}
      >
        <PlayerDot label={label} color={color} avatar={avatar} size={26} />
        <span className="hidden max-w-[120px] truncate text-[13px] font-semibold sm:inline">{label}</span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-gray-500 sm:block" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label={ariaLabel} className="app-menu absolute right-0 top-full z-50 mt-1.5 w-[230px]">
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
              className={`app-menu__item justify-start gap-2.5 ${item.active ? 'app-menu__item--active' : ''}`}
            >
              <PlayerDot label={item.label} color={item.color} avatar={item.avatar ?? item.color !== null} size={22} style={item.style} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.count !== undefined ? <span className="t-num text-xs opacity-75">{item.count}</span> : null}
            </button>
          ))}
          {legend ? <div className="mt-1 border-t border-gray-200 px-2.5 pb-1 pt-2">{legend}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
