'use client'

import React, { useId, useState } from 'react'
import { Radar } from 'lucide-react'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'
import {
  ClanLegend,
  ComparatorSectionHeader,
  SlotBadge,
  comparatorSlot,
  slotInk,
  slotTint,
} from '@/components/comparator/ComparatorUi'

type Axis = {
  key: string
  label: string
  values: number[]
  max: number
  format: (value: number) => string
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatSeconds(value: number): string {
  const minutes = Math.round(value / 60)
  return `${minutes} min`
}

function formatNumber(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
}

function formatDecimal(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function buildAxes(clans: ClanComparatorEntry[]): Axis[] {
  const aggression = clans.map((c) => c.dna?.avgDamagePerMatch ?? 0)
  const survival = clans.map((c) => c.dna?.avgTimeSurvivedSeconds ?? 0)
  const teamplay = clans.map((c) => {
    const revives = c.dna?.revivesGiven ?? 0
    const matches = c.performance?.matchCount ?? 0
    return matches > 0 ? revives / matches : 0
  })
  const activity = clans.map((c) => c.pulse?.rosterHealth.participationRate ?? 0)
  const performance = clans.map((c) => c.performance?.winRate ?? 0)

  const withMax = (values: number[]) => {
    const max = Math.max(...values)
    return max > 0 ? max : 1
  }

  return [
    { key: 'aggression', label: 'Agressivité', values: aggression, max: withMax(aggression), format: formatNumber },
    { key: 'survival', label: 'Survie', values: survival, max: withMax(survival), format: formatSeconds },
    { key: 'teamplay', label: 'Teamplay', values: teamplay, max: withMax(teamplay), format: (v) => formatDecimal(v) + '/match' },
    { key: 'activity', label: 'Activité', values: activity, max: withMax(activity), format: formatPercent },
    { key: 'performance', label: 'Winrate', values: performance, max: withMax(performance), format: formatPercent },
  ]
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

type ClanComparatorRadarProps = {
  clans: ClanComparatorEntry[]
}

export default function ClanComparatorRadar({ clans }: ClanComparatorRadarProps) {
  const radarId = useId().replace(/:/g, '')
  const [hoveredClanId, setHoveredClanId] = useState<number | null>(null)

  if (clans.length === 0) return null

  const axes = buildAxes(clans)
  const cx = 170
  const cy = 150
  const radius = 100

  // Build polygon points for each clan
  const clanPolygons = clans.map((clan, clanIndex) => {
    const points = axes.map((axis, i) => {
      const angle = (360 / axes.length) * i
      const value = axis.values[clanIndex]
      const r = (value / axis.max) * radius
      return {
        ...polarToCartesian(cx, cy, Math.max(0, Math.min(radius, r)), angle),
        value,
        label: axis.label,
        formatted: axis.format(value),
      }
    })
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'
    return {
      clan,
      clanIndex,
      points,
      pathD,
      slot: comparatorSlot(clanIndex),
    }
  })

  // Colonnes proportionnelles strictes (#dataviz-esport, règle 4) : le tableau ne déborde jamais au survol.
  const axisColWidth = clans.length === 1 ? '50%' : clans.length === 2 ? '36%' : '28%'
  const clanColWidth = clans.length === 1 ? '50%' : clans.length === 2 ? '32%' : '24%'

  return (
    <section className="app-panel flex flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <ComparatorSectionHeader
        icon={Radar}
        title="Profil comparé (Radar)"
        subtitle="Équilibre multidimensionnel des clans sur 5 axes tactiques majeurs (agressivité, survie, teamplay, activité, winrate)."
      />

      <div className="flex flex-col items-center gap-6 md:flex-row">
        {/* Radar SVG : étiquettes à 15 unités, soit 11 px au moins une fois le dessin réduit à 256 px (charte §3). */}
        <svg
          viewBox="0 0 340 300"
          className="h-64 w-64 shrink-0 select-none sm:h-72 sm:w-72"
          role="img"
          aria-label="Radar comparatif des clans"
        >
          {/* Halo de chaque slot au survol (#dataviz-esport, règle 1) */}
          <defs>
            {clans.map((_, idx) => (
              <filter
                key={`radar-glow-${idx}`}
                id={`radar-glow-${radarId}-${idx}`}
                x="-30%"
                y="-30%"
                width="160%"
                height="160%"
              >
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={comparatorSlot(idx).hex} floodOpacity="0.8" />
              </filter>
            ))}
          </defs>

          {/* Toiles concentriques (25 %, 50 %, 75 %, 100 %) */}
          {[0.25, 0.5, 0.75, 1].map((scale) => {
            const r = radius * scale
            const pointsStr = axes
              .map((_, i) => {
                const angle = (360 / axes.length) * i
                const { x, y } = polarToCartesian(cx, cy, r, angle)
                return `${x.toFixed(1)},${y.toFixed(1)}`
              })
              .join(' ')
            return (
              <polygon
                key={scale}
                points={pointsStr}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-[var(--theme-ui-border)]"
                opacity={0.6}
              />
            )
          })}

          {/* Axes */}
          {axes.map((_, i) => {
            const angle = (360 / axes.length) * i
            const { x, y } = polarToCartesian(cx, cy, radius, angle)
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={x.toFixed(1)}
                y2={y.toFixed(1)}
                stroke="currentColor"
                strokeWidth="1"
                className="text-[var(--theme-ui-border)]"
                opacity={0.6}
              />
            )
          })}

          {/* Polygones des clans : halo au survol, les autres estompés */}
          {clanPolygons.map(({ clan, clanIndex, pathD, slot }) => {
            const isHovered = hoveredClanId === clan.clanId
            const isOtherHovered = hoveredClanId !== null && hoveredClanId !== clan.clanId

            return (
              <g
                key={clan.clanId}
                onMouseEnter={() => setHoveredClanId(clan.clanId)}
                onMouseLeave={() => setHoveredClanId(null)}
                className="cursor-pointer transition-all duration-300"
                style={{ opacity: isOtherHovered ? 0.15 : 1 }}
              >
                {/* Trait invisible plus large : survol plus facile */}
                <path d={pathD} fill="none" stroke="transparent" strokeWidth="18" />

                <path
                  d={pathD}
                  fill={slot.hex}
                  fillOpacity={isHovered ? 0.35 : 0.18}
                  stroke={slot.hex}
                  strokeWidth={isHovered ? 3.5 : 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  filter={isHovered ? `url(#radar-glow-${radarId}-${clanIndex})` : undefined}
                  className="transition-all duration-300 ease-out"
                />
              </g>
            )
          })}

          {/* Sommets de chaque clan (creux, à la couleur de la surface, au survol) */}
          {clanPolygons.map(({ clan, points, slot }) => {
            const isHovered = hoveredClanId === clan.clanId
            const isOtherHovered = hoveredClanId !== null && hoveredClanId !== clan.clanId

            return (
              <g
                key={`dots-${clan.clanId}`}
                style={{ opacity: isOtherHovered ? 0.15 : 1 }}
                className="pointer-events-none transition-opacity duration-200"
              >
                {points.map((p, pIdx) => (
                  <circle
                    key={`dot-${clan.clanId}-${pIdx}`}
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? 4.5 : 3}
                    stroke={slot.hex}
                    strokeWidth={isHovered ? 2 : 1}
                    style={{ fill: isHovered ? 'var(--app-surface)' : slot.hex }}
                    className="transition-all duration-200"
                  />
                ))}
              </g>
            )
          })}

          {/* Libellés des axes */}
          {axes.map((axis, i) => {
            const angle = (360 / axes.length) * i
            const labelRadius = radius + 22
            const { x, y } = polarToCartesian(cx, cy, labelRadius, angle)
            return (
              <text
                key={axis.key}
                x={x.toFixed(1)}
                y={y.toFixed(1)}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-[var(--theme-ui-text-muted)] font-sans text-[15px] font-semibold"
              >
                {axis.label}
              </text>
            )
          })}
        </svg>

        {/* Légende et tableau, synchronisés avec le radar (#dataviz-esport, règle 3) */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 self-stretch md:self-auto">
          <ClanLegend clans={clans} hoveredClanId={hoveredClanId} onHover={setHoveredClanId} />

          <table className="w-full table-fixed text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-1.5 font-medium" style={{ width: axisColWidth }}>
                  Axe
                </th>
                {clans.map((clan, clanIndex) => {
                  const isHovered = hoveredClanId === clan.clanId
                  return (
                    <th
                      key={clan.clanId}
                      style={{ width: clanColWidth }}
                      className={`px-2 pb-1.5 text-right transition-colors ${isHovered ? 'font-bold text-gray-900' : 'font-medium'}`}
                    >
                      <span className="inline-flex max-w-full items-center justify-end gap-1">
                        <SlotBadge slot={comparatorSlot(clanIndex)} size="xs" />
                        <span className="truncate">{clan.clanTag}</span>
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {axes.map((axis) => (
                <tr key={axis.key}>
                  <td className="truncate py-1.5 font-medium text-gray-700">{axis.label}</td>
                  {axis.values.map((value, clanIndex) => {
                    const clan = clans[clanIndex]
                    const isHovered = hoveredClanId === clan.clanId
                    const slot = comparatorSlot(clanIndex)
                    return (
                      <td
                        key={clan.clanId}
                        className={`t-num rounded-md px-2 py-1.5 text-right transition-colors ${
                          isHovered ? 'font-bold' : 'font-semibold text-gray-900'
                        }`}
                        style={isHovered ? { color: slotInk(slot), backgroundColor: slotTint(slot, 15) } : undefined}
                      >
                        {axis.format(value)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="grid gap-x-4 gap-y-1 border-t border-gray-200 pt-2 text-[11px] text-gray-500 sm:grid-cols-2">
            <div className="flex gap-1">
              <dt className="shrink-0 font-semibold text-gray-700">Agressivité :</dt>
              <dd>dégâts moyens infligés par match</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 font-semibold text-gray-700">Survie :</dt>
              <dd>temps de survie moyen par match</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 font-semibold text-gray-700">Teamplay :</dt>
              <dd>revives donnés par match</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 font-semibold text-gray-700">Activité :</dt>
              <dd>part du roster actif sur la période</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 font-semibold text-gray-700">Winrate :</dt>
              <dd>part des matchs terminés en victoire</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}
