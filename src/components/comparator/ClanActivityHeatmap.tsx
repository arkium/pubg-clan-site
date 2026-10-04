'use client'

import React, { useState } from 'react'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'
import { ClanLegend, SlotBadge, comparatorSlot, slotTint } from '@/components/comparator/ComparatorUi'

interface ClanActivityHeatmapProps {
  clans: ClanComparatorEntry[]
}

const DAYS = [
  { short: 'D', label: 'Dim', full: 'Dimanche' },
  { short: 'L', label: 'Lun', full: 'Lundi' },
  { short: 'M', label: 'Mar', full: 'Mardi' },
  { short: 'M', label: 'Mer', full: 'Mercredi' },
  { short: 'J', label: 'Jeu', full: 'Jeudi' },
  { short: 'V', label: 'Ven', full: 'Vendredi' },
  { short: 'S', label: 'Sam', full: 'Samedi' },
]
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function clanMax(data: number[][]) {
  let max = 0
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (data[d][h] > max) max = data[d][h]
    }
  }
  return max
}

/**
 * Punchcard d'activité : une pastille par clan et par créneau, à la couleur de son slot (la couleur du slot est
 * l'identité du clan sur toute la page), taille et opacité proportionnelles à son volume de matchs.
 */
export default function ClanActivityHeatmap({ clans }: ClanActivityHeatmapProps) {
  const [hoveredClanId, setHoveredClanId] = useState<number | null>(null)

  if (!clans || clans.length === 0) return null

  // Slot = place du clan dans la sélection, même quand un clan sans données d'activité le précède.
  const slotOf = (clan: ClanComparatorEntry) => comparatorSlot(clans.findIndex((c) => c.clanId === clan.clanId))
  const clansWithData = clans.filter((clan) => clan.pulse?.activityByDayHour)

  if (clansWithData.length === 0) {
    return (
      // État vide (charte §2) : bordure pointillée, rayon 14.
      <div className="flex h-32 items-center justify-center rounded-[14px] border border-dashed border-gray-200">
        <p className="t-body text-gray-500">Pas de données d&apos;activité pour ces clans</p>
      </div>
    )
  }

  const maxByClan = clansWithData.map((clan) => clanMax(clan.pulse!.activityByDayHour!))

  return (
    <div className="flex flex-col gap-4">
      <ClanLegend
        clans={clansWithData}
        hoveredClanId={hoveredClanId}
        onHover={setHoveredClanId}
        slotOf={slotOf}
      />

      {/* Grille sur toute la largeur, jamais de défilement horizontal : 7 colonnes souples. */}
      <div className="w-full min-w-0 pb-2">
        {/* En-tête : jours */}
        <div className="flex">
          <div className="w-7 shrink-0 sm:w-9" />
          <div className="flex flex-1">
            {DAYS.map((day) => (
              <div key={day.label} className="t-meta min-w-0 flex-1 pb-2 text-center">
                <span className="font-semibold sm:hidden">{day.short}</span>
                <span className="hidden sm:inline">{day.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Lignes : heures */}
        <div className="flex flex-col">
          {HOURS.map((hour) => (
            <div key={hour} className="flex items-center">
              <div className="t-num w-7 shrink-0 pr-1 text-right text-[11px] font-medium text-gray-500 sm:w-9 sm:pr-2">
                {hour % 2 === 0 ? `${hour}h` : ''}
              </div>
              <div className="flex flex-1">
                {DAYS.map((day, dIndex) => {
                  const cellEntries = clansWithData
                    .map((clan, ci) => ({
                      clan,
                      ci,
                      slot: slotOf(clan),
                      count: clan.pulse!.activityByDayHour![dIndex][hour],
                    }))
                    .filter((entry) => entry.count > 0)

                  return (
                    <div
                      key={day.label}
                      className="group relative flex h-5 min-w-0 flex-1 cursor-crosshair items-center justify-center gap-0.5 border-t border-gray-200 first:border-l"
                    >
                      {cellEntries.map(({ clan, ci, slot, count }) => {
                        const max = maxByClan[ci]
                        const intensity = max > 0 ? count / max : 0
                        const minRadius = 1.5
                        const maxRadius = 5.5
                        const baseRadius = minRadius + intensity * (maxRadius - minRadius)

                        const isHovered = hoveredClanId === clan.clanId
                        const isOtherHovered = hoveredClanId !== null && hoveredClanId !== clan.clanId

                        const radius = isHovered ? Math.max(baseRadius * 1.35, 4) : baseRadius
                        const opacity = isHovered ? 1 : isOtherHovered ? 0.12 : 0.35 + intensity * 0.65
                        const boxShadow = isHovered ? `0 0 10px ${slotTint(slot, 85)}, 0 0 3px ${slot.hex}` : undefined

                        return (
                          <div
                            key={clan.clanId}
                            className={`rounded-full transition-all duration-200 ${isHovered ? 'z-10' : ''}`}
                            style={{
                              width: `${radius * 2}px`,
                              height: `${radius * 2}px`,
                              backgroundColor: slot.hex,
                              opacity,
                              boxShadow,
                            }}
                          />
                        )
                      })}

                      {cellEntries.length > 0 && (
                        // Infobulle aux couleurs du thème (panneau du site), au survol de la case.
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                          <div className="flex flex-col gap-0.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-xl">
                            <div className="font-semibold text-gray-900">
                              {day.full} à {hour}h
                            </div>
                            {cellEntries.map(({ clan, slot, count }) => {
                              const isItemHovered = hoveredClanId === clan.clanId
                              return (
                                <div
                                  key={clan.clanId}
                                  className={`flex items-center gap-1.5 ${isItemHovered ? 'font-bold text-gray-900' : ''}`}
                                >
                                  <SlotBadge slot={slot} size="xs" />
                                  <span>[{clan.clanTag}]</span>
                                  <span className="t-num text-gray-900">
                                    {count} match{count > 1 ? 's' : ''}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                          <div className="absolute left-1/2 top-full -mt-px -translate-x-1/2 border-4 border-transparent border-t-[var(--theme-ui-border)]" />
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
  )
}
