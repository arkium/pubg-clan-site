import type { LeaderboardSortBy, PlayerStatsEntry } from '@/types/leaderboard'

const RANK_MEDALS: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
}

const BADGE_ICONS: Record<string, string> = {
  top_killer: '🔫',
  top_damage: '💥',
  best_wr: '🏆',
  mvp: '💎',
}

const SORT_LABELS: Record<LeaderboardSortBy, string> = {
  kills: 'Kills',
  damage: 'Damage',
  winRate: 'Win Rate',
  matches: 'Matchs',
}

function formatSortValue(entry: PlayerStatsEntry, sortBy: LeaderboardSortBy): string {
  switch (sortBy) {
    case 'damage':
      return `${Math.round(entry.totalDamage)} dmg`
    case 'winRate':
      return `${(entry.winRate * 100).toFixed(1)}%`
    case 'matches':
      return `${entry.matchesPlayed} matchs`
    default:
      return `${entry.totalKills} kills`
  }
}

interface LeaderboardProps {
  entries: PlayerStatsEntry[]
  sortBy: LeaderboardSortBy
  onSortChange: (sortBy: LeaderboardSortBy) => void
}

export default function Leaderboard({ entries, sortBy, onSortChange }: LeaderboardProps) {
  const sortOptions: LeaderboardSortBy[] = ['kills', 'damage', 'winRate', 'matches']

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Classement</h2>
        <div className="flex rounded border border-gray-200 p-1">
          {sortOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSortChange(option)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                option === sortBy
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {SORT_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-600">
            Aucune donnée disponible. Les stats sont calculées automatiquement chaque nuit.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Rang</th>
                <th className="px-4 py-3 text-left">Joueur</th>
                <th className="px-4 py-3 text-right">Kills</th>
                <th className="px-4 py-3 text-right">Damage</th>
                <th className="px-4 py-3 text-right">Win Rate</th>
                <th className="px-4 py-3 text-right">Matchs</th>
                <th className="px-4 py-3 text-center">Badge</th>
                <th className="px-4 py-3 text-right">{SORT_LABELS[sortBy]}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry, index) => {
                const rank = index + 1
                const medal = RANK_MEDALS[rank]
                const badgeIcon = entry.badgeType ? BADGE_ICONS[entry.badgeType] : null

                return (
                  <tr
                    key={entry.id}
                    className={rank <= 3 ? 'bg-yellow-50/30' : 'hover:bg-gray-50'}
                  >
                    <td className="px-4 py-3 font-semibold text-gray-700">
                      {medal ?? rank}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {entry.displayName}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{entry.totalKills}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {Math.round(entry.totalDamage)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {(entry.winRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{entry.matchesPlayed}</td>
                    <td className="px-4 py-3 text-center">
                      {badgeIcon ? (
                        <span title={entry.badgeType ?? ''} className="text-base">
                          {badgeIcon}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">
                      {formatSortValue(entry, sortBy)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
