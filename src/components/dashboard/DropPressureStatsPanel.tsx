'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, Flame, MapPin, Target, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

import SegmentedControl from '@/components/ui/SegmentedControl'
import {
  getDropPressureRankingDisplay,
  sortDropPressureRanking,
} from '@/lib/drop-pressure-ranking'
import type {
  DropPressureDashboardStats,
  DropPressureRankingEntry,
  DropPressureRankingSortKey,
  DropPressureTimelinePoint,
} from '@/types/drop-pressure'

type DropPressureStatsPanelProps = {
  stats: DropPressureDashboardStats | null
  loading?: boolean
  error?: string
  href: string
  periodLabel: string
  ranking?: DropPressureRankingEntry[]
  timeline?: DropPressureTimelinePoint[]
  currentMemberId?: number
}

type TimelineMetric =
  | 'averageNearbyOpponents250m'
  | 'averageNearbyPlayers250m'
  | 'hotDropShare'
  | 'dropCount'

const MEDAL_BY_RANK = {
  1: { iconPath: '/icons/medal-gold.svg', alt: 'Médaille or, rang 1' },
  2: { iconPath: '/icons/medal-silver.svg', alt: 'Médaille argent, rang 2' },
  3: { iconPath: '/icons/medal-bronze.svg', alt: 'Médaille bronze, rang 3' },
} as const

const TIMELINE_METRICS: Array<{ value: TimelineMetric; label: string }> = [
  { value: 'averageNearbyOpponents250m', label: 'Adversaires' },
  { value: 'averageNearbyPlayers250m', label: 'Joueurs proches' },
  { value: 'hotDropShare', label: 'Hot drops (%)' },
  { value: 'dropCount', label: 'Drops' },
]

const TIMELINE_META: Record<TimelineMetric, { color: string; suffix: string }> = {
  averageNearbyOpponents250m: { color: '#f97316', suffix: '' },
  averageNearbyPlayers250m: { color: '#3b82f6', suffix: '' },
  hotDropShare: { color: '#ef4444', suffix: ' %' },
  dropCount: { color: '#06b6d4', suffix: '' },
}

function formatAverage(value: number | null) {
  if (value === null) return 'N/D'
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function timelineValue(point: DropPressureTimelinePoint, metric: TimelineMetric) {
  return point[metric] ?? 0
}

function formatTimelineValue(value: number, metric: TimelineMetric) {
  if (metric === 'dropCount') return Math.round(value).toLocaleString('fr-FR')
  const formatted = value.toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return `${formatted}${TIMELINE_META[metric].suffix}`
}

function DropPressureTimelineChart({
  timeline,
  metric,
}: {
  timeline: DropPressureTimelinePoint[]
  metric: TimelineMetric
}) {
  const values = timeline.map((point) => timelineValue(point, metric))
  const max = Math.max(...values, 1)
  const width = 640
  const height = 150
  const paddingX = 12
  const paddingY = 14
  const points = values.map((value, index) => ({
    x: values.length === 1
      ? width / 2
      : paddingX + (index / (values.length - 1)) * (width - paddingX * 2),
    y: paddingY + (1 - value / max) * (height - paddingY * 2),
  }))
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ')
  const area = points.length > 0
    ? `${path} L${points[points.length - 1]!.x},${height - paddingY} L${points[0]!.x},${height - paddingY} Z`
    : ''
  const latest = values[values.length - 1] ?? 0
  const previous = values[values.length - 2]
  const trend = previous === undefined || latest === previous ? '→' : latest > previous ? '↑' : '↓'
  const color = TIMELINE_META[metric].color
  const metricLabel = TIMELINE_METRICS.find((item) => item.value === metric)?.label ?? metric

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_9rem] lg:items-end">
      <div className="min-w-0">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-36 w-full overflow-visible"
          role="img"
          aria-label={`Évolution de ${metricLabel} sur huit semaines`}
        >
          <path d={area} fill={color} fillOpacity="0.1" />
          <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => (
            <circle
              key={timeline[index]?.period}
              cx={point.x}
              cy={point.y}
              r="4"
              fill="var(--theme-ui-surface)"
              stroke={color}
              strokeWidth="2.5"
            >
              <title>{timeline[index]?.label} : {formatTimelineValue(values[index] ?? 0, metric)}</title>
            </circle>
          ))}
        </svg>
        <div className="mt-1 grid grid-cols-8 text-[11px] text-gray-500">
          {timeline.map((point) => (
            <span key={point.period} className="text-center">{point.label}</span>
          ))}
        </div>
      </div>
      <div className="app-panel-muted rounded-lg px-4 py-3 text-left lg:text-right">
        <p className="text-2xl font-black tabular-nums" style={{ color }}>
          {trend} {formatTimelineValue(latest, metric)}
        </p>
        <p className="text-xs text-gray-500">semaine courante</p>
      </div>
    </div>
  )
}

export default function DropPressureStatsPanel({
  stats,
  loading = false,
  error,
  href,
  periodLabel,
  ranking = [],
  timeline = [],
  currentMemberId,
}: DropPressureStatsPanelProps) {
  const [sortKey, setSortKey] = useState<DropPressureRankingSortKey>('averageNearbyOpponents250m')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [timelineMetric, setTimelineMetric] = useState<TimelineMetric>('averageNearbyOpponents250m')
  const sortedRanking = useMemo(
    () => sortDropPressureRanking(ranking, sortKey, sortDirection),
    [ranking, sortDirection, sortKey]
  )
  const { topEntries, pinnedEntry } = getDropPressureRankingDisplay(
    sortedRanking,
    currentMemberId
  )

  function changeSort(nextSortKey: DropPressureRankingSortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => current === 'desc' ? 'asc' : 'desc')
      return
    }
    setSortKey(nextSortKey)
    setSortDirection('desc')
  }

  function SortIcon({ column }: { column: DropPressureRankingSortKey }) {
    if (sortKey !== column) return <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
    return sortDirection === 'desc'
      ? <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
      : <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
  }

  function renderRankingRow(entry: DropPressureRankingEntry, rank: number, pinned = false) {
    const isCurrentMember = entry.memberId === currentMemberId
    const medal = rank <= 3 ? MEDAL_BY_RANK[rank as 1 | 2 | 3] : null
    const rankClassName =
      rank === 1
        ? 'app-table-row--top1'
        : rank === 2
          ? 'app-table-row--top2'
          : rank === 3
            ? 'app-table-row--top3'
            : ''
    return (
      <tr
        key={`${pinned ? 'pinned-' : ''}${entry.memberId}`}
        className={`app-table-row ${rankClassName} ${isCurrentMember ? 'bg-orange-500/10' : ''}`}
      >
        <td className="px-3 py-3 text-center font-semibold text-gray-700">
          {medal ? (
            <Image
              src={medal.iconPath}
              alt={medal.alt}
              width={24}
              height={24}
              className="mx-auto h-6 w-6"
            />
          ) : rank}
        </td>
        <td className="px-3 py-3 font-medium text-gray-900">
          <div className="flex items-center gap-2">
            <span className="app-avatar flex h-8 w-8 shrink-0 text-xs font-semibold text-gray-700">
              {entry.displayName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 truncate">
              {entry.displayName}
              {isCurrentMember && <span className="ml-2 text-xs font-normal text-orange-500">Vous</span>}
            </span>
          </div>
        </td>
        <td className="px-3 py-3 text-right tabular-nums text-gray-700">{entry.dropCount}</td>
        <td className="px-3 py-3 text-right tabular-nums text-gray-700">{formatAverage(entry.averageNearbyPlayers250m)}</td>
        <td className="px-3 py-3 text-right tabular-nums font-semibold text-gray-900">{formatAverage(entry.averageNearbyOpponents250m)}</td>
        <td className="px-3 py-3 text-right tabular-nums text-gray-700">{entry.maximumNearbyPlayers250m}</td>
        <td className="px-3 py-3 text-right tabular-nums text-gray-700">{entry.hotDropShare.toFixed(1).replace('.', ',')} %</td>
      </tr>
    )
  }

  return (
    <section className="app-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900">Pression au drop</h2>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Joueurs présents dans un rayon de 250 m · {periodLabel}
          </p>
        </div>
        <Link href={href} className="app-btn app-btn--sm app-btn--secondary">
          Voir la carte
        </Link>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-sm text-gray-500">Chargement des statistiques de drop...</p>
      ) : error ? (
        <p className="px-5 py-8 text-sm text-amber-700">{error}</p>
      ) : !stats || stats.dropCount === 0 ? (
        <p className="px-5 py-8 text-sm text-gray-500">
          Aucune pression persistée pour cette période.
        </p>
      ) : (
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Drops analysés', value: stats.dropCount.toLocaleString('fr-FR'), icon: MapPin, tone: 'bg-orange-500/15 text-orange-400' },
            { label: 'Matchs', value: stats.matchCount.toLocaleString('fr-FR'), icon: Target, tone: 'bg-cyan-500/15 text-cyan-400' },
            { label: 'Joueurs proches moy.', value: formatAverage(stats.averageNearbyPlayers250m), icon: Users, tone: 'bg-blue-500/15 text-blue-400' },
            { label: 'Adversaires moy.', value: formatAverage(stats.averageNearbyOpponents250m), icon: Users, tone: 'bg-rose-500/15 text-rose-400' },
            { label: 'Maximum proche', value: stats.maximumNearbyPlayers250m.toLocaleString('fr-FR'), icon: Flame, tone: 'bg-amber-500/15 text-amber-400' },
            { label: 'Hot drops', value: `${stats.hotDropShare.toFixed(1).replace('.', ',')} %`, icon: Flame, tone: 'bg-red-500/15 text-red-400' },
          ].map((item) => {
            const Icon = item.icon
            return (
              <article key={item.label} className="app-panel-muted relative min-w-0 overflow-hidden rounded-2xl px-4 py-3">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent" />
                <div className="relative">
                  <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${item.tone}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="text-2xl font-black leading-none tabular-nums text-gray-900">{item.value}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-gray-500">{item.label}</p>
                </div>
              </article>
            )
          })}
          </div>

          {timeline.length > 0 && (
            <div className="mt-6 border-t border-gray-200 pt-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Évolution sur les 8 dernières semaines
                  </h3>
                  <p className="text-xs text-gray-500">
                    Tendance hebdomadaire issue des drops persistés.
                  </p>
                </div>
                <SegmentedControl
                  options={TIMELINE_METRICS}
                  value={timelineMetric}
                  onChange={setTimelineMetric}
                  size="xs"
                  wrap
                />
              </div>
              <DropPressureTimelineChart timeline={timeline} metric={timelineMetric} />
            </div>
          )}

          {ranking.length > 0 && (
            <div className="mt-6">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Top 5 des joueurs</h3>
                <p className="text-xs text-gray-500">Cliquez sur une colonne pour modifier le classement.</p>
              </div>
              <div className="app-table-shell overflow-x-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="app-table-head text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-3 text-center">Rang</th>
                      <th className="px-3 py-3 text-left">Joueur</th>
                      {[
                        ['dropCount', 'Drops'],
                        ['averageNearbyPlayers250m', 'Proches moy.'],
                        ['averageNearbyOpponents250m', 'Adversaires moy.'],
                        ['maximumNearbyPlayers250m', 'Maximum'],
                        ['hotDropShare', 'Hot drops'],
                      ].map(([column, label]) => (
                        <th key={column} className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => changeSort(column as DropPressureRankingSortKey)}
                            className="ml-auto inline-flex items-center gap-1 whitespace-nowrap font-semibold"
                          >
                            {label}
                            <SortIcon column={column as DropPressureRankingSortKey} />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topEntries.map(({ entry, rank }) => renderRankingRow(entry, rank))}
                    {pinnedEntry && (
                      <>
                        <tr aria-hidden="true">
                          <td colSpan={7} className="border-y border-dashed border-gray-200 px-3 py-1 text-center text-xs text-gray-400">•••</td>
                        </tr>
                        {renderRankingRow(pinnedEntry.entry, pinnedEntry.rank, true)}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}