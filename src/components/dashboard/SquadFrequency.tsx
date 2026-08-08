/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Clock3 } from 'lucide-react'

import type { SquadFrequencyEntry } from '@/types/dashboard'
import SegmentedControl from '@/components/ui/SegmentedControl'

interface SquadFrequencyProps {
  squads: SquadFrequencyEntry[]
}

type SquadSortKey = 'matches' | 'kills' | 'playTime'

function formatPlayTime(seconds: number) {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes} min ensemble`
  return `${hours} h ${String(minutes).padStart(2, '0')} ensemble`
}

export default function SquadFrequency({ squads }: SquadFrequencyProps) {
  const [sortBy, setSortBy] = useState<SquadSortKey>('matches')

  const sortedSquads = useMemo(() => {
    const items = [...squads]

    items.sort((a, b) => {
      if (sortBy === 'kills') {
        if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills
        if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount
      } else if (sortBy === 'playTime') {
        if (b.sharedPlayTimeSeconds !== a.sharedPlayTimeSeconds) {
          return b.sharedPlayTimeSeconds - a.sharedPlayTimeSeconds
        }
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
              { value: 'playTime', label: 'Temps' },
            ]}
            value={sortBy}
            onChange={setSortBy}
            size="xs"
          />
        </div>
      </div>
      <ul>
        {sortedSquads.slice(0, 10).map((entry, index) => {
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
                  className="inline-flex items-center gap-1 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-700"
                >
                  <Clock3 className="h-3 w-3" aria-hidden="true" />
                  <span>{formatPlayTime(entry.sharedPlayTimeSeconds)}</span>
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
