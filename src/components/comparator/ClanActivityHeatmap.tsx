'use client'

import { useMemo } from 'react'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'

interface ClanActivityHeatmapProps {
  clans: ClanComparatorEntry[]
}

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

// Couleurs par clan (jusqu'à 3 clans)
const CLAN_COLORS = [
  { base: 'var(--theme-comparator-clanA)', fill: 'rgb(59, 130, 246)' }, // Blue
  { base: 'var(--theme-comparator-clanB)', fill: 'rgb(239, 68, 68)' },  // Red
  { base: 'var(--theme-comparator-clanC)', fill: 'rgb(16, 185, 129)' }, // Emerald
]

function ClanPunchcard({ clan, colorIndex }: { clan: ClanComparatorEntry; colorIndex: number }) {
  const data = clan.pulse?.activityByDayHour

  const maxMatches = useMemo(() => {
    if (!data) return 0
    let max = 0
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (data[d][h] > max) max = data[d][h]
      }
    }
    return max
  }, [data])

  if (!data || maxMatches === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-gray-100 bg-gray-50/50">
        <p className="text-sm text-gray-500">Pas de données d'activité pour {clan.clanName}</p>
      </div>
    )
  }

  const color = CLAN_COLORS[colorIndex % CLAN_COLORS.length]

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color.fill }} />
        <h3 className="font-semibold text-[var(--theme-ui-text)]">{clan.clanName} <span className="font-normal text-[var(--theme-ui-text-muted)]">[{clan.clanTag}]</span></h3>
      </div>
      
      <div className="overflow-x-auto pb-4">
        <div className="min-w-[600px] flex">
          {/* Y-axis: Days */}
          <div className="flex flex-col justify-between py-2 pr-4 text-xs font-medium text-[var(--theme-ui-text-muted)]">
            {DAYS.map((day) => (
              <div key={day} className="h-6 flex items-center">{day}</div>
            ))}
          </div>

          <div className="flex-1">
            {/* Grid */}
            <div className="flex flex-col justify-between py-2 gap-1.5">
              {DAYS.map((day, dIndex) => (
                <div key={day} className="flex justify-between items-center h-6 gap-1.5">
                  {HOURS.map((hour) => {
                    const count = data[dIndex][hour]
                    const intensity = maxMatches > 0 ? count / maxMatches : 0
                    
                    // Radius scale: 0 to 1 -> 3px to 10px diameter
                    // But standard heatmap usually uses opacity or color scale. 
                    // Github punchcard uses radius.
                    const minRadius = 1.5
                    const maxRadius = 8
                    const radius = count > 0 ? minRadius + intensity * (maxRadius - minRadius) : 0
                    
                    return (
                      <div 
                        key={hour} 
                        className="group relative flex h-full flex-1 items-center justify-center cursor-crosshair"
                      >
                        <div 
                          className="rounded-full transition-all duration-300"
                          style={{ 
                            width: `${radius * 2}px`, 
                            height: `${radius * 2}px`, 
                            backgroundColor: color.fill,
                            opacity: count > 0 ? 0.3 + (intensity * 0.7) : 0,
                            boxShadow: count > 0 ? `0 0 ${radius}px ${color.fill}80` : 'none'
                          }}
                        />
                        {/* Tooltip */}
                        {count > 0 && (
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                            <div className="whitespace-nowrap rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg">
                              {day} à {hour}h : {count} match{count > 1 ? 's' : ''}
                            </div>
                            <div className="absolute top-full left-1/2 -mt-1 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* X-axis: Hours */}
            <div className="mt-2 flex justify-between text-[10px] font-medium text-[var(--theme-ui-text-muted)]">
              {HOURS.map((hour) => (
                <div key={hour} className="flex-1 text-center">
                  {hour % 3 === 0 ? `${hour}h` : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ClanActivityHeatmap({ clans }: ClanActivityHeatmapProps) {
  if (!clans || clans.length === 0) return null

  return (
    <div className="space-y-6">
      {clans.map((clan, index) => (
        <ClanPunchcard key={clan.clanId} clan={clan} colorIndex={index} />
      ))}
    </div>
  )
}
