'use client'

import { useMemo, useState } from 'react'

import type { ReportPlayerStats } from '@/types/reports'

type SortKey = 'kills' | 'damage' | 'matches' | 'assists' | 'winRate'

const SORT_LABELS: Record<SortKey, string> = {
  kills: 'Kills',
  damage: 'Damage',
  matches: 'Matches',
  assists: 'Assists',
  winRate: 'Win Rate',
}

function getProgressColor(value: number) {
  if (value > 0) return 'text-green-600'
  if (value < 0) return 'text-red-500'
  return 'text-gray-500'
}

function getProgressSymbol(value: number) {
  if (value > 0) return '↑'
  if (value < 0) return '↓'
  return '→'
}

export default function ReportStats({ players }: { players: ReportPlayerStats[] }) {
  const [sortBy, setSortBy] = useState<SortKey>('kills')

  const sortedPlayers = useMemo(() => {
    return [...players].sort((left, right) => {
      switch (sortBy) {
        case 'damage':
          return right.damage - left.damage
        case 'matches':
          return right.matches - left.matches
        case 'assists':
          return right.assists - left.assists
        case 'winRate':
          return right.winRate - left.winRate
        default:
          return right.kills - left.kills
      }
    })
  }, [players, sortBy])

  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Stats détaillées</h2>
        <div className="flex rounded border border-gray-200 p-1">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortBy(key)}
              className={`rounded px-3 py-1 text-xs font-medium ${
                key === sortBy ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {SORT_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {sortedPlayers.length === 0 ? (
        <p className="text-sm text-gray-600">Aucune statistique joueur sur cette période.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Joueur</th>
                <th className="px-4 py-3 text-right">Matches</th>
                <th className="px-4 py-3 text-right">Kills</th>
                <th className="px-4 py-3 text-right">Damage</th>
                <th className="px-4 py-3 text-right">Assists</th>
                <th className="px-4 py-3 text-right">Win Rate</th>
                <th className="px-4 py-3 text-right">Progression</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedPlayers.map((player) => (
                <tr key={player.memberId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border">
                        {player.avatarUrl ? (
                          <img
                            src={player.avatarUrl}
                            alt={player.displayName + ' avatar'}
                            className="w-8 h-8 object-cover rounded-full"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : (
                          <span className="text-xs font-semibold text-gray-700">{player.displayName.charAt(0).toUpperCase()}</span>
                        )}
                      </span>
                      <span>{player.displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{player.matches}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{player.kills}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{Math.round(player.damage)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{player.assists}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {(player.winRate * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${getProgressColor(player.progression.kills)}`}>
                      {getProgressSymbol(player.progression.kills)} {player.progression.kills}
                    </span>
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
