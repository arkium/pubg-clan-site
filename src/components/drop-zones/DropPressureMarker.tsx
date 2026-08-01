import { Flame } from 'lucide-react'

import {
  DROP_PRESSURE_LEVELS,
  type DropPressureLevel,
} from '@/lib/drop-zone-pressure'

type DropPressureMarkerProps = {
  xPct: number
  yPct: number
  pressureLevel: DropPressureLevel
  borderColor: string
  title: string
}

export default function DropPressureMarker({
  xPct,
  yPct,
  pressureLevel,
  borderColor,
  title,
}: DropPressureMarkerProps) {
  const pressure = DROP_PRESSURE_LEVELS[pressureLevel]

  return (
    <div
      className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center shadow"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        border: `2px solid ${borderColor}`,
        borderRadius: '50%',
        backgroundColor: pressure.color,
        boxShadow: '0 0 0 1px rgb(255 255 255 / 0.85), 0 1px 3px rgb(0 0 0 / 0.65)',
        zIndex: 20,
      }}
      title={title}
      data-drop-pressure={pressureLevel}
    >
      <Flame className="h-3 w-3 text-white" strokeWidth={2.5} aria-hidden="true" />
    </div>
  )
}