'use client'

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'

type LeaderboardEntry = {
  rank: number
  memberId: number
  displayName: string
  avatarUrl?: string | null
  progress: number
  reward: number
}

type Props = {
  leaderboard: LeaderboardEntry[]
  currentMemberId?: number
  metric?: string
}

const MEDAL: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
}

export default function ChallengeLeaderboard({ leaderboard, currentMemberId, metric }: Props) {
  if (leaderboard.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-500">
        Aucun participant pour l&apos;instant.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Rang</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Joueur</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700">
              {metric ?? 'Progression'}
            </th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {leaderboard.map((entry) => {
            const isMe = currentMemberId === entry.memberId
            return (
              <tr
                key={entry.memberId}
                className={isMe ? 'bg-blue-50' : 'hover:bg-gray-50'}
              >
                <td className="px-4 py-2 font-medium text-gray-900">
                  {MEDAL[entry.rank] ?? `#${entry.rank}`}
                </td>
                <td className="px-4 py-2 text-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="app-avatar flex h-8 w-8 shrink-0">
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
                        <span className="text-xs font-semibold text-gray-700">
                          {entry.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <Link href={`/members/${entry.memberId}/dashboard`} className="hover:text-emerald-500 transition-colors">
                      {entry.displayName}
                      {isMe ? <span className="ml-1 text-xs text-blue-600">(vous)</span> : null}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-2 text-right font-medium text-gray-900">
                  {entry.progress.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right text-gray-700">
                  {entry.reward > 0 ? (
                    <span className="font-medium text-yellow-600">+{entry.reward} pts</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
