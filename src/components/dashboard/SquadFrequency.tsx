/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'

import type { SquadFrequencyEntry } from '@/types/dashboard'

interface SquadFrequencyProps {
  squads: SquadFrequencyEntry[]
}

export default function SquadFrequency({ squads }: SquadFrequencyProps) {
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
        <h2 className="text-lg font-semibold text-gray-900">Squads préférés</h2>
        <p className="text-xs text-gray-500">Coéquipiers les plus fréquents</p>
      </div>
      <ul className="divide-y divide-gray-100">
        {squads.map((entry, index) => (
          <li key={entry.memberId} className="flex items-center justify-between gap-3 px-4 py-3">
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
              <p className="text-sm font-semibold text-gray-900">{entry.totalKills} kills</p>
              <p className="text-xs text-gray-500">
                {(entry.winRate * 100).toFixed(0)}% win rate ensemble
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
