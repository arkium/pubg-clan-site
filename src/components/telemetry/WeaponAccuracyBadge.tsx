'use client'

import React from 'react'
import { Crosshair } from 'lucide-react'

export interface WeaponAccuracyBadgeProps {
  shotsFired: number
  hitsLanded: number
  weaponName?: string
  size?: 'sm' | 'md'
  showBar?: boolean
  className?: string
}

export function WeaponAccuracyBadge({
  shotsFired,
  hitsLanded,
  weaponName,
  size = 'md',
  showBar = false,
  className = '',
}: WeaponAccuracyBadgeProps) {
  const safeShots = Math.max(0, shotsFired || 0)
  const safeHits = Math.max(0, hitsLanded || 0)
  const accuracy = safeShots > 0 ? Math.round((safeHits / safeShots) * 100) : 0

  // Color scheme based on PUBG competitive accuracy thresholds
  let colorClass = 'text-slate-400 bg-slate-800/60 border-slate-700/60'
  let barColorClass = 'bg-slate-500'
  let label = 'Faible'

  if (safeShots === 0) {
    colorClass = 'text-slate-500 bg-slate-900/40 border-slate-800'
    label = 'N/A'
  } else if (accuracy >= 28) {
    colorClass = 'text-emerald-400 bg-emerald-950/40 border-emerald-700/50 shadow-sm shadow-emerald-950/30'
    barColorClass = 'bg-emerald-500'
    label = 'Elite'
  } else if (accuracy >= 20) {
    colorClass = 'text-cyan-300 bg-cyan-950/40 border-cyan-700/50'
    barColorClass = 'bg-cyan-500'
    label = 'Très bon'
  } else if (accuracy >= 14) {
    colorClass = 'text-amber-300 bg-amber-950/40 border-amber-700/50'
    barColorClass = 'bg-amber-500'
    label = 'Moyen'
  } else {
    colorClass = 'text-orange-400/80 bg-orange-950/30 border-orange-800/40'
    barColorClass = 'bg-orange-500/70'
    label = 'Arrosage'
  }

  const isSmall = size === 'sm'

  return (
    <div
      className={`inline-flex flex-col gap-1 ${className}`}
      title={
        safeShots > 0
          ? `${weaponName ? `${weaponName}: ` : ''}${accuracy}% (${safeHits} touches sur ${safeShots} tirs) - ${label}`
          : 'Aucun tir enregistré'
      }
    >
      <div
        className={`inline-flex items-center gap-1.5 font-mono rounded-md border px-2 py-0.5 transition-colors ${colorClass} ${
          isSmall ? 'text-[10px]' : 'text-xs'
        }`}
      >
        <Crosshair className={`${isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} shrink-0 opacity-80`} />
        <span className="font-bold">{safeShots > 0 ? `${accuracy}%` : '--%'}</span>
        <span className="text-[10px] opacity-60 font-sans">
          ({safeHits}/{safeShots})
        </span>
      </div>

      {showBar && safeShots > 0 && (
        <div className="w-full bg-slate-800/80 rounded-full h-1 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-full ${barColorClass}`}
            style={{ width: `${Math.min(100, Math.max(0, accuracy))}%` }}
          />
        </div>
      )}
    </div>
  )
}
