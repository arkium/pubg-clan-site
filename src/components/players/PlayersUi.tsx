'use client'

import { ChevronDown, Crosshair, Ghost, HeartPulse, Search, Target, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import { searchKey, type PlayerRoleId } from '@/lib/players-ranking'

/**
 * Briques communes de la page Joueurs (docs/features/joueurs.md) : avatar à initiale, identité des rôles, nom de joueur
 * (lien selon la règle d'ouverture), menu des clans avec recherche, fermeture d'un menu au clic extérieur.
 */

/**
 * Rôles : icônes et couleurs de jeu de `PlaystyleBadge` (Fragger `--game-neg`, Medic `--game-sky`, Ghost `--game-pos`),
 * « Tireur à distance » en `--game-violet` (identité, jamais un état actif).
 */
export const ROLE_META: Record<PlayerRoleId, { Icon: LucideIcon; color: string }> = {
  fragger: { Icon: Crosshair, color: 'var(--game-neg)' },
  medic: { Icon: HeartPulse, color: 'var(--game-sky)' },
  ghost: { Icon: Ghost, color: 'var(--game-pos)' },
  sniper: { Icon: Target, color: 'var(--game-violet)' },
}

/** Tuile d'icône d'un rôle (rayon 10 de la charte), fond teinté à la couleur du rôle. */
export function RoleTile({ role, size = 'md' }: { role: PlayerRoleId; size?: 'sm' | 'md' }) {
  const { Icon, color } = ROLE_META[role]
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-[10px] border ${size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'}`}
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </span>
  )
}

/** Avatar à l'initiale du pseudo (aucune photo : la plupart des joueurs n'ont pas de compte sur le site). */
export function PlayerAvatar({ name, size = 28, tone = 'theme', ringColor }: { name: string; size?: number; tone?: 'theme' | 'dark'; ringColor?: string }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full border-2 font-extrabold ${
        tone === 'dark' ? 'bg-slate-800 text-slate-100' : 'bg-[var(--theme-ui-surface-strong)] text-gray-900'
      }`}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)), borderColor: ringColor ?? 'transparent' }}
    >
      {initial}
    </span>
  )
}

/**
 * Nom d'un joueur, en texte simple (sans badge — demande du 2026-10-18) : lien vers son tableau de bord quand on peut
 * ouvrir son clan (règle de la Ligue), sinon texte.
 */
export function PlayerName({ name, memberId, canOpen, className = '' }: { name: string; memberId: number; canOpen: boolean; className?: string }) {
  const classes = `truncate font-bold text-gray-900 ${className}`.trim()
  return canOpen ? (
    <Link href={`/members/${memberId}/dashboard`} className={`${classes} hover:underline`} title={name}>
      {name}
    </Link>
  ) : (
    <span className={classes} title={name}>
      {name}
    </span>
  )
}

/** Ferme un menu au clic hors de `rootRef` ou à Échap (même mécanique que le menu du type de partie de la Ligue). */
export function useDismiss(open: boolean, rootRef: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const handle = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', handle)
    document.addEventListener('keydown', handle)
    return () => {
      document.removeEventListener('pointerdown', handle)
      document.removeEventListener('keydown', handle)
    }
  }, [close, open, rootRef])
}

/**
 * Filtre « Tous les clans » : menu de la charte (`app-menu-trigger` / `app-menu`, jamais un `<select>` natif) avec une
 * recherche en tête de liste — une trentaine de clans (docs/ui/index.html#controles : au-delà d'environ 12 choix).
 */
export function ClanFilterMenu({
  clans,
  value,
  onChange,
}: {
  clans: Array<{ clanId: number; name: string; tag: string }>
  value: number | null
  onChange: (clanId: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  useDismiss(open, rootRef, close)
  const current = clans.find((clan) => clan.clanId === value) ?? null
  const key = searchKey(query)
  const visible = clans.filter((clan) => key === '' || searchKey(clan.name).includes(key) || searchKey(clan.tag).includes(key))
  const choose = (clanId: number | null) => {
    onChange(clanId)
    close()
  }
  return (
    <div ref={rootRef} className="relative flex shrink-0 self-stretch">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Clan : ${current ? current.name : 'tous les clans'}`}
        className={`app-menu-trigger ${current ? 'app-menu-trigger--active' : ''}`}
      >
        <span className="max-w-[11rem] truncate">{current ? `[${current.tag}] ${current.name}` : 'Tous les clans'}</span>
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="Clan" className="app-menu absolute right-0 top-full z-50 mt-1.5 flex max-h-[min(60vh,24rem)] w-[260px] flex-col">
          <label className="app-toolbar-search m-1.5 shrink-0">
            <Search className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nom ou tag du clan"
              aria-label="Rechercher un clan"
            />
          </label>
          <div className="min-h-0 overflow-y-auto">
            <button type="button" role="menuitemradio" aria-checked={value === null} onClick={() => choose(null)} className={`app-menu__item ${value === null ? 'app-menu__item--active' : ''}`}>
              Tous les clans
            </button>
            {visible.map((clan) => (
              <button
                key={clan.clanId}
                type="button"
                role="menuitemradio"
                aria-checked={clan.clanId === value}
                onClick={() => choose(clan.clanId)}
                className={`app-menu__item ${clan.clanId === value ? 'app-menu__item--active' : ''}`}
              >
                <span className="font-mono text-[11px] opacity-75">[{clan.tag}]</span> <span className="truncate">{clan.name}</span>
              </button>
            ))}
            {visible.length === 0 ? <p className="px-3 py-2 text-xs text-gray-500">Aucun clan ne correspond.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
