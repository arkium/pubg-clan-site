import Image from 'next/image'
import Link from 'next/link'

import { DISTINCTION_BADGE_META, type DistinctionBadgeKey } from '@/lib/distinction-badges'
import type {
  PlayerStatsEntry,
} from '@/types/leaderboard'

function HighlightCard({
  label,
  entry,
  badgeKey,
  value,
}: {
  label: string
  entry: PlayerStatsEntry | null
  badgeKey: DistinctionBadgeKey
  value: (e: PlayerStatsEntry) => string
}) {
  const badgeMeta = DISTINCTION_BADGE_META[badgeKey]

  return (
    <article className="flex h-full flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {entry ? (
        <div className="flex flex-1 flex-col items-center gap-1.5 text-center sm:items-start sm:text-left">
          <Link href={`/members/${entry.memberId}/dashboard`} className="text-base leading-5 font-bold text-gray-900 hover:text-emerald-500 transition-colors">
            {entry.displayName}
          </Link>
          <p className="text-sm leading-5 text-blue-700">{value(entry)}</p>
          <span className="app-performer-pill app-performer-pill--award mt-auto self-center sm:self-start">
            <Image src={badgeMeta.iconPath} alt={badgeMeta.label} width={20} height={20} className="app-performer-pill__icon" />
            <span>{badgeMeta.label}</span>
          </span>
        </div>
      ) : (
        <p className="text-center text-sm leading-5 text-gray-500 sm:text-left">Aucune donnée</p>
      )}
    </article>
  )
}

interface LeaderboardStatsProps {
  entries: PlayerStatsEntry[]
}

export default function LeaderboardStats({ entries }: LeaderboardStatsProps) {
  const withMatches = entries.filter((entry) => entry.matchesPlayed > 0)
  const withMinMatches = entries.filter((entry) => entry.matchesPlayed >= 3)
  const kpmCandidates = withMinMatches.length > 0 ? withMinMatches : withMatches
  const killCandidates = entries.filter((entry) => entry.totalKills > 0)

  const topKiller = killCandidates.reduce<PlayerStatsEntry | null>((best, entry) => {
    if (!best) {
      return entry
    }

    return entry.totalKills > best.totalKills ? entry : best
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

  const maxKills = Math.max(...withMatches.map((entry) => entry.totalKills), 1)
  const maxDamage = Math.max(...withMatches.map((entry) => entry.totalDamage), 1)

  const mvp = withMatches.reduce<PlayerStatsEntry | null>((best, entry) => {
    if (!best) {
      return entry
    }

    const scoreEntry = entry.totalKills / maxKills + entry.totalDamage / maxDamage + entry.winRate
    const scoreBest = best.totalKills / maxKills + best.totalDamage / maxDamage + best.winRate

    return scoreEntry > scoreBest ? entry : best
  }, null)

  const bestKpm = kpmCandidates.reduce<PlayerStatsEntry | null>((best, entry) => {
    if (!best) {
      return entry
    }

    const currentRatio = entry.matchesPlayed > 0 ? entry.totalKills / entry.matchesPlayed : 0
    const bestRatio = best.matchesPlayed > 0 ? best.totalKills / best.matchesPlayed : 0

    return currentRatio > bestRatio ? entry : best
  }, null)

  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Top performers</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <HighlightCard
          label="Top Killer"
          badgeKey="top_killer"
          entry={topKiller}
          value={(e) => `${e.totalKills} kills`}
        />
        <HighlightCard
          label="Top Damage"
          badgeKey="top_damage"
          entry={topDamage}
          value={(e) => `${Math.round(e.totalDamage)} dmg`}
        />
        <HighlightCard
          label="Best Win Rate"
          badgeKey="best_wr"
          entry={bestWinRate}
          value={(e) => `${(e.winRate * 100).toFixed(1)}% (${e.matchesPlayed} matchs)`}
        />
        <HighlightCard
          label="MVP"
          badgeKey="mvp"
          entry={mvp}
          value={(e) =>
            `${e.totalKills}K / ${Math.round(e.totalDamage)}D / ${(e.winRate * 100).toFixed(0)}%WR`
          }
        />
        <HighlightCard
          label="TOP Kills/Matchs"
          badgeKey="best_kpm"
          entry={bestKpm}
          value={(e) => {
            const ratio = e.matchesPlayed > 0 ? e.totalKills / e.matchesPlayed : 0
            return `${ratio.toLocaleString('fr-FR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} K/M`
          }}
        />
      </div>
    </section>
  )
}
