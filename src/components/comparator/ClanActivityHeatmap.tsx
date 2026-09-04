'use client'

import React, { useState } from 'react'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'

interface ClanActivityHeatmapProps {
  clans: ClanComparatorEntry[]
}

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

// Couleurs par clan (jusqu'à 3 clans) — Bleu, Orange, Émeraude
const CLAN_COLORS = [
  { fill: '#3b82f6', glow: 'rgba(59, 130, 246, 0.85)' },  // Slot 1: Blue
  { fill: '#f97316', glow: 'rgba(249, 115, 22, 0.85)' },  // Slot 2: Orange
  { fill: '#10b981', glow: 'rgba(16, 185, 129, 0.85)' },  // Slot 3: Emerald
]

const SLOT_STYLES = [
  {
    name: 'P1',
    ringClass: 'ring-blue-500/50',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.3)]',
  },
  {
    name: 'P2',
    ringClass: 'ring-orange-500/50',
    badgeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-[0_0_8px_rgba(249,115,22,0.3)]',
  },
  {
    name: 'P3',
    ringClass: 'ring-emerald-500/50',
    badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
  },
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
  const [hoveredClanId, setHoveredClanId] = useState<number | null>(null)

  if (!clans || clans.length === 0) return null

  const clansWithData = clans.filter((clan) => clan.pulse?.activityByDayHour)

  if (clansWithData.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)]">
        <p className="text-sm text-[var(--theme-ui-text-muted)]">Pas de données d&apos;activité pour ces clans</p>
      </div>
    )
  }

  const maxByClan = clansWithData.map((clan) => clanMax(clan.pulse!.activityByDayHour!))

  return (
    <div>
      {/* Légende interactive */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5 sm:gap-3">
        {clansWithData.map((clan, index) => {
          const slot = SLOT_STYLES[index % SLOT_STYLES.length]
          const isHovered = hoveredClanId === clan.clanId
          const isOtherHovered = hoveredClanId !== null && hoveredClanId !== clan.clanId

          return (
            <button
              key={clan.clanId}
              type="button"
              onMouseEnter={() => setHoveredClanId(clan.clanId)}
              onMouseLeave={() => setHoveredClanId(null)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                isHovered
                  ? `${slot.badgeClass} ring-2 ${slot.ringClass} shadow-md`
                  : isOtherHovered
                    ? 'opacity-40 border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)]'
                    : 'border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)] hover:border-slate-400'
              }`}
            >
              <span className={`flex h-4 px-1 items-center justify-center rounded text-[10px] font-black uppercase border ${slot.badgeClass}`}>
                {slot.name}
              </span>
              <span className="font-mono font-bold text-[var(--theme-ui-text)]">[{clan.clanTag}]</span>
              <span className="text-[var(--theme-ui-text-muted)] truncate max-w-[140px]">{clan.clanName}</span>
            </button>
          )
        })}
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
                          const maxRadius = 5.5
                          const baseRadius = minRadius + intensity * (maxRadius - minRadius)
                          const color = CLAN_COLORS[ci % CLAN_COLORS.length]

                          const isHovered = hoveredClanId === clan.clanId
                          const isOtherHovered = hoveredClanId !== null && hoveredClanId !== clan.clanId

                          const radius = isHovered ? Math.max(baseRadius * 1.35, 4) : baseRadius
                          const opacity = isHovered ? 1 : isOtherHovered ? 0.12 : (0.35 + intensity * 0.65)
                          const boxShadow = isHovered ? `0 0 10px ${color.glow}, 0 0 3px ${color.fill}` : undefined

                          return (
                            <div
                              key={clan.clanId}
                              className={`rounded-full transition-all duration-200 ${isHovered ? 'z-10' : ''}`}
                              style={{
                                width: `${radius * 2}px`,
                                height: `${radius * 2}px`,
                                backgroundColor: color.fill,
                                opacity,
                                boxShadow,
                              }}
                            />
                          )
                        })}

                        {cellEntries.length > 0 && (
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                            <div className="whitespace-nowrap rounded-lg border border-[var(--theme-ui-border)] bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-md">
                              <div className="mb-0.5 font-semibold text-slate-200">{day} à {hour}h</div>
                              {cellEntries.map(({ clan, count, ci }) => {
                                const slot = SLOT_STYLES[ci % SLOT_STYLES.length]
                                const isItemHovered = hoveredClanId === clan.clanId
                                return (
                                  <div
                                    key={clan.clanId}
                                    className={`flex items-center gap-1.5 ${isItemHovered ? 'font-bold text-white' : 'text-slate-300'}`}
                                  >
                                    <span className={`inline-flex h-3 px-1 items-center justify-center rounded text-[8px] font-black uppercase border ${slot.badgeClass}`}>
                                      {slot.name}
                                    </span>
                                    <span>[{clan.clanTag}]</span>
                                    <span className="font-mono text-white">{count} match{count > 1 ? 's' : ''}</span>
                                  </div>
                                )
                              })}
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
