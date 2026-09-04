'use client'

import React, { useId, useState } from 'react'
import { Radar } from 'lucide-react'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'

const SLOT_CONFIGS = [
  {
    name: 'P1',
    hex: '#3b82f6',
    glowHex: 'rgba(59, 130, 246, 0.5)',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.3)]',
    textClass: 'text-blue-400',
    bgHighlightClass: 'bg-blue-500/15',
    ringClass: 'ring-blue-500/60',
  },
  {
    name: 'P2',
    hex: '#f97316',
    glowHex: 'rgba(249, 115, 22, 0.5)',
    badgeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-[0_0_8px_rgba(249,115,22,0.3)]',
    textClass: 'text-orange-400',
    bgHighlightClass: 'bg-orange-500/15',
    ringClass: 'ring-orange-500/60',
  },
  {
    name: 'P3',
    hex: '#10b981',
    glowHex: 'rgba(16, 185, 129, 0.5)',
    badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
    textClass: 'text-emerald-400',
    bgHighlightClass: 'bg-emerald-500/15',
    ringClass: 'ring-emerald-500/60',
  },
]

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
      slot: SLOT_CONFIGS[clanIndex % SLOT_CONFIGS.length],
    }
  })

  return (
    <section className="app-panel overflow-hidden p-4 sm:p-6">
      {/* Section Header */}
      <div className="flex items-start gap-2.5 mb-4 pb-3 border-b border-[var(--theme-ui-border)]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
          <Radar className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--theme-ui-text)]">
            Profil comparé (Radar)
          </h2>
          <p className="text-xs text-[var(--theme-ui-text-muted)] mt-0.5">
            Équilibre multidimensionnel des clans sur 5 axes tactiques majeurs (agressivité, survie, teamplay, activité, winrate).
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 md:flex-row">
        {/* SVG radar */}
        <svg
          viewBox="0 0 340 300"
          className="h-64 w-64 shrink-0 sm:h-72 sm:w-72 select-none"
          role="img"
          aria-label="Radar comparatif des clans"
        >
          {/* SVG Glow Filters for each slot */}
          <defs>
            {clans.map((_, idx) => {
              const slot = SLOT_CONFIGS[idx % SLOT_CONFIGS.length]
              return (
                <filter
                  key={`radar-glow-${idx}`}
                  id={`radar-glow-${radarId}-${idx}`}
                  x="-30%"
                  y="-30%"
                  width="160%"
                  height="160%"
                >
                  <feDropShadow
                    dx="0"
                    dy="0"
                    stdDeviation="4"
                    floodColor={slot.hex}
                    floodOpacity="0.8"
                  />
                </filter>
              )
            })}
          </defs>

          {/* Concentric Polygons (25%, 50%, 75%, 100%) */}
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

          {/* Radial Axis Lines */}
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

          {/* Radar Polygons with Hover Glow & Hit-Testing */}
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
                {/* Wider invisible stroke for easier hover interaction */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                />

                {/* Main filled polygon & styled outline */}
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

          {/* Vertex Nodes for each Clan */}
          {clanPolygons.map(({ clan, points, slot }) => {
            const isHovered = hoveredClanId === clan.clanId
            const isOtherHovered = hoveredClanId !== null && hoveredClanId !== clan.clanId

            return (
              <g
                key={`dots-${clan.clanId}`}
                style={{ opacity: isOtherHovered ? 0.15 : 1 }}
                className="transition-opacity duration-200 pointer-events-none"
              >
                {points.map((p, pIdx) => (
                  <circle
                    key={`dot-${clan.clanId}-${pIdx}`}
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? 4.5 : 3}
                    fill={isHovered ? '#ffffff' : slot.hex}
                    stroke={slot.hex}
                    strokeWidth={isHovered ? 2 : 1}
                    className="transition-all duration-200"
                  />
                ))}
              </g>
            )
          })}

          {/* Axis Labels */}
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
                className="fill-[var(--theme-ui-text-muted)] font-sans text-[11px] font-semibold"
              >
                {axis.label}
              </text>
            )
          })}
        </svg>

        {/* Legend & Stats Table */}
        <div className="min-w-0 flex-1">
          {/* Interactive Legend Buttons with P1/P2/P3 */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            {clans.map((clan, clanIndex) => {
              const slot = SLOT_CONFIGS[clanIndex % SLOT_CONFIGS.length]
              const isHovered = hoveredClanId === clan.clanId
              const isOtherHovered = hoveredClanId !== null && hoveredClanId !== clan.clanId

              return (
                <button
                  key={clan.clanId}
                  type="button"
                  onMouseEnter={() => setHoveredClanId(clan.clanId)}
                  onMouseLeave={() => setHoveredClanId(null)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
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
                  <span className="text-[var(--theme-ui-text-muted)] truncate max-w-[120px]">{clan.clanName}</span>
                </button>
              )
            })}
          </div>

          {/* Interactive Comparison Table */}
          <div className="w-full">
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr className="text-left text-[var(--theme-ui-text-muted)]">
                  <th
                    className="pb-1.5 font-medium"
                    style={{ width: clans.length === 1 ? '50%' : clans.length === 2 ? '36%' : '28%' }}
                  >
                    Axe
                  </th>
                  {clans.map((clan, clanIndex) => {
                    const slot = SLOT_CONFIGS[clanIndex % SLOT_CONFIGS.length]
                    const isHovered = hoveredClanId === clan.clanId
                    const colWidth = clans.length === 1 ? '50%' : clans.length === 2 ? '32%' : '24%'
                    return (
                      <th
                        key={clan.clanId}
                        style={{ width: colWidth }}
                        className={`pb-1.5 px-2 text-right font-medium transition-colors ${
                          isHovered ? 'text-[var(--theme-ui-text)] font-bold' : ''
                        }`}
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          <span className={`inline-flex h-3.5 px-1 items-center justify-center rounded text-[9px] font-black uppercase border ${slot.badgeClass}`}>
                            {slot.name}
                          </span>
                          <span className="truncate">{clan.clanTag}</span>
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--theme-ui-border)]">
                {axes.map((axis) => (
                  <tr key={axis.key}>
                    <td className="py-1.5 text-[var(--theme-ui-text-secondary)] font-medium truncate">{axis.label}</td>
                    {axis.values.map((value, clanIndex) => {
                      const clan = clans[clanIndex]
                      const isHovered = hoveredClanId === clan.clanId
                      const slot = SLOT_CONFIGS[clanIndex % SLOT_CONFIGS.length]
                      return (
                        <td
                          key={clan.clanId}
                          className={`py-1.5 px-2 text-right transition-colors rounded ${
                            isHovered
                              ? `${slot.textClass} ${slot.bgHighlightClass} font-bold`
                              : 'font-semibold text-[var(--theme-ui-text)]'
                          }`}
                        >
                          {axis.format(value)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-3 grid gap-x-4 gap-y-1 border-t border-[var(--theme-ui-border)] pt-2 text-[11px] text-[var(--theme-ui-text-muted)] sm:grid-cols-2">
            <div className="flex gap-1">
              <dt className="shrink-0 font-semibold text-[var(--theme-ui-text-secondary)]">Agressivité :</dt>
              <dd>dégâts moyens infligés par match</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 font-semibold text-[var(--theme-ui-text-secondary)]">Survie :</dt>
              <dd>temps de survie moyen par match</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 font-semibold text-[var(--theme-ui-text-secondary)]">Teamplay :</dt>
              <dd>revives donnés par match</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 font-semibold text-[var(--theme-ui-text-secondary)]">Activité :</dt>
              <dd>part du roster actif sur la période</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 font-semibold text-[var(--theme-ui-text-secondary)]">Winrate :</dt>
              <dd>part des matchs terminés en victoire</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}
