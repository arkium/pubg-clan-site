'use client'

import { Focus, Minus, Plus } from 'lucide-react'

import {
  MAP_ZOOM_DEFAULT_MAX,
  MAP_ZOOM_MIN,
  formatMapZoom,
  stepMapZoom,
} from '@/lib/map-zoom'

type MapZoomControlProps = {
  zoom: number
  /** Reçoit le palier suivant ou précédent, déjà borné. */
  onZoomChange: (nextZoom: number) => void
  /** Bouton central : revenir à la carte entière (×1, caméra recentrée). */
  onReset: () => void
  max?: number
  className?: string
}

/**
 * Contrôle de zoom standard des cartes : `[ − | ⊙ 1× | + ]`, ancré en haut à
 * droite d'un conteneur `relative`. Voir `docs/ui/index.html#zoom-carte`.
 */
export default function MapZoomControl({
  zoom,
  onZoomChange,
  onReset,
  max = MAP_ZOOM_DEFAULT_MAX,
  className = '',
}: MapZoomControlProps) {
  return (
    <div
      className={`absolute right-3 top-3 z-40 flex h-10 items-stretch overflow-hidden rounded border border-white/25 bg-slate-950/80 text-white shadow-lg backdrop-blur ${className}`}
    >
      <button
        type="button"
        onClick={() => onZoomChange(stepMapZoom(zoom, -1, max))}
        disabled={zoom <= MAP_ZOOM_MIN}
        className="flex w-10 items-center justify-center border-r border-white/15 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        title="Réduire le zoom"
        aria-label="Réduire le zoom"
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onReset}
        className="flex min-w-16 items-center justify-center gap-1.5 border-r border-white/15 px-2 text-xs font-semibold tabular-nums hover:bg-white/10"
        title="Afficher la carte entière"
        aria-label="Afficher la carte entière"
      >
        <Focus className="h-3.5 w-3.5" aria-hidden="true" />
        {formatMapZoom(zoom)}
      </button>
      <button
        type="button"
        onClick={() => onZoomChange(stepMapZoom(zoom, 1, max))}
        disabled={zoom >= max}
        className="flex w-10 items-center justify-center hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        title="Augmenter le zoom"
        aria-label="Augmenter le zoom"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
