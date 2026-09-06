'use client'

import React from 'react'
import { useStickyToolbar } from '@/hooks/useStickyToolbar'

export interface DockingToolbarProps {
  /**
   * Contenu à afficher dans la barre d'outils.
   * Peut être un ReactNode direct ou une fonction de rendu recevant { isSticky: boolean }.
   */
  children: React.ReactNode | ((props: { isSticky: boolean }) => React.ReactNode)

  /**
   * Variante esthétique du bandeau :
   * - 'card' (par défaut) : carte moderne arrondie `rounded-3xl border shadow-md backdrop-blur-md` au repos,
   *   puis bandeau pleine largeur `border-b` en mode sticky.
   * - 'panel' : utilise les classes de design system standard `app-panel` au repos,
   *   puis `border-b border-[var(--app-border)] bg-[var(--app-surface)]` en mode sticky.
   */
  variant?: 'card' | 'panel'

  /**
   * Classe de largeur maximale pour le conteneur intérieur (défaut: 'max-w-6xl')
   */
  maxWidthClass?: string

  /**
   * Marges extérieures au repos (défaut: 'my-4 sm:my-6')
   */
  restingMarginClass?: string

  /**
   * Padding et agencement de la carte au repos
   */
  restingPanelClassName?: string

  /**
   * Padding et agencement du conteneur intérieur en mode sticky
   */
  stickyInnerClassName?: string

  /**
   * Classes additionnelles pour le conteneur sticky externe
   */
  stickyHeaderClassName?: string

  /**
   * Classe racine optionnelle
   */
  className?: string

  /**
   * Décalages par rapport au haut de l'écran pour la détection sticky (défaut: desktop 58px, mobile 72px)
   */
  topOffsets?: { desktop: number; mobile: number }
}

/**
 * Composant DockingToolbar
 *
 * Implémente le pattern de bandeau adaptatif :
 * - Au repos : boîte centrée avec marges et coins arrondis, alignée avec le contenu de la page.
 * - Au défilement (sticky) : passe en pleine largeur sous le header avec uniquement `border-b`
 *   sans aucune bordure parasite ni débordement d'angles arrondis.
 * - Le contenu intérieur reste centré et aligné sur la grille du site.
 */
export function DockingToolbar({
  children,
  variant = 'card',
  maxWidthClass = 'max-w-6xl',
  restingMarginClass = 'my-4 sm:my-6',
  restingPanelClassName,
  stickyInnerClassName,
  stickyHeaderClassName,
  className = '',
  topOffsets = { desktop: 71, mobile: 73 },
}: DockingToolbarProps) {
  const { isSticky, sentinelRef } = useStickyToolbar(topOffsets)

  const content = typeof children === 'function' ? children({ isSticky }) : children

  const isPanelVariant = variant === 'panel'

  // Conteneur de largeur pour le panel standard
  const restingContainerClass = isPanelVariant && maxWidthClass === 'app-container'
    ? `app-container px-4 ${restingMarginClass} ${className}`.trim()
    : `mx-auto w-full ${maxWidthClass} px-4 ${restingMarginClass} ${className}`.trim()

  const restingCardClass = restingPanelClassName
    ? restingPanelClassName
    : isPanelVariant
    ? 'app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center'
    : 'flex flex-col gap-3 rounded-3xl border border-slate-200/90 bg-white/95 px-5 py-4 shadow-md backdrop-blur-md dark:border-slate-800/90 dark:bg-slate-900/95'

  const stickyHeaderClass = stickyHeaderClassName
    ? stickyHeaderClassName
    : isPanelVariant
    ? 'border-b border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm backdrop-blur-md'
    : 'border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95'

  const stickyInnerClass = stickyInnerClassName
    ? stickyInnerClassName
    : isPanelVariant && maxWidthClass === 'app-container'
    ? 'app-container flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center'
    : `mx-auto flex w-full ${maxWidthClass} flex-col gap-3 px-4 py-4`

  return (
    <>
      {/* Sentinelle invisible pour la détection via IntersectionObserver */}
      <div ref={sentinelRef} className="h-0 w-full pointer-events-none opacity-0" aria-hidden="true" />

      {isSticky ? (
        <div className={`sticky top-[73px] lg:top-[71px] z-30 w-full ${stickyHeaderClass} ${className}`.trim()}>
          <div className={stickyInnerClass}>
            {content}
          </div>
        </div>
      ) : (
        <div className={restingContainerClass}>
          <div className={restingCardClass}>
            {content}
          </div>
        </div>
      )}
    </>
  )
}
