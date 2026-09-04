'use client'

import React, { useId, useState } from 'react'
import Link from 'next/link'
import {
  Trophy,
  Target,
  Flame,
  Crosshair,
  Gamepad2,
  Table as TableIcon,
  Activity,
  Crown,
} from 'lucide-react'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'

interface GlobalPerformancesDominanceProps {
  clans: ClanComparatorEntry[]
  selectedClanIds: number[]
}

const SLOT_CONFIGS = [
  {
    name: 'P1',
    colorName: 'Bleu',
    hex: '#3b82f6',
    glowHex: 'rgba(59, 130, 246, 0.45)',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    textClass: 'text-blue-400',
    bgClass: 'bg-blue-500',
  },
  {
    name: 'P2',
    colorName: 'Orange',
    hex: '#f97316',
    glowHex: 'rgba(249, 115, 22, 0.45)',
    badgeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    textClass: 'text-orange-400',
    bgClass: 'bg-orange-500',
  },
  {
    name: 'P3',
    colorName: 'Vert',
    hex: '#10b981',
    glowHex: 'rgba(16, 185, 129, 0.45)',
    badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500',
  },
]

type MetricAxis = {
  key: string
  label: string
  shortLabel: string
  icon: React.ComponentType<{ className?: string }>
  format: (val: number) => string
  getValue: (clan: ClanComparatorEntry) => number
}

const AXES: MetricAxis[] = [
  {
    key: 'matches',
    label: 'Matchs',
    shortLabel: 'Matchs',
    icon: Gamepad2,
    format: (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }),
    getValue: (c) => c.performance?.matchCount ?? 0,
  },
  {
    key: 'winrate',
    label: 'Winrate',
    shortLabel: 'Winrate',
    icon: Trophy,
    format: (v) => `${(v * 100).toFixed(1)} %`,
    getValue: (c) => c.performance?.winRate ?? 0,
  },
  {
    key: 'top10',
    label: 'Top 10',
    shortLabel: 'Top 10',
    icon: Target,
    format: (v) => `${(v * 100).toFixed(1)} %`,
    getValue: (c) => c.performance?.top10Rate ?? 0,
  },
  {
    key: 'damage',
    label: 'Dégâts / m.',
    shortLabel: 'Dégâts',
    icon: Flame,
    format: (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }),
    getValue: (c) => c.performance?.avgDamagePerMatch ?? 0,
  },
  {
    key: 'kills',
    label: 'Kills / m.',
    shortLabel: 'Kills',
    icon: Crosshair,
    format: (v) => v.toFixed(1),
    getValue: (c) => c.performance?.avgKillsPerMatch ?? 0,
  },
]

function formatPercent(value: number | undefined): string {
  if (value === undefined) return '—'
  return `${(value * 100).toFixed(1)} %`
}

function formatNumber(value: number | undefined): string {
  if (value === undefined) return '—'
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
}

export default function GlobalPerformancesDominance({
  clans,
  selectedClanIds,
}: GlobalPerformancesDominanceProps) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart')
  const [hoveredClanId, setHoveredClanId] = useState<number | null>(null)
  const chartId = useId()

  const orderedClans = selectedClanIds
    .map((id) => clans.find((c) => c.clanId === id))
    .filter((c): c is ClanComparatorEntry => Boolean(c))

  if (orderedClans.length === 0) return null

  // Canvas coordinates
  const svgWidth = 720
  const svgHeight = 290
  const padLeft = 36
  const padRight = 36
  const padTop = 75
  const padBottom = 30

  const innerWidth = svgWidth - padLeft - padRight
  const innerHeight = svgHeight - padTop - padBottom

  // Compute maximums for each axis
  const axisMaxes = AXES.map((axis) => {
    const vals = orderedClans.map((c) => axis.getValue(c))
    const max = Math.max(...vals, 0)
    return max > 0 ? max : 1
  })

  // Compute points for each clan
  const clanPoints = orderedClans.map((clan, clanIndex) => {
    const points = AXES.map((axis, axisIndex) => {
      const x = padLeft + (axisIndex / (AXES.length - 1)) * innerWidth
      const val = axis.getValue(clan)
      const max = axisMaxes[axisIndex]
      const normalized = max > 0 ? val / max : 0
      // Invert Y so highest value is at top
      const y = padTop + (1 - normalized) * innerHeight
      return { x, y, val, axis }
    })
    return { clan, clanIndex, points }
  })

  // Build smooth cubic Bézier SVG path
  const buildSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return ''
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i]
      const next = pts[i + 1]
      const cp1x = curr.x + (next.x - curr.x) * 0.45
      const cp1y = curr.y
      const cp2x = curr.x + (next.x - curr.x) * 0.55
      const cp2y = next.y
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`
    }
    return d
  }

  return (
    <section className="app-panel overflow-hidden p-4 sm:p-6 shadow-sm">
      {/* Header with Title & View Mode Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[var(--theme-ui-border)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <Activity className="h-4 w-4" />
            </span>
            <h2 className="text-base sm:text-lg font-bold text-[var(--theme-ui-text)]">
              Performances globales — Profil ADN Multi-Axes
            </h2>
          </div>
          <p className="text-xs text-[var(--theme-ui-text-muted)] mt-0.5">
            Signature tactique et trajectoire comparative sur les 5 piliers de performance PUBG.
          </p>
        </div>

        {/* View Switcher Toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)] p-1 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              viewMode === 'chart'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-[var(--theme-ui-text-muted)] hover:text-[var(--theme-ui-text)]'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Profil ADN</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              viewMode === 'table'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-[var(--theme-ui-text-muted)] hover:text-[var(--theme-ui-text)]'
            }`}
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span>Tableau</span>
          </button>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div className="pt-4 flex flex-col gap-4">
          {/* Interactive Legend with Clan Tags & Dominance Leaders */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
            {orderedClans.map((clan, idx) => {
              const slot = SLOT_CONFIGS[idx % SLOT_CONFIGS.length]
              const isHovered = hoveredClanId === clan.clanId
              const isOtherHovered = hoveredClanId !== null && hoveredClanId !== clan.clanId

              return (
                <button
                  key={clan.clanId}
                  type="button"
                  onMouseEnter={() => setHoveredClanId(clan.clanId)}
                  onMouseLeave={() => setHoveredClanId(null)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    isHovered
                      ? `${slot.badgeClass} ring-2 ring-blue-500/50 scale-105 shadow-md`
                      : isOtherHovered
                        ? 'opacity-40 border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)]'
                        : 'border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)] hover:border-slate-400'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded text-[10px] font-black uppercase ${slot.badgeClass}`}
                  >
                    P{idx + 1}
                  </span>
                  <span className="font-mono text-xs font-black text-[var(--theme-ui-text)]">
                    [{clan.clanTag}]
                  </span>
                  <span className="truncate max-w-[120px] text-[var(--theme-ui-text-secondary)] font-medium">
                    {clan.clanName}
                  </span>
                </button>
              )
            })}
          </div>

          {/* SVG Parallel Coordinates Chart */}
          <div className="w-full">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto select-none"
            >
              <defs>
                {orderedClans.map((_, idx) => {
                  const slot = SLOT_CONFIGS[idx % SLOT_CONFIGS.length]
                  return (
                    <filter
                      key={`glow-${idx}`}
                      id={`glow-${chartId}-${idx}`}
                      x="-20%"
                      y="-20%"
                      width="140%"
                      height="140%"
                    >
                      <feDropShadow
                        dx="0"
                        dy="0"
                        stdDeviation="4"
                        floodColor={slot.hex}
                        floodOpacity="0.75"
                      />
                    </filter>
                  )
                })}
              </defs>

              {/* Horizontal Reference Lines (25%, 50%, 75%, 100%) */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = padTop + (1 - pct) * innerHeight
                return (
                  <line
                    key={`ref-y-${i}`}
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={pct === 0 || pct === 1 ? '0.15' : '0.07'}
                    strokeDasharray={pct === 0 || pct === 1 ? 'none' : '4 4'}
                    className="text-[var(--theme-ui-text-muted)]"
                  />
                )
              })}

              {/* 5 Vertical Axes */}
              {AXES.map((axis, i) => {
                const x = padLeft + (i / (AXES.length - 1)) * innerWidth
                return (
                  <g key={`axis-${axis.key}`}>
                    {/* Vertical Axis Line */}
                    <line
                      x1={x}
                      y1={padTop}
                      x2={x}
                      y2={padTop + innerHeight}
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeOpacity="0.25"
                      className="text-[var(--theme-ui-text-muted)]"
                    />

                    {/* Top Axis Header (Remonté pour laisser respirer le haut de l'axe) */}
                    <text
                      x={x}
                      y={22}
                      textAnchor="middle"
                      className="fill-[var(--theme-ui-text)] font-sans text-[13px] font-bold tracking-wide"
                    >
                      {axis.label}
                    </text>

                    {/* Max Value Indicator under Axis Title */}
                    <text
                      x={x}
                      y={38}
                      textAnchor="middle"
                      className="fill-[var(--theme-ui-text-muted)] font-mono text-[10px] font-medium"
                    >
                      Max : {axis.format(axisMaxes[i])}
                    </text>

                    {/* Bottom Zero Baseline */}
                    <text
                      x={x}
                      y={padTop + innerHeight + 16}
                      textAnchor="middle"
                      className="fill-[var(--theme-ui-text-muted)] font-mono text-[9px] opacity-70"
                    >
                      0
                    </text>
                  </g>
                )
              })}

              {/* Splines / Connecting Curves for each Clan */}
              {clanPoints.map(({ clan, clanIndex, points }) => {
                const slot = SLOT_CONFIGS[clanIndex % SLOT_CONFIGS.length]
                const isHovered = hoveredClanId === clan.clanId
                const isOtherHovered = hoveredClanId !== null && hoveredClanId !== clan.clanId
                const pathData = buildSmoothPath(points)

                return (
                  <g
                    key={`clan-path-${clan.clanId}`}
                    onMouseEnter={() => setHoveredClanId(clan.clanId)}
                    onMouseLeave={() => setHoveredClanId(null)}
                    className="cursor-pointer transition-opacity duration-200"
                    style={{ opacity: isOtherHovered ? 0.18 : 1 }}
                  >
                    {/* Wider transparent stroke for easier hover hit-test */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="20"
                    />

                    {/* Main Colored Curve */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={slot.hex}
                      strokeWidth={isHovered ? '4' : '2.5'}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter={isHovered ? `url(#glow-${chartId}-${clanIndex})` : undefined}
                      className="transition-all duration-300 ease-out"
                    />
                  </g>
                )
              })}

              {/* Nodes and Value Tooltips/Badges on intersections */}
              {(hoveredClanId
                ? [...clanPoints].sort((a, b) =>
                    a.clan.clanId === hoveredClanId ? 1 : b.clan.clanId === hoveredClanId ? -1 : 0
                  )
                : clanPoints
              ).map(({ clan, clanIndex, points }) => {
                const slot = SLOT_CONFIGS[clanIndex % SLOT_CONFIGS.length]
                const isHovered = hoveredClanId === clan.clanId
                const isOtherHovered = hoveredClanId !== null && hoveredClanId !== clan.clanId

                return (
                  <g
                    key={`clan-nodes-${clan.clanId}`}
                    className="transition-opacity duration-200 pointer-events-none"
                    style={{ opacity: isOtherHovered ? 0.18 : 1 }}
                  >
                    {points.map((pt, ptIdx) => {
                      const isMax = pt.val === axisMaxes[ptIdx] && axisMaxes[ptIdx] > 0

                      // Offset coordinates to strictly avoid overlapping text between clans or with axis headers
                      let posX = pt.x
                      let posY = pt.y - 10
                      let textAnchor: 'start' | 'middle' | 'end' = 'middle'

                      if (orderedClans.length > 1) {
                        if (ptIdx === 0) {
                          // Leftmost axis: offset inwards to the right to avoid viewport clipping
                          posX = pt.x + 8
                          posY = clanIndex === 0 ? pt.y - 7 : clanIndex === 1 ? pt.y + 7 : pt.y + 16
                          textAnchor = 'start'
                        } else if (ptIdx === AXES.length - 1) {
                          // Rightmost axis: offset inwards to the left to avoid viewport clipping
                          posX = pt.x - 8
                          posY = clanIndex === 0 ? pt.y - 7 : clanIndex === 1 ? pt.y + 7 : pt.y + 16
                          textAnchor = 'end'
                        } else if (clanIndex === 0) {
                          // P1: Offset left
                          posX = pt.x - 10
                          posY = pt.y <= padTop + 15 ? pt.y + 3 : pt.y - 5
                          textAnchor = 'end'
                        } else if (clanIndex === 1) {
                          // P2: Offset right
                          posX = pt.x + 10
                          posY = pt.y <= padTop + 15 ? pt.y + 3 : pt.y - 5
                          textAnchor = 'start'
                        } else {
                          // P3: Below the node
                          posX = pt.x
                          posY = pt.y + 15
                          textAnchor = 'middle'
                        }
                      } else {
                        posY = pt.y <= padTop + 15 ? pt.y + 15 : pt.y - 10
                      }

                      return (
                        <g key={`pt-${clanIndex}-${ptIdx}`}>
                          {/* Circle Node */}
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={isHovered ? '6.5' : '4.5'}
                            fill={slot.hex}
                            stroke="#0f172a"
                            strokeWidth={isHovered ? '2.5' : '2'}
                            className="transition-all duration-200"
                          />

                          {/* Value Tag with theme stroke outline for maximum legibility */}
                          <text
                            x={posX}
                            y={posY}
                            textAnchor={textAnchor}
                            dominantBaseline="central"
                            fill={isHovered ? slot.hex : isMax ? '#f59e0b' : 'currentColor'}
                            style={{
                              paintOrder: 'stroke fill',
                              stroke: 'var(--theme-ui-surface, #0f172a)',
                              strokeWidth: '3.5px',
                              strokeLinejoin: 'round',
                            }}
                            className={`font-mono text-[10px] font-bold ${
                              isHovered ? 'text-[11px] font-black' : ''
                            } text-[var(--theme-ui-text)] transition-all`}
                          >
                            {pt.axis.format(pt.val)}
                          </text>
                        </g>
                      )
                    })}
                  </g>
                )
              })}
            </svg>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-[11px] text-[var(--theme-ui-text-muted)] px-0.5">
            <span>💡 Survole un clan pour faire ressortir sa trajectoire.</span>
            <span>Échelle normalisée (le haut de chaque axe = score max du trio).</span>
          </div>
        </div>
      ) : (
        /* Table View */
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--theme-ui-text-muted)] border-b border-[var(--theme-ui-border)]">
                <th className="pb-2.5 font-semibold whitespace-nowrap">Clan</th>
                <th className="pb-2.5 text-right font-semibold whitespace-nowrap">Matchs</th>
                <th className="pb-2.5 text-right font-semibold whitespace-nowrap">Winrate</th>
                <th className="pb-2.5 text-right font-semibold whitespace-nowrap">Top 10</th>
                <th className="pb-2.5 text-right font-semibold whitespace-nowrap">Dégâts/match</th>
                <th className="pb-2.5 text-right font-semibold whitespace-nowrap">Kills/match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--theme-ui-border)]">
              {orderedClans.map((clan, idx) => {
                const slot = SLOT_CONFIGS[idx % SLOT_CONFIGS.length]
                return (
                  <tr key={clan.clanId} className="hover:bg-[var(--theme-ui-surface-soft)]/40 transition">
                    <td className="py-3 font-semibold text-[var(--theme-ui-text)] whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-black border ${slot.badgeClass}`}
                        >
                          P{idx + 1}
                        </span>
                        <Link
                          href={`/clans/${clan.clanId}/overview`}
                          className="hover:text-blue-400 transition"
                        >
                          [{clan.clanTag}] {clan.clanName}
                        </Link>
                      </div>
                    </td>
                    <td className="py-3 text-right text-[var(--theme-ui-text-secondary)] font-mono whitespace-nowrap">
                      {formatNumber(clan.performance?.matchCount)}
                    </td>
                    <td className="py-3 text-right text-[var(--theme-ui-text-secondary)] font-mono whitespace-nowrap font-bold">
                      {formatPercent(clan.performance?.winRate)}
                    </td>
                    <td className="py-3 text-right text-[var(--theme-ui-text-secondary)] font-mono whitespace-nowrap">
                      {formatPercent(clan.performance?.top10Rate)}
                    </td>
                    <td className="py-3 text-right text-[var(--theme-ui-text-secondary)] font-mono whitespace-nowrap">
                      {formatNumber(clan.performance?.avgDamagePerMatch)}
                    </td>
                    <td className="py-3 text-right text-[var(--theme-ui-text-secondary)] font-mono whitespace-nowrap">
                      {clan.performance?.avgKillsPerMatch?.toFixed(1) ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
