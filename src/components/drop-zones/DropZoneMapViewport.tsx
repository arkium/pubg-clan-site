'use client'

import { CircleDashed, Info } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import MapZoomControl from '@/components/ui/MapZoomControl'
import { MAP_ZOOM_DEFAULT_MAX, MAP_ZOOM_MIN, clampMapZoom, pinchMapZoom, snapMapZoom, stepMapZoom, wheelZoomDirection } from '@/lib/map-zoom'

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
  boundariesVisible?: boolean
  onBoundariesVisibleChange?: (visible: boolean) => void
  showBoundaryControl?: boolean
  onMapClick?: (xPct: number, yPct: number) => void
  onSwipeMap?: (direction: 'prev' | 'next') => void
  /** Commandes posées sur la carte, hors du calque qui zoome (lentilles, cartes voisines, message). */
  overlay?: ReactNode
  /** Niveau de zoom courant (1 = carte entière), pour les commandes qui ne s'affichent qu'à 1×. */
  onZoomChange?: (zoom: number) => void
  /** Zoom maximal de cette carte (4 par défaut ; la Carte des ressources monte à 8). */
  maxZoom?: number
}

const MIN_ZOOM = MAP_ZOOM_MIN
const SWIPE_THRESHOLD_PX = 60

/** Pincement à deux doigts en cours : écart et zoom de départ, point de la carte (fraction) sous le milieu des doigts. */
type PinchState = {
  startDistance: number
  startZoom: number
  anchorX: number
  anchorY: number
  midX: number
  midY: number
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
  moved: boolean
}

const DropZoneMapViewport = forwardRef<DropZoneMapViewportHandle, DropZoneMapViewportProps>(
  function DropZoneMapViewport(
    {
      children,
      boundariesVisible = false,
      onBoundariesVisibleChange,
      showBoundaryControl = true,
      onMapClick,
      onSwipeMap,
      overlay,
      onZoomChange,
      maxZoom = MAP_ZOOM_DEFAULT_MAX,
    },
    ref
  ) {
    const viewportRef = useRef<HTMLDivElement>(null)
    const dragRef = useRef<DragState | null>(null)
    const zoomRef = useRef(MIN_ZOOM)
    const maxZoomRef = useRef(maxZoom)
    // Doigts posés sur la carte (pointeurs tactiles) et pincement en cours.
    const touchesRef = useRef(new Map<number, { x: number; y: number }>())
    const pinchRef = useRef<PinchState | null>(null)
    const [zoom, setZoom] = useState(MIN_ZOOM)
    const [dragging, setDragging] = useState(false)

    useEffect(() => {
      onZoomChange?.(zoom)
    }, [onZoomChange, zoom])

    useEffect(() => {
      maxZoomRef.current = maxZoom
    }, [maxZoom])

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
      const boundedZoom = clampMapZoom(nextZoom, maxZoom)
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

    /** Applique un zoom en gardant le point `anchor` (fraction de la carte) sous la position `mid` du cadre. */
    function zoomAround(nextZoom: number, anchorX: number, anchorY: number, midX: number, midY: number) {
      const viewport = viewportRef.current
      if (!viewport) return
      zoomRef.current = nextZoom
      setZoom(nextZoom)
      requestAnimationFrame(() => {
        viewport.scrollTo({ left: anchorX * viewport.scrollWidth - midX, top: anchorY * viewport.scrollHeight - midY, behavior: 'auto' })
      })
    }

    function touchMidpoint(viewport: HTMLDivElement) {
      const [first, second] = [...touchesRef.current.values()]
      const bounds = viewport.getBoundingClientRect()
      return {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        midX: (first.x + second.x) / 2 - bounds.left,
        midY: (first.y + second.y) / 2 - bounds.top,
      }
    }

    /**
     * Pincement à deux doigts (mobile) : zoom continu autour du milieu des doigts, calé au lâcher sur le palier de ×0,5
     * le plus proche. Le second doigt annule le glissé et le clic du premier. Renvoie vrai si l'événement est pris.
     */
    function trackTouch(event: ReactPointerEvent<HTMLDivElement>, phase: 'down' | 'move' | 'up') {
      if (event.pointerType !== 'touch') return false
      const viewport = viewportRef.current
      if (!viewport) return false
      const touches = touchesRef.current

      if (phase === 'down') {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (touches.size !== 2) return false
        const { distance, midX, midY } = touchMidpoint(viewport)
        pinchRef.current = {
          startDistance: distance,
          startZoom: zoomRef.current,
          anchorX: (viewport.scrollLeft + midX) / viewport.scrollWidth,
          anchorY: (viewport.scrollTop + midY) / viewport.scrollHeight,
          midX,
          midY,
        }
        for (const pointerId of touches.keys()) {
          if (!viewport.hasPointerCapture(pointerId)) viewport.setPointerCapture(pointerId)
        }
        dragRef.current = null
        setDragging(false)
        event.preventDefault()
        return true
      }

      if (!touches.has(event.pointerId)) return false
      if (phase === 'move') {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
        const pinch = pinchRef.current
        if (!pinch || touches.size < 2) return false
        const { distance, midX, midY } = touchMidpoint(viewport)
        pinch.midX = midX
        pinch.midY = midY
        zoomAround(pinchMapZoom(pinch.startZoom, pinch.startDistance, distance, maxZoomRef.current), pinch.anchorX, pinch.anchorY, midX, midY)
        event.preventDefault()
        return true
      }

      // Lâcher : le pincement finit dès qu'un des deux doigts se lève ; le doigt restant ne glisse ni ne clique.
      touches.delete(event.pointerId)
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
      const pinch = pinchRef.current
      if (pinch) {
        pinchRef.current = null
        zoomAround(snapMapZoom(zoomRef.current, maxZoomRef.current), pinch.anchorX, pinch.anchorY, pinch.midX, pinch.midY)
        dragRef.current = null
        setDragging(false)
        return true
      }
      return false
    }

    function startDragging(event: ReactPointerEvent<HTMLDivElement>) {
      const viewport = viewportRef.current
      if (trackTouch(event, 'down')) return
      // Doigt resté posé après un pincement : ni glissé ni clic tant que tous les doigts ne sont pas levés.
      if (event.pointerType === 'touch' && touchesRef.current.size > 1) return
      if (!viewport || event.button !== 0) return
      // Épingles, boutons et liens posés sur la carte gardent leur clic (pas de capture ni de glissé).
      if ((event.target as HTMLElement).closest('button, a, [data-map-interactive]')) return

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        moved: false,
      }
      viewport.setPointerCapture(event.pointerId)
      if (zoom > MIN_ZOOM) setDragging(true)
      event.preventDefault()
    }

    function dragMap(event: ReactPointerEvent<HTMLDivElement>) {
      if (trackTouch(event, 'move')) return
      const viewport = viewportRef.current
      const drag = dragRef.current
      if (!viewport || !drag || drag.pointerId !== event.pointerId) return

      const deltaX = event.clientX - drag.startX
      const deltaY = event.clientY - drag.startY
      if (Math.hypot(deltaX, deltaY) >= 5) {
        drag.moved = true
      }

      if (zoom > MIN_ZOOM && drag.moved) {
        viewport.scrollLeft = drag.scrollLeft - deltaX
        viewport.scrollTop = drag.scrollTop - deltaY
      }
      event.preventDefault()
    }

    function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
      if (trackTouch(event, 'up')) return
      const viewport = viewportRef.current
      const drag = dragRef.current
      if (!viewport || !drag || drag.pointerId !== event.pointerId) return

      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId)
      }
      if (!drag.moved && onMapClick) {
        const bounds = viewport.getBoundingClientRect()
        onMapClick(
          ((viewport.scrollLeft + event.clientX - bounds.left) / viewport.scrollWidth) * 100,
          ((viewport.scrollTop + event.clientY - bounds.top) / viewport.scrollHeight) * 100
        )
      } else if (drag.moved && zoomRef.current === MIN_ZOOM && onSwipeMap) {
        const deltaX = event.clientX - drag.startX
        const deltaY = event.clientY - drag.startY
        if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY)) {
          onSwipeMap(deltaX < 0 ? 'next' : 'prev')
        }
      }
      dragRef.current = null
      setDragging(false)
    }

    useImperativeHandle(ref, () => ({ focusLocation, reset }))

    useEffect(() => {
      const viewportElement = viewportRef.current
      if (!viewportElement) return
      const activeViewport = viewportElement

      function handleWheel(event: WheelEvent) {
        const direction = wheelZoomDirection(event.deltaY)
        if (direction === null) return

        const nextZoom = stepMapZoom(zoomRef.current, direction, maxZoomRef.current)
        if (nextZoom === zoomRef.current) return

        const bounds = activeViewport.getBoundingClientRect()
        const pointerX = event.clientX - bounds.left
        const pointerY = event.clientY - bounds.top
        const anchorX = (activeViewport.scrollLeft + pointerX) / activeViewport.scrollWidth
        const anchorY = (activeViewport.scrollTop + pointerY) / activeViewport.scrollHeight

        event.preventDefault()
        zoomRef.current = nextZoom
        setZoom(nextZoom)
        requestAnimationFrame(() => {
          activeViewport.scrollTo({
            left: anchorX * activeViewport.scrollWidth - pointerX,
            top: anchorY * activeViewport.scrollHeight - pointerY,
            behavior: 'auto',
          })
        })
      }

      activeViewport.addEventListener('wheel', handleWheel, { passive: false })
      return () => activeViewport.removeEventListener('wheel', handleWheel)
    }, [])

    return (
      <div className="relative aspect-square overflow-hidden bg-slate-950">
        <div
          ref={viewportRef}
          onPointerDown={startDragging}
          onPointerMove={dragMap}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          className={`absolute inset-0 touch-none overflow-auto overscroll-contain select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            zoom > MIN_ZOOM
              ? (dragging ? 'cursor-grabbing' : 'cursor-grab')
              : onMapClick
                ? 'cursor-crosshair'
                : 'cursor-default'
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

        {showBoundaryControl ? <div className="group absolute left-3 top-3 z-40">
          <button
            type="button"
            aria-pressed={boundariesVisible}
            aria-describedby="drop-zone-boundaries-help"
            onClick={() => onBoundariesVisibleChange?.(!boundariesVisible)}
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
        </div> : null}

        {overlay}
        <MapZoomControl zoom={zoom} max={maxZoom} onZoomChange={changeZoom} onReset={reset} />
      </div>
    )
  }
)

export default DropZoneMapViewport