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
  MousePointer2,
} from 'lucide-react'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'
import {
  ClanLegend,
  ComparatorSectionHeader,
  SlotBadge,
  comparatorSlot,
  slotInk,
} from '@/components/comparator/ComparatorUi'

interface GlobalPerformancesDominanceProps {
  clans: ClanComparatorEntry[]
  selectedClanIds: number[]
}

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
    <section className="app-panel flex flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <ComparatorSectionHeader
        icon={Activity}
        title="Performances globales — Profil ADN Multi-Axes"
        subtitle="Signature tactique et trajectoire comparative sur les 5 piliers de performance PUBG."
      >
        <SegmentedControl
          options={[
            { value: 'chart', label: 'Profil ADN', icon: <Activity className="h-3.5 w-3.5" aria-hidden="true" /> },
            { value: 'table', label: 'Tableau', icon: <TableIcon className="h-3.5 w-3.5" aria-hidden="true" /> },
          ]}
          value={viewMode}
          onChange={setViewMode}
          className="shrink-0 self-start sm:self-auto"
        />
      </ComparatorSectionHeader>

      {viewMode === 'chart' ? (
        <div className="flex flex-col gap-4">
          <ClanLegend
            clans={orderedClans}
            hoveredClanId={hoveredClanId}
            onHover={setHoveredClanId}
            className="justify-center sm:justify-start"
          />

          {/* Sous 768 px, le tracé de 720 unités réduit ses textes sous 11 px : barres comparées par axe à la place
              (maquette « Badges de slot & barres comparées », #comparateur). Même échelle : le maximum du trio. */}
          <div className="flex flex-col gap-4 md:hidden">
            {AXES.map((axis, axisIndex) => {
              const Icon = axis.icon
              return (
                <div key={axis.key} className="flex flex-col gap-1.5">
                  <span className="t-label flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {axis.label}
                  </span>
                  {orderedClans.map((clan, clanIndex) => {
                    const slot = comparatorSlot(clanIndex)
                    const value = axis.getValue(clan)
                    const max = axisMaxes[axisIndex]
                    const isMax = value === max && max > 0
                    return (
                      <div
                        key={clan.clanId}
                        className="grid grid-cols-[28px_minmax(0,1fr)_64px] items-center gap-2.5 text-xs"
                      >
                        <SlotBadge slot={slot} size="xs" />
                        <span className="h-2 rounded-full bg-[var(--game-track)]">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: slot.hex }}
                          />
                        </span>
                        <b className={`t-num text-right ${isMax ? 't-accent' : 'text-gray-900'}`}>{axis.format(value)}</b>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Coordonnées parallèles (à partir de 768 px) */}
          <div className="hidden w-full md:block">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="h-auto w-full select-none">
              <defs>
                {orderedClans.map((_, idx) => (
                  <filter
                    key={`glow-${idx}`}
                    id={`glow-${chartId}-${idx}`}
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                  >
                    <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={comparatorSlot(idx).hex} floodOpacity="0.75" />
                  </filter>
                ))}
              </defs>

              {/* Lignes de référence (0, 25, 50, 75, 100 %) */}
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

              {/* 5 axes verticaux */}
              {AXES.map((axis, i) => {
                const x = padLeft + (i / (AXES.length - 1)) * innerWidth
                return (
                  <g key={`axis-${axis.key}`}>
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

                    {/* Titre de l'axe */}
                    <text
                      x={x}
                      y={22}
                      textAnchor="middle"
                      className="fill-[var(--theme-ui-text)] font-sans text-[14px] font-bold tracking-wide"
                    >
                      {axis.label}
                    </text>

                    {/* Valeur maximale, sous le titre */}
                    <text
                      x={x}
                      y={40}
                      textAnchor="middle"
                      className="fill-[var(--theme-ui-text-muted)] font-sans text-[12px] font-medium"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      Max : {axis.format(axisMaxes[i])}
                    </text>

                    {/* Zéro, au pied de l'axe */}
                    <text
                      x={x}
                      y={padTop + innerHeight + 17}
                      textAnchor="middle"
                      className="fill-[var(--theme-ui-text-muted)] font-sans text-[12px]"
                    >
                      0
                    </text>
                  </g>
                )
              })}

              {/* Courbe de chaque clan */}
              {clanPoints.map(({ clan, clanIndex, points }) => {
                const slot = comparatorSlot(clanIndex)
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
                    {/* Trait transparent plus large : survol plus facile */}
                    <path d={pathData} fill="none" stroke="transparent" strokeWidth="20" />

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

              {/* Nœuds et valeurs ; le clan survolé passe au premier plan */}
              {(hoveredClanId
                ? [...clanPoints].sort((a, b) =>
                    a.clan.clanId === hoveredClanId ? 1 : b.clan.clanId === hoveredClanId ? -1 : 0
                  )
                : clanPoints
              ).map(({ clan, clanIndex, points }) => {
                const slot = comparatorSlot(clanIndex)
                const isHovered = hoveredClanId === clan.clanId
                const isOtherHovered = hoveredClanId !== null && hoveredClanId !== clan.clanId

                return (
                  <g
                    key={`clan-nodes-${clan.clanId}`}
                    className="pointer-events-none transition-opacity duration-200"
                    style={{ opacity: isOtherHovered ? 0.18 : 1 }}
                  >
                    {points.map((pt, ptIdx) => {
                      const isMax = pt.val === axisMaxes[ptIdx] && axisMaxes[ptIdx] > 0

                      // Décalages pour que les valeurs des clans ne se chevauchent pas, ni avec les titres d'axe
                      let posX = pt.x
                      let posY = pt.y - 10
                      let textAnchor: 'start' | 'middle' | 'end' = 'middle'

                      if (orderedClans.length > 1) {
                        if (ptIdx === 0) {
                          // Axe de gauche : valeur vers l'intérieur (pas de coupure en bord de dessin)
                          posX = pt.x + 8
                          posY = clanIndex === 0 ? pt.y - 7 : clanIndex === 1 ? pt.y + 7 : pt.y + 16
                          textAnchor = 'start'
                        } else if (ptIdx === AXES.length - 1) {
                          // Axe de droite : valeur vers l'intérieur
                          posX = pt.x - 8
                          posY = clanIndex === 0 ? pt.y - 7 : clanIndex === 1 ? pt.y + 7 : pt.y + 16
                          textAnchor = 'end'
                        } else if (clanIndex === 0) {
                          // P1 : à gauche
                          posX = pt.x - 10
                          posY = pt.y <= padTop + 15 ? pt.y + 3 : pt.y - 5
                          textAnchor = 'end'
                        } else if (clanIndex === 1) {
                          // P2 : à droite
                          posX = pt.x + 10
                          posY = pt.y <= padTop + 15 ? pt.y + 3 : pt.y - 5
                          textAnchor = 'start'
                        } else {
                          // P3 : sous le nœud
                          posX = pt.x
                          posY = pt.y + 15
                          textAnchor = 'middle'
                        }
                      } else {
                        posY = pt.y <= padTop + 15 ? pt.y + 15 : pt.y - 10
                      }

                      return (
                        <g key={`pt-${clanIndex}-${ptIdx}`}>
                          {/* Nœud cerclé de la couleur du panneau */}
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={isHovered ? '6.5' : '4.5'}
                            fill={slot.hex}
                            strokeWidth={isHovered ? '2.5' : '2'}
                            style={{ stroke: 'var(--app-surface)' }}
                            className="transition-all duration-200"
                          />

                          {/* Valeur, détourée de la couleur du panneau ; meilleure valeur de l'axe à l'accent (Top 1) */}
                          <text
                            x={posX}
                            y={posY}
                            textAnchor={textAnchor}
                            dominantBaseline="central"
                            style={{
                              fill: isHovered ? slotInk(slot) : isMax ? 'var(--theme-ui-accent-text)' : 'var(--theme-ui-text)',
                              fontVariantNumeric: 'tabular-nums',
                              paintOrder: 'stroke fill',
                              stroke: 'var(--app-surface)',
                              strokeWidth: '3.5px',
                              strokeLinejoin: 'round',
                            }}
                            className={`font-sans transition-all ${isHovered ? 'text-[13px] font-black' : 'text-[12px] font-bold'}`}
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

          <div className="t-meta flex flex-col items-start justify-between gap-1 px-0.5 sm:flex-row sm:items-center">
            <span className="hidden items-center gap-1.5 md:inline-flex">
              <MousePointer2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Survole un clan pour faire ressortir sa trajectoire.
            </span>
            <span>Échelle normalisée (le haut de chaque axe = score max du trio).</span>
          </div>
        </div>
      ) : (
        // Tableau : jamais de défilement horizontal — colonnes secondaires masquées sous 640 px, nom du clan sous 768 px.
        <div className="app-table-shell overflow-hidden">
          <table className="w-full text-sm">
            <thead className="app-table-head text-xs">
              <tr className="text-left">
                <th className="px-[9px] py-2 font-semibold">Clan</th>
                <th className="hidden px-[9px] py-2 text-right font-semibold whitespace-nowrap sm:table-cell">Matchs</th>
                <th className="px-[9px] py-2 text-right font-semibold whitespace-nowrap">Winrate</th>
                <th className="hidden px-[9px] py-2 text-right font-semibold whitespace-nowrap sm:table-cell">Top 10</th>
                <th className="px-[9px] py-2 text-right font-semibold whitespace-nowrap">Dégâts/match</th>
                <th className="hidden px-[9px] py-2 text-right font-semibold whitespace-nowrap sm:table-cell">Kills/match</th>
              </tr>
            </thead>
            <tbody>
              {orderedClans.map((clan, idx) => (
                <tr key={clan.clanId} className="app-table-row">
                  <td className="px-[9px] py-3 font-semibold text-gray-900">
                    <div className="flex min-w-0 items-center gap-2">
                      <SlotBadge slot={comparatorSlot(idx)} size="sm" />
                      <Link href={`/clans/${clan.clanId}/overview`} className="app-link min-w-0 truncate">
                        [{clan.clanTag}]<span className="hidden md:inline"> {clan.clanName}</span>
                      </Link>
                    </div>
                  </td>
                  <td className="t-num hidden px-[9px] py-3 text-right whitespace-nowrap text-gray-700 sm:table-cell">
                    {formatNumber(clan.performance?.matchCount)}
                  </td>
                  <td className="t-num px-[9px] py-3 text-right font-bold whitespace-nowrap text-gray-900">
                    {formatPercent(clan.performance?.winRate)}
                  </td>
                  <td className="t-num hidden px-[9px] py-3 text-right whitespace-nowrap text-gray-700 sm:table-cell">
                    {formatPercent(clan.performance?.top10Rate)}
                  </td>
                  <td className="t-num px-[9px] py-3 text-right whitespace-nowrap text-gray-700">
                    {formatNumber(clan.performance?.avgDamagePerMatch)}
                  </td>
                  <td className="t-num hidden px-[9px] py-3 text-right whitespace-nowrap text-gray-700 sm:table-cell">
                    {clan.performance?.avgKillsPerMatch?.toFixed(1) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
