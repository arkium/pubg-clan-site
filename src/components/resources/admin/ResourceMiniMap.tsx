'use client'

import { MapPinPlus } from 'lucide-react'
import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

import {
  EDITOR_WINDOW_METERS,
  MINI_MAP_WINDOW_METERS,
  NUDGE_METERS,
  NUDGE_METERS_FAST,
  insideView,
  markerPercent,
  miniMapView,
  nudgePoint,
  pointFromFraction,
  type MiniMapView,
} from '@/lib/resources/resource-admin-view'
import { gridLabel, resourceMap, resourceMapImage, type ResourceMapDefinition, type ResourcePointKind } from '@/lib/resources/resource-map'

import { KindIcon } from './ResourceAdminShared'

/**
 * Mini-cartes de la file de validation : extraits de l'image de la carte (`/maps/pubg/<key>.webp`) centrés sur une
 * position, et l'éditeur où l'on déplace le marqueur (souris, doigt ou flèches du clavier). Photo toujours sombre :
 * `.app-on-photo` donne aux jetons de jeu leur variante sombre dans les deux thèmes, comme les autres cartes du site.
 */

type Point = { x: number; y: number }

/** Définition d'une carte, ou carré de 8 km par défaut pour une clé inconnue. */
export function mapDefinition(key: string, label = key): ResourceMapDefinition {
  return resourceMap(key) ?? { key, label, sizeMeters: 8192 }
}

function backgroundStyle(mapKey: string, view: MiniMapView): CSSProperties {
  return {
    backgroundImage: `url(${resourceMapImage(mapKey)})`,
    backgroundSize: view.backgroundSize,
    backgroundPosition: view.backgroundPosition,
    backgroundRepeat: 'no-repeat',
  }
}

/**
 * Marqueur d'un point saisi, comme sur la carte joueur (ResourceMapCanvas) : carré sombre bordé de blanc à l'icône du
 * type ; en pointillés pour l'état demandé, pas encore validé.
 */
function PointMarker({ kind, requested, style }: { kind: ResourcePointKind; requested: boolean; style: CSSProperties }) {
  return (
    <span
      className={`absolute grid h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[6px] border-[1.5px] text-white shadow-md ${
        requested ? 'border-dashed border-white/90 bg-slate-950/70' : 'border-white/90 bg-slate-950/90'
      }`}
      style={style}
      aria-hidden="true"
    >
      <KindIcon kind={kind} className="h-[11px] w-[11px]" />
    </span>
  )
}

/**
 * Extrait de ~46 px centré sur la position. `crossed` : barré d'une croix (« Après » d'un point qui n'existe plus).
 */
export function ResourceMiniMap({
  mapKey,
  point,
  kind,
  requested = false,
  crossed = false,
  label,
  testId,
}: {
  mapKey: string
  point: Point
  kind: ResourcePointKind
  /** État demandé (« Après ») : marqueur en pointillés. */
  requested?: boolean
  crossed?: boolean
  label: string
  testId?: string
}) {
  const definition = mapDefinition(mapKey)
  const view = miniMapView({ sizeMeters: definition.sizeMeters, x: point.x, y: point.y, windowMeters: MINI_MAP_WINDOW_METERS })
  const marker = markerPercent(view, point)
  return (
    <div
      role="img"
      aria-label={label}
      data-testid={testId}
      data-background-position={view.backgroundPosition}
      className="app-on-photo bg-map-fallback relative h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[8px] ring-1 ring-[var(--theme-ui-border)]"
      style={backgroundStyle(mapKey, view)}
    >
      <PointMarker kind={kind} requested={requested} style={{ left: `${marker.left}%`, top: `${marker.top}%` }} />
      {crossed ? (
        <span className="absolute inset-0 bg-slate-950/45" aria-hidden="true">
          <svg viewBox="0 0 46 46" className="h-full w-full text-[var(--game-neg,var(--theme-ui-negative))]" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
            <path d="M9 9 37 37M37 9 9 37" />
          </svg>
        </span>
      ) : null}
    </div>
  )
}

/** « Avant » d'une nouvelle proposition : aucune position actuelle, case neutre. */
export function EmptyMiniMap({ label, testId }: { label: string; testId?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      data-testid={testId}
      className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[8px] border border-dashed border-gray-200 bg-gray-50 text-gray-500"
    >
      <MapPinPlus className="h-4 w-4 opacity-70" aria-hidden="true" />
    </div>
  )
}

/**
 * Éditeur de position : extrait fixe centré sur la position de départ, marqueur cerné d'accent (sélection, comme sur
 * la carte joueur) qu'on glisse (pointeur) ou
 * qu'on pousse aux flèches (10 m, 50 m avec Maj). L'ancienne position, quand elle existe, reste visible, estompée.
 */
export function ResourcePositionPicker({
  mapKey,
  mapLabel,
  start,
  value,
  previous,
  previousKind,
  kind,
  onChange,
}: {
  mapKey: string
  mapLabel: string
  /** Centre de l'extrait (position de départ de l'édition). */
  start: Point
  value: Point
  /** Position actuelle du point (« Avant »), montrée en pointillés. */
  previous: Point | null
  previousKind?: ResourcePointKind
  kind: ResourcePointKind
  onChange: (point: Point) => void
}) {
  const definition = mapDefinition(mapKey, mapLabel)
  const view = useMemo(
    () => miniMapView({ sizeMeters: definition.sizeMeters, x: start.x, y: start.y, windowMeters: EDITOR_WINDOW_METERS }),
    [definition.sizeMeters, start.x, start.y]
  )
  const frameRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLButtonElement>(null)
  const [dragging, setDragging] = useState(false)
  const hintId = useId()

  const marker = markerPercent(view, value)
  const ghost = previous && insideView(view, previous) && (previous.x !== value.x || previous.y !== value.y) ? markerPercent(view, previous) : null
  const moved = Math.round(Math.hypot(value.x - start.x, value.y - start.y))

  function pointAt(event: PointerEvent<HTMLDivElement>) {
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return pointFromFraction(view, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height)
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    frameRef.current?.setPointerCapture(event.pointerId)
    setDragging(true)
    markerRef.current?.focus({ preventScroll: true })
    const point = pointAt(event)
    if (point) onChange(point)
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const point = pointAt(event)
    if (point) onChange(point)
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    setDragging(false)
    if (frameRef.current?.hasPointerCapture(event.pointerId)) frameRef.current.releasePointerCapture(event.pointerId)
  }

  function nudge(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nudgePoint(view, value, event.key, event.shiftKey)
    if (!next) return
    event.preventDefault()
    onChange(next)
  }

  const grid = gridLabel(definition, value.x, value.y)

  return (
    <div className="flex w-full max-w-[17rem] flex-col gap-1.5 sm:max-w-none">
      <div
        ref={frameRef}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        data-testid="position-picker"
        className={`app-on-photo bg-map-fallback relative aspect-square w-full touch-none select-none overflow-hidden rounded-[10px] ring-1 ring-[var(--theme-ui-border)] ${dragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
        style={backgroundStyle(mapKey, view)}
      >
        {ghost && previous ? (
          <span
            className="pointer-events-none absolute grid h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[6px] border-2 border-white/90 bg-slate-950/90 text-white opacity-55"
            style={{ left: `${ghost.left}%`, top: `${ghost.top}%` }}
            aria-hidden="true"
            data-testid="position-picker-previous"
          >
            <KindIcon kind={previousKind ?? kind} className="h-3 w-3" />
          </span>
        ) : null}
        <button
          ref={markerRef}
          type="button"
          onKeyDown={nudge}
          aria-describedby={hintId}
          aria-label={`Position du point : ${mapLabel} · ${grid}`}
          data-testid="position-picker-marker"
          data-x={value.x}
          data-y={value.y}
          className="absolute grid h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[6px] border-2 border-white/90 bg-slate-950/90 text-white shadow-[0_0_0_3px_var(--theme-ui-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--theme-ui-accent)]"
          style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
        >
          <KindIcon kind={kind} className="h-3.5 w-3.5" />
        </button>
      </div>
      <p id={hintId} className="t-meta">
        <span className="t-num font-semibold text-gray-700">{grid}</span>
        {moved > 0 ? <span className="t-num"> · déplacé de {moved} m</span> : null}
        <span className="sr-only">
          {' '}
          — flèches : {NUDGE_METERS} m, Maj + flèche : {NUDGE_METERS_FAST} m
        </span>
      </p>
    </div>
  )
}
