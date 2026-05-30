import type {
  LeaderboardKillsView,
  PlayerStatsEntry,
} from '@/types/leaderboard'

function getDisplayedKills(entry: PlayerStatsEntry, killsView: LeaderboardKillsView) {
  if (killsView === 'withSolo') {
    return entry.totalKills + entry.soloKills
  }

  return entry.totalKills
}

const BADGE_META = {
  topKiller: '🔫 Top Killer',
  topDamage: '💥 Top Damage',
  bestWinRate: '🏆 Best Win Rate',
  mvp: '💎 MVP',
} as const

function HighlightCard({
  label,
  entry,
  badge,
  value,
}: {
  label: string
  entry: PlayerStatsEntry | null
  badge: string
  value: (e: PlayerStatsEntry) => string
}) {
  return (
    <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {entry ? (
        <>
          <p className="text-base font-bold text-gray-900">{entry.displayName}</p>
          <p className="mt-1 text-sm text-blue-700">{value(entry)}</p>
          <span className="mt-2 inline-block rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
            {badge}
          </span>
        </>
      ) : (
        <p className="text-sm text-gray-500">Aucune donnée</p>
      )}
    </article>
  )
}

interface LeaderboardStatsProps {
  entries: PlayerStatsEntry[]
  killsView: LeaderboardKillsView
}

export default function LeaderboardStats({ entries, killsView }: LeaderboardStatsProps) {
  const withMatches = entries.filter((entry) => entry.matchesPlayed > 0)
  const withMinMatches = entries.filter((entry) => entry.matchesPlayed >= 3)
  const killCandidates = entries.filter((entry) => getDisplayedKills(entry, killsView) > 0)

  const topKiller = killCandidates.reduce<PlayerStatsEntry | null>((best, entry) => {
    if (!best) {
      return entry
    }

    return getDisplayedKills(entry, killsView) > getDisplayedKills(best, killsView) ? entry : best
  }, null)

  const topDamage = withMatches.reduce<PlayerStatsEntry | null>((best, entry) => {
    if (!best) {
      return entry
    }

    return entry.totalDamage > best.totalDamage ? entry : best
  }, null)

  const bestWinRate = withMinMatches.reduce<PlayerStatsEntry | null>((best, entry) => {
    if (!best) {
      return entry
    }

    return entry.winRate > best.winRate ? entry : best
  }, null)

  const maxKills = Math.max(...withMatches.map((entry) => getDisplayedKills(entry, killsView)), 1)
  const maxDamage = Math.max(...withMatches.map((entry) => entry.totalDamage), 1)

  const mvp = withMatches.reduce<PlayerStatsEntry | null>((best, entry) => {
    if (!best) {
      return entry
    }

    const scoreEntry = getDisplayedKills(entry, killsView) / maxKills + entry.totalDamage / maxDamage + entry.winRate
    const scoreBest =
      getDisplayedKills(best, killsView) / maxKills + best.totalDamage / maxDamage + best.winRate

    return scoreEntry > scoreBest ? entry : best
  }, null)

  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Top performers</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HighlightCard
          label="Top Killer"
          badge={BADGE_META.topKiller}
          entry={topKiller}
          value={(e) =>
            killsView === 'withSolo'
              ? `${getDisplayedKills(e, killsView)} kills (avec solo)`
              : `${e.totalKills} kills`
          }
        />
        <HighlightCard
          label="Top Damage"
          badge={BADGE_META.topDamage}
          entry={topDamage}
          value={(e) => `${Math.round(e.totalDamage)} dmg`}
        />
        <HighlightCard
          label="Best Win Rate"
          badge={BADGE_META.bestWinRate}
          entry={bestWinRate}
          value={(e) => `${(e.winRate * 100).toFixed(1)}% (${e.matchesPlayed} matchs)`}
        />
        <HighlightCard
          label="MVP"
          badge={BADGE_META.mvp}
          entry={mvp}
          value={(e) =>
            `${getDisplayedKills(e, killsView)}K / ${Math.round(e.totalDamage)}D / ${(e.winRate * 100).toFixed(0)}%WR`
          }
        />
      </div>
    </section>
  )
}
