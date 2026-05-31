/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useMemo, useState } from 'react'

import type { SquadFrequencyEntry } from '@/types/dashboard'
import SegmentedControl from '@/components/ui/SegmentedControl'

interface SquadFrequencyProps {
  squads: SquadFrequencyEntry[]
}

type SquadSortKey = 'matches' | 'kills' | 'winRate'

function getWinRateTone(winRate: number) {
  if (winRate >= 0.4) {
    return 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
  }

  if (winRate >= 0.25) {
    return 'border-teal-400/40 bg-teal-500/15 text-teal-200'
  }

  if (winRate >= 0.1) {
    return 'border-amber-400/40 bg-amber-500/15 text-amber-200'
  }

  return 'border-slate-400/35 bg-slate-500/10 text-slate-300'
}

export default function SquadFrequency({ squads }: SquadFrequencyProps) {
  const [sortBy, setSortBy] = useState<SquadSortKey>('matches')
  const bestWinRate = squads.reduce((best, entry) => Math.max(best, entry.winRate), 0)

  const sortedSquads = useMemo(() => {
    const items = [...squads]

    items.sort((a, b) => {
      if (sortBy === 'kills') {
        if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills
        if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount
      } else if (sortBy === 'winRate') {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate
        if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount
      } else {
        if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount
        if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills
      }

      return a.displayName.localeCompare(b.displayName, 'fr')
    })

    return items
  }, [squads, sortBy])

  if (squads.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Squads préférés</h2>
        <p className="text-sm text-gray-500">
          Aucune donnée de squad disponible. Jouez des parties en équipe pour voir vos partenaires
          fréquents.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Squads préférés</h2>
            <p className="text-xs text-gray-500">Coéquipiers les plus fréquents</p>
          </div>
          <SegmentedControl
            options={[
              { value: 'matches', label: 'Matchs' },
              { value: 'kills', label: 'Kills' },
              { value: 'winRate', label: 'Win Rate' },
            ]}
            value={sortBy}
            onChange={setSortBy}
            size="xs"
          />
        </div>
      </div>
      <ul>
        {sortedSquads.map((entry, index) => {
          const winRatePercent = (entry.winRate * 100).toFixed(0)
          const isBestWinRate =
            bestWinRate > 0 && Math.abs(entry.winRate - bestWinRate) < Number.EPSILON * 10

          return (
            <li
              key={entry.memberId}
              className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 first:border-t-0"
            >
              <div className="flex items-center gap-3">
                <span className="app-avatar flex h-7 w-7 shrink-0 text-xs font-bold" style={{ backgroundColor: `hsl(${(index * 47) % 360}, 60%, 55%)` }}>
                  {entry.avatarUrl ? (
                    <img
                      src={entry.avatarUrl}
                      alt={entry.displayName + ' avatar'}
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    entry.displayName.charAt(0).toUpperCase()
                  )}
                </span>
                <div>
                  <Link
                    href={`/members/${entry.memberId}/dashboard`}
                    className="text-sm font-medium text-blue-700 hover:underline"
                  >
                    {entry.displayName}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {entry.matchCount} match{entry.matchCount > 1 ? 's' : ''} ensemble
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{entry.totalKills} kills ensemble</p>
                <p
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${getWinRateTone(entry.winRate)}`}
                >
                  {isBestWinRate ? <span aria-hidden="true">🏆</span> : null}
                  <span>{winRatePercent}% win rate ensemble</span>
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
