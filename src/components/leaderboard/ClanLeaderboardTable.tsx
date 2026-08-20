'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Crown, Swords, Target, Activity } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import SegmentedControl from '@/components/ui/SegmentedControl'
import type { ClanLeaderboardEntry } from '@/app/api/clans-leaderboard/route'
import type { LeaderboardPeriod } from '@/types/leaderboard'

export type SortBy = 'powerScore' | 'activeMembers' | 'winRate' | 'avgDamage' | 'avgKills'

const MEDAL_BY_RANK = {
  1: { iconPath: '/icons/medal-gold.svg', alt: 'Médaille or, rang 1' },
  2: { iconPath: '/icons/medal-silver.svg', alt: 'Médaille argent, rang 2' },
  3: { iconPath: '/icons/medal-bronze.svg', alt: 'Médaille bronze, rang 3' },
} as const

const COLUMNS: { key: SortBy; label: string; align: 'center' | 'right' }[] = [
  { key: 'activeMembers', label: 'Effectif Actif', align: 'center' },
  { key: 'powerScore', label: 'Power Score', align: 'right' },
  { key: 'winRate', label: 'Win Rate', align: 'right' },
  { key: 'avgDamage', label: 'Dégâts moy.', align: 'right' },
  { key: 'avgKills', label: 'Kills moy.', align: 'right' },
]

function PodiumPosition({ 
  entry, 
  position,
  sortBy
}: { 
  entry: ClanLeaderboardEntry
  position: 1 | 2 | 3 
  sortBy: SortBy
}) {
  const heightClass = position === 1 ? 'h-40' : position === 2 ? 'h-32' : 'h-24'
  const colorClass = position === 1
    ? 'from-amber-500/80 to-amber-900/40 border-amber-400/80 text-amber-400'
    : position === 2
    ? 'from-slate-300/80 to-slate-700/40 border-slate-300/80 text-slate-300'
    : 'from-amber-700/80 to-amber-950/40 border-amber-600/80 text-amber-600' // bronze
  const metricTextClass = position === 1 ? 'text-amber-400' : position === 2 ? 'text-slate-300' : 'text-amber-600'

  const delayClass = position === 1 ? 'delay-100' : position === 2 ? 'delay-200' : 'delay-300'

  let metricLabel = ''
  if (sortBy === 'powerScore') metricLabel = `${Math.round(entry.powerScore)} pts`
  else if (sortBy === 'activeMembers') metricLabel = `${entry.activeMembers} actifs`
  else if (sortBy === 'winRate') metricLabel = `${(entry.winRate * 100).toFixed(1)}% WR`
  else if (sortBy === 'avgDamage') metricLabel = `${Math.round(entry.avgDamage)} dégâts`
  else if (sortBy === 'avgKills') metricLabel = `${entry.avgKills.toFixed(1)} kills`

  return (
    <div className={`flex flex-col items-center justify-end flex-1 max-w-36 animate-in fade-in slide-in-from-bottom-8 duration-700 ${delayClass}`}>
      <div className="mb-4 text-center z-10">
        <Link
          href={`/clans/${entry.clanId}/stats`}
          className="text-lg font-bold leading-tight hover:underline"
        >
          {entry.name}
        </Link>
        <div className="text-sm opacity-80 font-mono">[{entry.tag}]</div>
        <div className={`text-base font-black mt-1.5 bg-black/40 px-2.5 py-1 rounded-full inline-block backdrop-blur-sm whitespace-nowrap ${metricTextClass}`}>
          {metricLabel}
        </div>
      </div>
      <div className={`w-full ${heightClass} rounded-xl bg-gradient-to-t ${colorClass} border relative shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col items-center justify-end pb-4`}>
        {position === 1 && (
          <Crown className="absolute top-3 w-8 h-8 text-amber-200 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
        )}
        <span className="text-4xl font-black opacity-40 select-none">
          {position}
        </span>
      </div>
    </div>
  )
}

function ClanPodium({ topClans, sortBy }: { topClans: ClanLeaderboardEntry[], sortBy: SortBy }) {
  if (topClans.length < 3) return null

  // Reorder for podium: 2, 1, 3
  const [first, second, third] = topClans
  
  return (
    <div className="flex justify-center items-end gap-2 md:gap-6">
      <PodiumPosition entry={second} position={2} sortBy={sortBy} />
      <PodiumPosition entry={first} position={1} sortBy={sortBy} />
      <PodiumPosition entry={third} position={3} sortBy={sortBy} />
    </div>
  )
}

export function ClanLeaderboardTable({
  entries,
  period,
  periodOptions,
  onPeriodChange,
}: {
  entries: ClanLeaderboardEntry[]
  period?: LeaderboardPeriod
  periodOptions?: { value: LeaderboardPeriod; label: string }[]
  onPeriodChange?: (period: LeaderboardPeriod) => void
}) {
  const [sortBy, setSortBy] = useState<SortBy>('powerScore')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  if (!entries || entries.length === 0) {
    return <div className="text-center py-12 text-gray-500">Aucun clan trouvé.</div>
  }

  const directionSign = sortDirection === 'desc' ? -1 : 1
  const sortedEntries = [...entries].sort((a, b) => (a[sortBy] - b[sortBy]) * directionSign)
    .map((entry, index) => ({
      ...entry,
      displayRank: index + 1,
    }))

  const top3 = sortedEntries.slice(0, 3)

  function changeSort(nextSortBy: SortBy) {
    if (sortBy === nextSortBy) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortBy(nextSortBy)
    setSortDirection('desc')
  }

  function SortIcon({ column }: { column: SortBy }) {
    if (sortBy !== column) return <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
    return sortDirection === 'desc'
      ? <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
      : <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <section className="app-panel p-4 sm:p-6">
        <ClanPodium topClans={top3} sortBy={sortBy} />
      </section>

      <section className="app-panel overflow-hidden">
        <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--theme-ui-text)]">Classement détaillé</h2>
            <p className="text-xs text-gray-500">Cliquez sur une colonne pour modifier le classement.</p>
          </div>
          {periodOptions && period && onPeriodChange ? (
            <div className="shrink-0">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:text-right">Période</p>
              <SegmentedControl
                options={periodOptions}
                value={period}
                onChange={onPeriodChange}
                size="sm"
                fullWidthOnMobile
                className="w-full sm:w-auto"
              />
            </div>
          ) : null}
        </div>
        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
        <div className="app-table-shell overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="app-table-head text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-3 text-center">Rang</th>
                <th className="px-3 py-3 text-left">Clan</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className={`px-3 py-3 ${col.align === 'center' ? 'text-center' : 'text-right'}`}>
                    <button
                      type="button"
                      onClick={() => changeSort(col.key)}
                      className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${col.align === 'center' ? 'mx-auto' : 'ml-auto'}`}
                    >
                      {col.label}
                      <SortIcon column={col.key} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry) => {
                const rank = entry.displayRank
                const medal = rank <= 3 ? MEDAL_BY_RANK[rank as 1 | 2 | 3] : null
                const rankClassName =
                  rank === 1 ? 'app-table-row--top1' : rank === 2 ? 'app-table-row--top2' : rank === 3 ? 'app-table-row--top3' : ''

                return (
                  <tr key={entry.clanId} className={`app-table-row ${rankClassName}`}>
                    <td className="px-3 py-3 text-center font-semibold text-gray-700">
                      {medal ? (
                        <Image src={medal.iconPath} alt={medal.alt} width={24} height={24} className="mx-auto h-6 w-6" />
                      ) : rank}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/clans/${entry.clanId}/overview`}
                        className="font-bold text-gray-900 hover:text-emerald-500 transition-colors flex flex-col"
                      >
                        <span>{entry.name}</span>
                        <span className="text-xs font-mono text-gray-500">[{entry.tag}]</span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-md">
                        <Activity className="w-3.5 h-3.5 text-blue-500" />
                        <span className={sortBy === 'activeMembers' ? 'text-gray-900 font-bold' : 'text-gray-700'}>{entry.activeMembers}</span>
                      </div>
                    </td>
                    <td className={`px-3 py-3 text-right font-black ${sortBy === 'powerScore' ? 'text-amber-500' : 'text-gray-700'}`}>
                      {Math.round(entry.powerScore)}
                    </td>
                    <td className={`px-3 py-3 text-right text-gray-700 ${sortBy === 'winRate' ? 'text-gray-900 font-bold' : ''}`}>
                      {(entry.winRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      <div className={`flex items-center justify-end gap-1.5 ${sortBy === 'avgDamage' ? 'text-gray-900 font-bold' : 'text-gray-700'}`}>
                        <Target className="w-3.5 h-3.5 text-rose-500" />
                        {Math.round(entry.avgDamage)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      <div className={`flex items-center justify-end gap-1.5 ${sortBy === 'avgKills' ? 'text-gray-900 font-bold' : 'text-gray-700'}`}>
                        <Swords className="w-3.5 h-3.5 text-gray-500" />
                        {entry.avgKills.toFixed(1)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </div>
      </section>

      <section className="app-panel-muted p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-[var(--theme-ui-text)]">Comment le Power Score est calculé</h3>
        <p className="mt-1 text-xs text-gray-500">
          Un score composite qui combine trois indicateurs de performance sur la période sélectionnée :
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-100 px-3 py-2 text-xs">
            <span className="font-bold text-gray-900">Win Rate × 100</span>
            <p className="mt-0.5 text-gray-500">Taux de victoire du clan</p>
          </div>
          <div className="rounded-lg bg-gray-100 px-3 py-2 text-xs">
            <span className="font-bold text-gray-900">+ Dégâts moy.</span>
            <p className="mt-0.5 text-gray-500">Dégâts infligés par match</p>
          </div>
          <div className="rounded-lg bg-gray-100 px-3 py-2 text-xs">
            <span className="font-bold text-gray-900">+ Kills moy. × 10</span>
            <p className="mt-0.5 text-gray-500">Kills par match</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Plus un clan gagne, inflige de dégâts et élimine d&apos;adversaires en moyenne, plus son Power Score est élevé.
        </p>
      </section>
    </div>
  )
}
