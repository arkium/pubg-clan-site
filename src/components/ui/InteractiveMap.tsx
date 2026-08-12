'use client'

import { useState, useRef, ReactNode } from 'react'
import { ZoomInIcon, ZoomOutIcon, MaximizeIcon } from 'lucide-react'

export default function InteractiveMap({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.5, 5))
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.5, 1))
  const handleReset = () => {
    setScale(1)
    if (containerRef.current) {
      containerRef.current.scrollTo(0, 0)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-900 group">
      {/* Controls */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 rounded-md bg-slate-900/80 p-1 shadow-lg backdrop-blur-sm opacity-100 transition-opacity">
        <button
          onClick={handleZoomIn}
          className="flex h-8 w-8 items-center justify-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          title="Zoomer"
        >
          <ZoomInIcon size={18} />
        </button>
        <button
          onClick={handleZoomOut}
          className="flex h-8 w-8 items-center justify-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          title="Dézoomer"
        >
          <ZoomOutIcon size={18} />
        </button>
        <button
          onClick={handleReset}
          className="flex h-8 w-8 items-center justify-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          title="Réinitialiser"
        >
          <MaximizeIcon size={18} />
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative h-[60vh] max-h-[800px] w-full overflow-auto touch-pan-x touch-pan-y"
      >
        <div
          style={{
            width: `${scale * 100}%`,
            aspectRatio: '1/1',
            minHeight: '100%',
            transition: 'width 0.2s ease-out',
            transformOrigin: 'top left',
          }}
          className="relative mx-auto"
        >
          {children}
        </div>
      </div>
    </div>
  )
}
