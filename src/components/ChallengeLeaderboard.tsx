'use client'

type LeaderboardEntry = {
  rank: number
  memberId: number
  displayName: string
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
                  {entry.displayName}
                  {isMe ? <span className="ml-1 text-xs text-blue-600">(vous)</span> : null}
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
