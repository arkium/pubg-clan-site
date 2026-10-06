'use client'

import { ArrowDown, ArrowUp, Plane, RotateCcw, RotateCw } from 'lucide-react'
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

import {
  ZONE_READING_BAND_METERS,
  ZONE_READING_GRID_CELLS,
} from '@/lib/zone-reading/zone-reading-analysis'
import {
  AXIS_ANGLE_TOLERANCE_DEG,
  AXIS_OFFSET_TOLERANCE_RATIO,
  axisHeading,
  axisPivot,
  axisSegment,
  axisThrough,
  cardinalBetween,
  cardinalOfHeading,
  clampAxisOffset,
  distanceToLine,
  rotateAxis,
  towardsCardinal,
  type Axis,
  type Point,
} from '@/lib/zone-reading/zone-reading-geometry'
import { formatDistance } from '@/lib/zone-reading/zone-reading-game'

import { MAP_UNITS, ZoneReadingMapFrame, placeAt, pointFromEvent, toUnits } from './ZoneReadingMapFrame'

/**
 * Carte de l'axe du C-130 (blocs « L'avion et la zone » et « Où finit la zone ») : la ligne choisie, sa bande de 200 m
 * de chaque côté, l'avion, et selon le bloc les zones finales des parties dont la ligne de vol est proche, ou la
 * grille des fins de partie. La poignée jaune tourne l'axe autour de son pied, glisser la bande la déplace ; les
 * boutons font de même au clavier (docs/features/lecture-de-zone.md).
 */

const ROTATE_STEP_DEG = 15
/** Décalage d'un clic sur « Décaler » : 4 % de la carte, 330 m sur 8 km. */
const SHIFT_RATIO = 0.04

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

function segmentPoint(segment: { start: Point; end: Point }, t: number): Point {
  return { x: segment.start.x + (segment.end.x - segment.start.x) * t, y: segment.start.y + (segment.end.y - segment.start.y) * t }
}

export function axisLabel(axis: Axis) {
  const heading = axisHeading(axis)
  return `Axe ${heading}° · ${towardsCardinal(cardinalOfHeading(heading))}`
}

export function ZoneReadingAxisMap({
  mapName,
  mapLabel,
  mapSize,
  axis,
  onAxisChange,
  showAxis = true,
  draggable = false,
  dots = [],
  grid = null,
  testId,
}: {
  mapName: string
  mapLabel: string
  mapSize: number
  axis: Axis | null
  onAxisChange: (axis: Axis) => void
  showAxis?: boolean
  /** Poignée et bande déplaçables au pointeur. */
  draggable?: boolean
  dots?: Point[]
  /** Fins de partie par case (8 × 8, `row * 8 + col`). */
  grid?: number[] | null
  testId?: string
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ kind: 'rotate' | 'move'; pivot: Point; pointerId: number } | null>(null)
  const segment = axis && showAxis ? axisSegment(axis, mapSize) : null
  const heading = axis ? axisHeading(axis) : 0
  const gridMax = grid ? Math.max(1, ...grid) : 1
  const cellUnits = MAP_UNITS / ZONE_READING_GRID_CELLS

  function startDrag(kind: 'rotate' | 'move', event: PointerEvent<HTMLElement>) {
    if (!axis || !frameRef.current) return
    event.preventDefault()
    drag.current = { kind, pivot: axisPivot(axis, mapSize), pointerId: event.pointerId }
    frameRef.current.setPointerCapture(event.pointerId)
  }

  function onFramePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!draggable || !axis || !segment || !frameRef.current || drag.current) return
    const point = pointFromEvent(event, frameRef.current, mapSize)
    // Toucher la bande (avec un peu de marge pour le doigt) la déplace ; ailleurs, la carte ne réagit pas.
    if (distanceToLine(point, segment) <= ZONE_READING_BAND_METERS * 1.5 + mapSize * 0.01) startDrag('move', event)
  }

  function onFramePointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || !axis || !frameRef.current || current.pointerId !== event.pointerId) return
    const point = pointFromEvent(event, frameRef.current, mapSize)
    if (current.kind === 'move') {
      onAxisChange(axisThrough(point, axis.angleDeg, mapSize))
      return
    }
    if (Math.hypot(point.x - current.pivot.x, point.y - current.pivot.y) < mapSize * 0.02) return
    const angle = (Math.atan2(point.y - current.pivot.y, point.x - current.pivot.x) * 180) / Math.PI
    onAxisChange(axisThrough(current.pivot, Math.round(angle), mapSize))
  }

  function onFramePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  function onHandleKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!axis) return
    const step = event.shiftKey ? ROTATE_STEP_DEG : 1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') onAxisChange(rotateAxis(axis, step))
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') onAxisChange(rotateAxis(axis, -step))
    else return
    event.preventDefault()
  }

  const band = segment
    ? (() => {
        const radians = ((axis?.angleDeg ?? 0) * Math.PI) / 180
        const normal = { x: -Math.sin(radians), y: Math.cos(radians) }
        const half = ZONE_READING_BAND_METERS
        return [
          { x: segment.start.x + normal.x * half, y: segment.start.y + normal.y * half },
          { x: segment.end.x + normal.x * half, y: segment.end.y + normal.y * half },
          { x: segment.end.x - normal.x * half, y: segment.end.y - normal.y * half },
          { x: segment.start.x - normal.x * half, y: segment.start.y - normal.y * half },
        ]
          .map((point) => `${toUnits(point.x, mapSize)},${toUnits(point.y, mapSize)}`)
          .join(' ')
      })()
    : null
  const plane = segment ? segmentPoint(segment, 0.1) : null
  const handle = segment ? segmentPoint(segment, 0.86) : null

  return (
    <ZoneReadingMapFrame
      mapName={mapName}
      frameRef={frameRef}
      testId={testId}
      ariaLabel={`Carte ${mapLabel}${axis && showAxis ? ` — ${axisLabel(axis)}` : ''}`}
      onPointerDown={onFramePointerDown}
      onPointerMove={onFramePointerMove}
      onPointerUp={onFramePointerUp}
      className={draggable ? 'cursor-grab' : ''}
      svg={
        <>
          {grid
            ? grid.map((count, index) =>
                count > 0 ? (
                  <rect
                    key={index}
                    x={(index % ZONE_READING_GRID_CELLS) * cellUnits}
                    y={Math.floor(index / ZONE_READING_GRID_CELLS) * cellUnits}
                    width={cellUnits}
                    height={cellUnits}
                    fill="var(--theme-ui-accent)"
                    fillOpacity={0.12 + (count / gridMax) * 0.68}
                    stroke="rgb(2 6 23 / 0.35)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null
              )
            : null}
          {grid
            ? Array.from({ length: ZONE_READING_GRID_CELLS - 1 }, (_, index) => (
                <g key={`grid-${index}`} stroke="rgb(255 255 255 / 0.18)" strokeWidth={1} vectorEffect="non-scaling-stroke">
                  <line x1={(index + 1) * cellUnits} y1={0} x2={(index + 1) * cellUnits} y2={MAP_UNITS} vectorEffect="non-scaling-stroke" />
                  <line x1={0} y1={(index + 1) * cellUnits} x2={MAP_UNITS} y2={(index + 1) * cellUnits} vectorEffect="non-scaling-stroke" />
                </g>
              ))
            : null}
          {band ? (
            <polygon
              points={band}
              fill="var(--theme-ui-accent)"
              fillOpacity={0.18}
              stroke="var(--theme-ui-accent)"
              strokeOpacity={0.6}
              strokeDasharray="6 5"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {segment ? (
            <line
              x1={toUnits(segment.start.x, mapSize)}
              y1={toUnits(segment.start.y, mapSize)}
              x2={toUnits(segment.end.x, mapSize)}
              y2={toUnits(segment.end.y, mapSize)}
              stroke="var(--theme-ui-accent)"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {dots.map((dot, index) => (
            <circle
              key={index}
              cx={toUnits(dot.x, mapSize)}
              cy={toUnits(dot.y, mapSize)}
              r={5.5}
              fill="white"
              fillOpacity={0.92}
              stroke="rgb(2 6 23 / 0.7)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </>
      }
      overlay={
        <>
          {grid
            ? grid.map((count, index) =>
                count > 0 ? (
                  <span
                    key={index}
                    className="t-num absolute -translate-x-1/2 -translate-y-1/2 text-[11px] font-bold text-white drop-shadow-[0_1px_1px_rgb(2_6_23_/_0.9)] sm:text-xs"
                    style={{
                      left: `${((index % ZONE_READING_GRID_CELLS) + 0.5) * (100 / ZONE_READING_GRID_CELLS)}%`,
                      top: `${(Math.floor(index / ZONE_READING_GRID_CELLS) + 0.5) * (100 / ZONE_READING_GRID_CELLS)}%`,
                    }}
                  >
                    {integer.format(count)}
                  </span>
                ) : null
              )
            : null}
          {plane ? (
            <span
              className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-slate-950/70 text-[var(--theme-ui-accent)] shadow"
              style={placeAt(plane, mapSize)}
            >
              {/* L'icône pointe au nord-est : tournée du cap moins 45°. */}
              <Plane className="h-4 w-4" style={{ transform: `rotate(${heading - 45}deg)` }} aria-hidden="true" />
            </span>
          ) : null}
          {handle && draggable ? (
            <button
              type="button"
              aria-label="Tourner l’avion (flèches du clavier)"
              onPointerDown={(event) => startDrag('rotate', event)}
              onKeyDown={onHandleKey}
              className="pointer-events-auto absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-grab place-items-center rounded-full border-2 border-slate-950/70 bg-[var(--theme-ui-accent)] text-slate-950 shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-white"
              style={placeAt(handle, mapSize)}
              data-testid="axis-handle"
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </>
      }
    />
  )
}

/**
 * Commandes de l'axe sous la carte : tourner de 15°, décaler la ligne d'un côté ou de l'autre, et la légende — l'axe
 * et le nombre de parties dont la ligne de vol est proche.
 */
export function AxisControls({
  axis,
  mapSize,
  onAxisChange,
  nearCount,
  hint,
}: {
  axis: Axis
  mapSize: number
  onAxisChange: (axis: Axis) => void
  nearCount: number
  hint?: string
}) {
  const radians = (axis.angleDeg * Math.PI) / 180
  const normal = { x: -Math.sin(radians), y: Math.cos(radians) }
  const toward = cardinalBetween({ x: 0, y: 0 }, normal)
  const away = cardinalBetween({ x: 0, y: 0 }, { x: -normal.x, y: -normal.y })
  const shift = (direction: 1 | -1) =>
    onAxisChange({ angleDeg: axis.angleDeg, offset: clampAxisOffset(axis.offset + direction * mapSize * SHIFT_RATIO, mapSize) })
  const buttonClass =
    'grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-gray-200 bg-white text-gray-900 hover:bg-gray-100'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Orientation de l’avion">
          <button type="button" className={buttonClass} onClick={() => onAxisChange(rotateAxis(axis, -ROTATE_STEP_DEG))} aria-label="Tourner l’avion de 15° vers la gauche">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" className={buttonClass} onClick={() => onAxisChange(rotateAxis(axis, ROTATE_STEP_DEG))} aria-label="Tourner l’avion de 15° vers la droite">
            <RotateCw className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" className={buttonClass} onClick={() => shift(-1)} aria-label={`Décaler la ligne ${towardsCardinal(away)}`}>
            <ArrowUp className="h-4 w-4" style={{ transform: `rotate(${axis.angleDeg}deg)` }} aria-hidden="true" />
          </button>
          <button type="button" className={buttonClass} onClick={() => shift(1)} aria-label={`Décaler la ligne ${towardsCardinal(toward)}`}>
            <ArrowDown className="h-4 w-4" style={{ transform: `rotate(${axis.angleDeg}deg)` }} aria-hidden="true" />
          </button>
        </div>
        <div className="flex min-w-0 flex-col">
          <b className="t-body t-strong text-gray-900" data-testid="axis-label">
            {axisLabel(axis)}
          </b>
          <span className="t-meta t-num" data-testid="axis-count">
            {integer.format(nearCount)} partie{nearCount > 1 ? 's' : ''} avec une ligne de vol proche (±{AXIS_ANGLE_TOLERANCE_DEG}°, ±
            {formatDistance(mapSize * AXIS_OFFSET_TOLERANCE_RATIO)})
          </span>
        </div>
      </div>
      {hint ? <p className="t-meta">{hint}</p> : null}
    </div>
  )
}
