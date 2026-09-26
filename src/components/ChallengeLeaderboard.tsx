'use client'

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'

import RankCell from '@/components/ui/RankCell'
import SortableTh from '@/components/ui/SortableTh'

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

export default function ChallengeLeaderboard({ leaderboard, currentMemberId, metric }: Props) {
  if (leaderboard.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-500">
        Aucun participant pour l&apos;instant.
      </p>
    )
  }

  return (
    <div className="app-table-shell overflow-x-auto">
      <table className="w-full table-auto text-[13px]">
        <thead className="app-table-head">
          <tr>
            <SortableTh align="left" className="pl-3">#</SortableTh>
            <SortableTh align="left">Joueur</SortableTh>
            <SortableTh>{metric ?? 'Progression'}</SortableTh>
            <SortableTh className="pr-3">Points</SortableTh>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry) => {
            const isMe = currentMemberId === entry.memberId
            return (
              <tr
                key={entry.memberId}
                className="app-table-row"
                style={isMe ? { backgroundColor: 'var(--theme-ui-accent-soft)' } : undefined}
              >
                <td className="py-2 pl-3 pr-[9px]">
                  <RankCell rank={entry.rank} />
                </td>
                <td className="px-[9px] py-2 text-gray-900">
                  <div className="flex items-center gap-2">
                    <span className="app-avatar flex h-7 w-7 shrink-0">
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
                    <Link href={`/members/${entry.memberId}/dashboard`} className="font-semibold hover:underline">
                      {entry.displayName}
                      {isMe ? <span className="ml-1 text-xs font-medium text-[var(--theme-ui-accent-text)]">(vous)</span> : null}
                    </Link>
                  </div>
                </td>
                <td className="px-[9px] py-2 text-right font-bold tabular-nums text-gray-900">
                  {entry.progress.toLocaleString('fr-FR')}
                </td>
                <td className="py-2 pl-[9px] pr-3 text-right tabular-nums text-gray-700">
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
