'use client'

import Image from 'next/image'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode, Ref } from 'react'

import { mapAssetUrl } from '@/lib/pubg-assets/map-asset'
import type { Point } from '@/lib/zone-reading/zone-reading-geometry'

/**
 * Carte carrée de la Lecture de zone (docs/features/lecture-de-zone.md) : fond de carte du jeu, calque SVG dans un repère
 * de 1 000 unités (lignes, bandes, cercles, grille) et calque HTML (repères et étiquettes, taille de texte fixe). Pas de
 * zoom : la carte entière tient à l'écran, comme au Mortier. Photo toujours sombre : `.app-on-photo`.
 */

export const MAP_UNITS = 1000

export function toUnits(meters: number, mapSize: number) {
  return (meters / mapSize) * MAP_UNITS
}

/** Position CSS (%) d'un point en mètres. */
export function placeAt(point: Point, mapSize: number): CSSProperties {
  return { left: `${(point.x / mapSize) * 100}%`, top: `${(point.y / mapSize) * 100}%` }
}

/** Point (m) sous le pointeur, borné à la carte. */
export function pointFromEvent(event: { clientX: number; clientY: number }, element: Element, mapSize: number): Point {
  const box = element.getBoundingClientRect()
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  return {
    x: clamp((event.clientX - box.left) / Math.max(1, box.width)) * mapSize,
    y: clamp((event.clientY - box.top) / Math.max(1, box.height)) * mapSize,
  }
}

export function ZoneReadingMapFrame({
  mapName,
  svg,
  overlay,
  frameRef,
  testId,
  ariaLabel,
  interactive = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  className = '',
}: {
  mapName: string
  svg?: ReactNode
  overlay?: ReactNode
  frameRef?: Ref<HTMLDivElement>
  testId?: string
  ariaLabel: string
  /** Carte jouable : focalisable au clavier, curseur en croix. */
  interactive?: boolean
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  className?: string
}) {
  const image = mapAssetUrl(mapName)
  return (
    <div
      ref={frameRef}
      data-testid={testId}
      role={interactive ? 'application' : 'img'}
      aria-label={ariaLabel}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className={`app-on-photo relative aspect-square w-full touch-none select-none overflow-hidden rounded-[12px] bg-[var(--theme-ui-surface-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-ui-accent-ring)] ${
        interactive ? 'cursor-crosshair' : ''
      } ${className}`}
    >
      {image ? (
        // Fond de carte décoratif (même image que la cartographie) : l'information passe par les calques et l'étiquette.
        <Image src={image} alt="" fill sizes="(min-width: 1024px) 620px, 100vw" draggable={false} className="pointer-events-none object-cover" />
      ) : null}
      <svg
        viewBox={`0 0 ${MAP_UNITS} ${MAP_UNITS}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
        aria-hidden="true"
      >
        {svg}
      </svg>
      <div className="pointer-events-none absolute inset-0">{overlay}</div>
    </div>
  )
}
