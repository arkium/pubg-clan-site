import { Flame } from 'lucide-react'

import { DROP_PRESSURE_LEVELS } from '@/lib/drop-zone-pressure'

export default function DropPressureLegend() {
  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700">
        <span className="font-semibold text-slate-900">Pression à 250 m</span>
        {Object.entries(DROP_PRESSURE_LEVELS).map(([level, pressure]) => (
          <span key={level} className="inline-flex items-center gap-1.5">
            <span
              className="inline-flex h-4 w-4 items-center justify-center"
              style={{
                borderRadius: '50%',
                backgroundColor: pressure.color,
              }}
            >
              <Flame className="h-2.5 w-2.5 text-white" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span>
              {pressure.label} {pressure.max === null ? `${pressure.min}+` : `${pressure.min}–${pressure.max}`}
            </span>
          </span>
        ))}
        <span className="text-slate-500">Autres joueurs autour du drop suivi</span>
      </div>
    </div>
  )
}