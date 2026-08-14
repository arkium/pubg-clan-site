'use client'

import type { ClanComparatorEntry } from '@/hooks/useClanComparator'

interface ClanActivityHeatmapProps {
  clans: ClanComparatorEntry[]
}

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

// Couleurs par clan (jusqu'à 3 clans)
const CLAN_COLORS = [
  { fill: 'rgb(59, 130, 246)' },  // Blue
  { fill: 'rgb(239, 68, 68)' },   // Red
  { fill: 'rgb(16, 185, 129)' },  // Emerald
]

function clanMax(data: number[][]) {
  let max = 0
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (data[d][h] > max) max = data[d][h]
    }
  }
  return max
}

export default function ClanActivityHeatmap({ clans }: ClanActivityHeatmapProps) {
  if (!clans || clans.length === 0) return null

  const clansWithData = clans.filter((clan) => clan.pulse?.activityByDayHour)

  if (clansWithData.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-gray-100 bg-gray-50/50">
        <p className="text-sm text-gray-500">Pas de données d&apos;activité pour ces clans</p>
      </div>
    )
  }

  const maxByClan = clansWithData.map((clan) => clanMax(clan.pulse!.activityByDayHour!))

  return (
    <div>
      {/* Légende */}
      <div className="mb-4 flex flex-wrap gap-4">
        {clansWithData.map((clan, index) => (
          <div key={clan.clanId} className="flex items-center gap-2 text-xs font-medium text-[var(--theme-ui-text-secondary)]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CLAN_COLORS[index % CLAN_COLORS.length].fill }} />
            {clan.clanName} <span className="text-[var(--theme-ui-text-muted)]">[{clan.clanTag}]</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[380px]">
          {/* En-tête : jours */}
          <div className="flex">
            <div className="w-9 shrink-0" />
            <div className="flex flex-1">
              {DAYS.map((day) => (
                <div key={day} className="flex-1 pb-2 text-center text-xs font-medium text-[var(--theme-ui-text-muted)]">
                  {day}
                </div>
              ))}
            </div>
          </div>

          {/* Lignes : heures */}
          <div className="flex flex-col">
            {HOURS.map((hour) => (
              <div key={hour} className="flex items-center">
                <div className="w-9 shrink-0 pr-2 text-right text-[10px] font-medium text-[var(--theme-ui-text-muted)]">
                  {hour % 2 === 0 ? `${hour}h` : ''}
                </div>
                <div className="flex flex-1">
                  {DAYS.map((day, dIndex) => {
                    const cellEntries = clansWithData
                      .map((clan, ci) => ({
                        clan,
                        ci,
                        count: clan.pulse!.activityByDayHour![dIndex][hour],
                      }))
                      .filter((entry) => entry.count > 0)

                    return (
                      <div
                        key={day}
                        className="group relative flex h-5 flex-1 items-center justify-center gap-0.5 border-t border-[var(--theme-ui-border)] first:border-l cursor-crosshair"
                      >
                        {cellEntries.map(({ clan, ci, count }) => {
                          const max = maxByClan[ci]
                          const intensity = max > 0 ? count / max : 0
                          const minRadius = 1.5
                          const maxRadius = 5
                          const radius = minRadius + intensity * (maxRadius - minRadius)
                          const color = CLAN_COLORS[ci % CLAN_COLORS.length]
                          return (
                            <div
                              key={clan.clanId}
                              className="rounded-full transition-all duration-300"
                              style={{
                                width: `${radius * 2}px`,
                                height: `${radius * 2}px`,
                                backgroundColor: color.fill,
                                opacity: 0.35 + intensity * 0.65,
                              }}
                            />
                          )
                        })}

                        {cellEntries.length > 0 && (
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                            <div className="whitespace-nowrap rounded bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
                              <div className="mb-0.5 font-semibold">{day} à {hour}h</div>
                              {cellEntries.map(({ clan, count }) => (
                                <div key={clan.clanId}>{clan.clanTag} : {count} match{count > 1 ? 's' : ''}</div>
                              ))}
                            </div>
                            <div className="absolute top-full left-1/2 -mt-1 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
