'use client'

import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react'

import { useStickyToolbar } from '@/hooks/useStickyToolbar'

/** Sous cette largeur, le bandeau docké ne garde que la période (docs/TODO/sticky.md §2). */
const MOBILE_QUERY = '(max-width: 639px)'

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export type DockingToolbarState = {
  /** Le bandeau est collé sous le header. */
  isSticky: boolean
  /** Collé ET sur mobile : la page ne rend que sa période (§2). */
  compact: boolean
}

export interface DockingToolbarProps {
  /**
   * Contenu du bandeau, ou fonction de rendu recevant `{ isSticky, compact }`. Une seule
   * arborescence dans les deux états : les contrôles restent montés (un champ garde son focus à
   * la bascule) ; compteurs, dates et notes ne sont rendus qu'au repos (`{!isSticky && …}`) ;
   * en mode `compact`, seule la période reste.
   */
  children: React.ReactNode | ((state: DockingToolbarState) => React.ReactNode)
  /** `panel` (défaut, pages joueurs) ; `card` réservé à l'administration existante. */
  variant?: 'panel' | 'card'
  /** Une page sans période ne docke rien sur mobile (docs/TODO/sticky.md §2). */
  dockOnMobile?: boolean
  /** Nom accessible du bandeau. */
  ariaLabel?: string
  className?: string
}

const RESTING_INNER: Record<NonNullable<DockingToolbarProps['variant']>, string> = {
  panel: 'app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center',
  card: 'flex flex-col gap-3 rounded-3xl border border-slate-200/90 bg-white/95 px-5 py-4 shadow-md backdrop-blur-md dark:border-slate-800/90 dark:bg-slate-900/95 sm:flex-row sm:items-center',
}

const DOCKED_OUTER: Record<NonNullable<DockingToolbarProps['variant']>, string> = {
  panel: 'border-b border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm backdrop-blur-md',
  card: 'border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95',
}

/**
 * Bandeau de filtres d'une page — standard des pages joueurs (docs/TODO/sticky.md §4.A,
 * docs/ui/index.html §23).
 *
 * - Au repos : panneau aligné sur la grille du site (`app-container`, 64rem).
 * - Docké : pleine largeur de la colonne de contenu, collé sous le header à
 *   `var(--app-header-height)`, seulement `border-b`, sans transition géométrique.
 * - La hauteur perdue à la bascule est réservée par un espaceur : le contenu ne saute pas.
 * - La hauteur du bandeau est publiée dans `--app-toolbar-height` (marges de défilement).
 *
 * À placer HORS de tout conteneur de largeur (`main.app-main-flush` pleine largeur, blocs internes
 * en `app-container app-gutter`), sinon il ne peut pas s'étendre une fois docké.
 */
export function DockingToolbar({
  children,
  variant = 'panel',
  dockOnMobile = true,
  ariaLabel = 'Filtres de la page',
  className = '',
}: DockingToolbarProps) {
  const { isSticky: pastHeader, sentinelRef } = useStickyToolbar()
  const isMobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false)

  const isSticky = pastHeader && (dockOnMobile || !isMobile)
  const compact = isSticky && isMobile
  const content = typeof children === 'function' ? children({ isSticky, compact }) : children

  const barRef = useRef<HTMLDivElement | null>(null)
  const spacerRef = useRef<HTMLDivElement | null>(null)
  const restingHeightRef = useRef(0)

  // Mesures en direct dans le DOM, sans état React : l'espaceur est ajusté avant l'affichage.
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return

    // La mesure force un calcul de mise en page où l'espaceur n'est pas encore ajusté : le contenu
    // semble bouger, et l'ancrage de défilement du navigateur « corrigerait » la position de lecture —
    // jusqu'à ramener la page en haut sur mobile, où le bandeau au repos est haut. L'ancrage est donc
    // suspendu le temps que l'espaceur compense, puis rétabli deux images plus tard.
    const root = document.documentElement
    let restoreFrame = 0
    const suspendScrollAnchoring = () => {
      root.style.setProperty('overflow-anchor', 'none')
      cancelAnimationFrame(restoreFrame)
      restoreFrame = requestAnimationFrame(() => {
        restoreFrame = requestAnimationFrame(() => root.style.removeProperty('overflow-anchor'))
      })
    }

    const measure = () => {
      suspendScrollAnchoring()
      const style = getComputedStyle(bar)
      const total = bar.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom)
      if (bar.dataset.docked === 'true') {
        const gap = Math.max(0, restingHeightRef.current - total)
        if (spacerRef.current) spacerRef.current.style.height = `${gap}px`
      } else {
        restingHeightRef.current = total
        if (spacerRef.current) spacerRef.current.style.height = '0px'
      }
      document.documentElement.style.setProperty('--app-toolbar-height', `${bar.offsetHeight}px`)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(restoreFrame)
      root.style.removeProperty('overflow-anchor')
    }
  }, [isSticky])

  useLayoutEffect(
    () => () => {
      document.documentElement.style.removeProperty('--app-toolbar-height')
    },
    []
  )

  return (
    <>
      {/* Sentinelle invisible : sa sortie par le haut déclenche le docking. */}
      <div ref={sentinelRef} data-docking-sentinel="" className="pointer-events-none h-0 w-full opacity-0" aria-hidden="true" />

      <div
        ref={barRef}
        role="region"
        aria-label={ariaLabel}
        data-docking-toolbar=""
        data-docked={isSticky ? 'true' : 'false'}
        data-compact={compact ? 'true' : 'false'}
        style={isSticky ? { top: 'var(--app-header-height)' } : undefined}
        className={[
          // Au repos : des paddings, pas des marges. Une marge fusionnerait avec celle du bloc précédent à
          // travers la sentinelle (hauteur nulle), et l'espaceur compterait un espace qui n'existe pas.
          isSticky ? `sticky z-30 w-full ${DOCKED_OUTER[variant]}` : 'app-container app-gutter py-4 sm:py-6',
          className,
        ]
          .join(' ')
          .trim()}
      >
        <div
          className={
            isSticky
              ? `app-container app-gutter flex flex-col gap-3 sm:flex-row sm:items-center ${compact ? 'py-2' : 'py-3'}`
              : RESTING_INNER[variant]
          }
        >
          {content}
        </div>
      </div>

      {/* Réserve la hauteur perdue à la bascule (mesurée ci-dessus). */}
      <div ref={spacerRef} aria-hidden="true" style={{ height: 0 }} />
    </>
  )
}
