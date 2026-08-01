'use client'

import { CircleDashed, Focus, Info, Minus, Plus } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

type MapFocusLocation = {
  xPct: number
  yPct: number
}

export type DropZoneMapViewportHandle = {
  focusLocation: (location: MapFocusLocation) => void
  reset: () => void
}

type DropZoneMapViewportProps = {
  children: ReactNode
  boundariesVisible: boolean
  onBoundariesVisibleChange: (visible: boolean) => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.5

type DragState = {
  pointerId: number
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

const DropZoneMapViewport = forwardRef<DropZoneMapViewportHandle, DropZoneMapViewportProps>(
  function DropZoneMapViewport(
    { children, boundariesVisible, onBoundariesVisibleChange },
    ref
  ) {
    const viewportRef = useRef<HTMLDivElement>(null)
    const dragRef = useRef<DragState | null>(null)
    const zoomRef = useRef(MIN_ZOOM)
    const [zoom, setZoom] = useState(MIN_ZOOM)
    const [dragging, setDragging] = useState(false)

    function scrollToPercent(xPct: number, yPct: number, behavior: ScrollBehavior = 'smooth') {
      const viewport = viewportRef.current
      if (!viewport) return

      viewport.scrollTo({
        left: (xPct / 100) * viewport.scrollWidth - viewport.clientWidth / 2,
        top: (yPct / 100) * viewport.scrollHeight - viewport.clientHeight / 2,
        behavior,
      })
    }

    function changeZoom(nextZoom: number) {
      const viewport = viewportRef.current
      const boundedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom))
      const centerX = viewport
        ? ((viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth) * 100
        : 50
      const centerY = viewport
        ? ((viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight) * 100
        : 50

      zoomRef.current = boundedZoom
      setZoom(boundedZoom)
      requestAnimationFrame(() => scrollToPercent(centerX, centerY, 'auto'))
    }

    function reset() {
      zoomRef.current = MIN_ZOOM
      setZoom(MIN_ZOOM)
      requestAnimationFrame(() => viewportRef.current?.scrollTo({ left: 0, top: 0 }))
    }

    function focusLocation(location: MapFocusLocation) {
      if (zoomRef.current < 2) {
        zoomRef.current = 2
        setZoom(2)
      }
      requestAnimationFrame(() => scrollToPercent(location.xPct, location.yPct))
    }

    function startDragging(event: ReactPointerEvent<HTMLDivElement>) {
      const viewport = viewportRef.current
      if (!viewport || event.button !== 0 || zoom <= MIN_ZOOM) return

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      }
      viewport.setPointerCapture(event.pointerId)
      setDragging(true)
      event.preventDefault()
    }

    function dragMap(event: ReactPointerEvent<HTMLDivElement>) {
      const viewport = viewportRef.current
      const drag = dragRef.current
      if (!viewport || !drag || drag.pointerId !== event.pointerId) return

      viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX)
      viewport.scrollTop = drag.scrollTop - (event.clientY - drag.startY)
      event.preventDefault()
    }

    function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
      const viewport = viewportRef.current
      const drag = dragRef.current
      if (!viewport || !drag || drag.pointerId !== event.pointerId) return

      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId)
      }
      dragRef.current = null
      setDragging(false)
    }

    useImperativeHandle(ref, () => ({ focusLocation, reset }))

    useEffect(() => {
      const viewport = viewportRef.current
      if (!viewport) return

      function handleWheel(event: WheelEvent) {
        if (event.deltaY === 0) return

        const nextZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, zoomRef.current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
        )
        if (nextZoom === zoomRef.current) return

        const bounds = viewport.getBoundingClientRect()
        const pointerX = event.clientX - bounds.left
        const pointerY = event.clientY - bounds.top
        const anchorX = (viewport.scrollLeft + pointerX) / viewport.scrollWidth
        const anchorY = (viewport.scrollTop + pointerY) / viewport.scrollHeight

        event.preventDefault()
        zoomRef.current = nextZoom
        setZoom(nextZoom)
        requestAnimationFrame(() => {
          viewport.scrollTo({
            left: anchorX * viewport.scrollWidth - pointerX,
            top: anchorY * viewport.scrollHeight - pointerY,
            behavior: 'auto',
          })
        })
      }

      viewport.addEventListener('wheel', handleWheel, { passive: false })
      return () => viewport.removeEventListener('wheel', handleWheel)
    }, [])

    return (
      <div className="relative aspect-square overflow-hidden bg-slate-950">
        <div
          ref={viewportRef}
          onPointerDown={startDragging}
          onPointerMove={dragMap}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          className={`absolute inset-0 overflow-auto overscroll-contain select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            zoom > MIN_ZOOM ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
          }`}
          data-drop-zone-map-viewport
        >
          <div
            className="relative shrink-0 overflow-hidden bg-slate-950"
            style={{ width: `${zoom * 100}%`, aspectRatio: '1' }}
            data-drop-zone-map-layer
          >
            {children}
          </div>
        </div>

        <div className="group absolute left-3 top-3 z-40">
          <button
            type="button"
            aria-pressed={boundariesVisible}
            aria-describedby="drop-zone-boundaries-help"
            onClick={() => onBoundariesVisibleChange(!boundariesVisible)}
            className={`inline-flex h-10 items-center gap-2 rounded border px-3 text-xs font-semibold shadow-lg backdrop-blur transition-colors ${
              boundariesVisible
                ? 'border-cyan-300/70 bg-cyan-500/90 text-slate-950'
                : 'border-white/25 bg-slate-950/80 text-white hover:bg-slate-900/90'
            }`}
          >
            <CircleDashed className="h-4 w-4" aria-hidden="true" />
            <span>Périmètres</span>
            <Info className="h-3.5 w-3.5 opacity-75" aria-hidden="true" />
          </button>
          <div
            id="drop-zone-boundaries-help"
            role="tooltip"
            className="pointer-events-none absolute left-0 top-12 w-64 rounded border border-white/20 bg-slate-950/95 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Chaque cercle définit la zone utilisée pour associer un atterrissage à une ville.
          </div>
        </div>

        <div className="absolute right-3 top-3 z-40 flex h-10 items-stretch overflow-hidden rounded border border-white/25 bg-slate-950/80 text-white shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => changeZoom(zoom - ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            className="flex w-10 items-center justify-center border-r border-white/15 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            title="Réduire le zoom"
            aria-label="Réduire le zoom"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex min-w-16 items-center justify-center gap-1.5 border-r border-white/15 px-2 text-xs font-semibold tabular-nums hover:bg-white/10"
            title="Afficher la carte entière"
            aria-label="Afficher la carte entière"
          >
            <Focus className="h-3.5 w-3.5" aria-hidden="true" />
            {zoom.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}×
          </button>
          <button
            type="button"
            onClick={() => changeZoom(zoom + ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            className="flex w-10 items-center justify-center hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            title="Augmenter le zoom"
            aria-label="Augmenter le zoom"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }
)

export default DropZoneMapViewport