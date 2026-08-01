'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, Flame, MapPin, Target, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

import { sortDropPressureRanking } from '@/lib/drop-pressure-ranking'
import type {
  DropPressureDashboardStats,
  DropPressureRankingEntry,
  DropPressureRankingSortKey,
} from '@/types/drop-pressure'

type DropPressureStatsPanelProps = {
  stats: DropPressureDashboardStats | null
  loading?: boolean
  error?: string
  href: string
  periodLabel: string
  ranking?: DropPressureRankingEntry[]
  currentMemberId?: number
}

const MEDAL_BY_RANK = {
  1: { iconPath: '/icons/medal-gold.svg', alt: 'Médaille or, rang 1' },
  2: { iconPath: '/icons/medal-silver.svg', alt: 'Médaille argent, rang 2' },
  3: { iconPath: '/icons/medal-bronze.svg', alt: 'Médaille bronze, rang 3' },
} as const

function formatAverage(value: number | null) {
  if (value === null) return 'N/D'
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export default function DropPressureStatsPanel({
  stats,
  loading = false,
  error,
  href,
  periodLabel,
  ranking = [],
  currentMemberId,
}: DropPressureStatsPanelProps) {
  const [sortKey, setSortKey] = useState<DropPressureRankingSortKey>('averageNearbyOpponents250m')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const sortedRanking = useMemo(
    () => sortDropPressureRanking(ranking, sortKey, sortDirection),
    [ranking, sortDirection, sortKey]
  )
  const topFive = sortedRanking.slice(0, 5)
  const currentMemberIndex = currentMemberId
    ? sortedRanking.findIndex((entry) => entry.memberId === currentMemberId)
    : -1
  const currentMemberOutsideTop = currentMemberIndex >= 5
    ? sortedRanking[currentMemberIndex]
    : null

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
                    {topFive.map((entry, index) => renderRankingRow(entry, index + 1))}
                    {currentMemberOutsideTop && (
                      <>
                        <tr aria-hidden="true">
                          <td colSpan={7} className="border-y border-dashed border-gray-200 px-3 py-1 text-center text-xs text-gray-400">•••</td>
                        </tr>
                        {renderRankingRow(currentMemberOutsideTop, currentMemberIndex + 1, true)}
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