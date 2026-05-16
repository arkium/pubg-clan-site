import type { LeaderboardHighlights, PlayerStatsEntry } from '@/types/leaderboard'

const BADGE_LABELS: Record<string, string> = {
  top_killer: '🔫 Top Killer',
  top_damage: '💥 Top Damage',
  best_wr: '🏆 Best Win Rate',
  mvp: '💎 MVP',
}

function HighlightCard({
  label,
  entry,
  value,
}: {
  label: string
  entry: PlayerStatsEntry | null
  value: (e: PlayerStatsEntry) => string
}) {
  return (
    <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {entry ? (
        <>
          <p className="text-base font-bold text-gray-900">{entry.displayName}</p>
          <p className="mt-1 text-sm text-blue-700">{value(entry)}</p>
          {entry.badgeType && BADGE_LABELS[entry.badgeType] ? (
            <span className="mt-2 inline-block rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
              {BADGE_LABELS[entry.badgeType]}
            </span>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-gray-500">Aucune donnée</p>
      )}
    </article>
  )
}

interface LeaderboardStatsProps {
  highlights: LeaderboardHighlights
}

export default function LeaderboardStats({ highlights }: LeaderboardStatsProps) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Top performers</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HighlightCard
          label="Top Killer"
          entry={highlights.topKiller}
          value={(e) => `${e.totalKills} kills`}
        />
        <HighlightCard
          label="Top Damage"
          entry={highlights.topDamage}
          value={(e) => `${Math.round(e.totalDamage)} dmg`}
        />
        <HighlightCard
          label="Best Win Rate"
          entry={highlights.bestWinRate}
          value={(e) => `${(e.winRate * 100).toFixed(1)}% (${e.matchesPlayed} matchs)`}
        />
        <HighlightCard
          label="MVP"
          entry={highlights.mvp}
          value={(e) => `${e.totalKills}K / ${Math.round(e.totalDamage)}D / ${(e.winRate * 100).toFixed(0)}%WR`}
        />
      </div>
    </section>
  )
}
