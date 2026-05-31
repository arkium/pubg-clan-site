/* eslint-disable @next/next/no-img-element */

import Image from 'next/image'

import { DISTINCTION_BADGE_META, isDistinctionBadgeKey, type DistinctionBadgeKey } from '@/lib/distinction-badges'
import SegmentedControl from '@/components/ui/SegmentedControl'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import type {
  LeaderboardKillsView,
  LeaderboardSortBy,
  PlayerStatsEntry,
  WeeklyProgression,
} from '@/types/leaderboard'

const RANK_MEDALS: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
}

const SORT_OPTIONS: Array<{ value: LeaderboardSortBy; label: string }> = [
  { value: 'kills', label: 'Kills' },
  { value: 'kpm', label: 'K/M' },
  { value: 'damage', label: 'Damage' },
  { value: 'winRate', label: 'Win Rate' },
  { value: 'matches', label: 'Matchs' },
]

interface LeaderboardProps {
  entries: PlayerStatsEntry[]
  progression?: WeeklyProgression[]
  sortBy: LeaderboardSortBy
  killsView: LeaderboardKillsView
  onSortChange: (sortBy: LeaderboardSortBy) => void
  showPerformanceDelta?: boolean
}

export default function Leaderboard({
  entries,
  progression = [],
  sortBy,
  killsView,
  onSortChange,
  showPerformanceDelta = true,
}: LeaderboardProps) {
  const progressionByMember = new Map<number, WeeklyProgression['weeklyStats']>(
    progression.map((item) => [item.memberId, item.weeklyStats])
  )

  function getProgressionDelta(memberId: number) {
    const weeklyStats = progressionByMember.get(memberId)
    if (!weeklyStats || weeklyStats.length < 2) {
      return null
    }

    const current = weeklyStats[weeklyStats.length - 1]
    const previous = weeklyStats[weeklyStats.length - 2]

    return {
      kills: current.totalKills - previous.totalKills,
      winner: current.matchesWon - previous.matchesWon,
      winRate: (current.winRate - previous.winRate) * 100,
      matches: current.matchesPlayed - previous.matchesPlayed,
      damage: Math.round(current.totalDamage - previous.totalDamage),
    }
  }

  function getTrend(delta: number | null) {
    if (delta === null) {
      return { symbol: '•', tone: 'text-gray-400' }
    }

    if (delta > 0) {
      return { symbol: '↑', tone: 'text-emerald-600' }
    }

    if (delta < 0) {
      return { symbol: '↓', tone: 'text-rose-600' }
    }

    return { symbol: '→', tone: 'text-gray-500' }
  }

  function formatDeltaMagnitude(delta: number | null, decimals = 0) {
    if (delta === null) {
      return ''
    }

    const magnitude = Math.abs(delta)
    if (decimals > 0) {
      return magnitude.toFixed(decimals)
    }

    return String(Math.round(magnitude))
  }

  function renderValueWithTrend(value: string, delta: number | null, decimals = 0) {
    if (!showPerformanceDelta) {
      return <span className="block w-full text-right font-semibold text-gray-900 tabular-nums">{value}</span>
    }

    const trend = getTrend(delta)

    return (
      <span className="inline-flex max-w-full flex-col items-end text-right leading-tight tabular-nums">
        <span className="block w-full text-right font-semibold text-gray-900">{value}</span>
        <span className={`mt-0.5 block w-full text-right text-xs font-semibold ${trend.tone}`}>
          {delta === null ? '•' : `${trend.symbol}${formatDeltaMagnitude(delta, decimals)}`}
        </span>
      </span>
    )
  }

  function getDisplayedSoloClanKills(entry: PlayerStatsEntry) {
    return killsView === 'withSolo' ? entry.soloKills : 0
  }

  function formatKillsPerMatch(entry: PlayerStatsEntry) {
    return entry.avgKillsPerGame.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const totals = entries.reduce(
    (acc, entry) => {
      acc.kills += entry.totalKills
      acc.matches += entry.matchesPlayed
      acc.damage += Math.round(entry.totalDamage)
      acc.winner += entry.matchesWon
      acc.solo += getDisplayedSoloClanKills(entry)
      acc.duo += entry.duoClanKills
      acc.trio += entry.trioClanKills
      acc.squad += entry.squadClanKills
      return acc
    },
    {
      kills: 0,
      matches: 0,
      damage: 0,
      winner: 0,
      solo: 0,
      duo: 0,
      trio: 0,
      squad: 0,
    }
  )

  const totalKpm = totals.matches > 0 ? totals.kills / totals.matches : 0
  const totalWinRate = totals.matches > 0 ? (totals.winner / totals.matches) * 100 : 0

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

  const performerBadgeKeysByMemberId = new Map<number, DistinctionBadgeKey[]>()
  const performerAssignments: Array<{ entry: PlayerStatsEntry | null; badgeKey: DistinctionBadgeKey }> = [
    { entry: topKiller, badgeKey: 'top_killer' },
    { entry: topDamage, badgeKey: 'top_damage' },
    { entry: bestWinRate, badgeKey: 'best_wr' },
    { entry: mvp, badgeKey: 'mvp' },
    { entry: bestKpm, badgeKey: 'best_kpm' },
  ]

  for (const assignment of performerAssignments) {
    if (!assignment.entry) {
      continue
    }

    const current = performerBadgeKeysByMemberId.get(assignment.entry.memberId) ?? []
    performerBadgeKeysByMemberId.set(assignment.entry.memberId, [...current, assignment.badgeKey])
  }

  function getRowBadgeKeys(entry: PlayerStatsEntry): DistinctionBadgeKey[] {
    const computedBadges = performerBadgeKeysByMemberId.get(entry.memberId)
    if (computedBadges && computedBadges.length > 0) {
      return computedBadges
    }

    if (isDistinctionBadgeKey(entry.badgeType)) {
      return [entry.badgeType]
    }

    return []
  }

  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Classement</h2>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            options={SORT_OPTIONS}
            value={sortBy}
            onChange={onSortChange}
            size="sm"
            fullWidthOnMobile
            className="w-full sm:w-auto"
          />
        </div>
      </div>

      <p className="mb-3 text-xs text-gray-500">
        Ce tableau est recalculé selon la période sélectionnée, triable via le toggle, avec le détail des éliminations par mode (Solo, Duo, Trio, Squad).
      </p>

      {entries.length === 0 ? (
        <div className="rounded border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-600">
            Aucune donnée disponible pour cette période. Le leaderboard est recalculé à la volée à partir des matchs importés.
          </p>
        </div>
      ) : (
        <div>
          <div className="space-y-3 md:hidden">
            {entries.map((entry, index) => {
              const rank = index + 1
              const medal = RANK_MEDALS[rank]
              const badgeKeys = getRowBadgeKeys(entry)
              const delta = getProgressionDelta(entry.memberId)

              return (
                <article
                  key={entry.id}
                  className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${
                    rank <= 3 ? 'ring-1 ring-yellow-200' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700">{medal ?? `#${rank}`}</span>
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
                      <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-gray-900">
                        <span className="truncate">{entry.displayName}</span>
                        {badgeKeys.length > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            {badgeKeys.map((badgeKey) => {
                              const badgeMeta = DISTINCTION_BADGE_META[badgeKey]

                              return (
                                <span
                                  key={`${entry.id}-${badgeKey}`}
                                  title={badgeMeta.label}
                                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
                                  aria-label={badgeMeta.label}
                                >
                                  <Image src={badgeMeta.iconPath} alt={badgeMeta.label} width={20} height={20} />
                                </span>
                              )
                            })}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">KILLS</p>
                      <div className="mt-auto flex justify-end text-sm text-gray-900">
                        {renderValueWithTrend(String(entry.totalKills), delta?.kills ?? null)}
                      </div>
                    </div>
                    <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">MATCHS</p>
                      <div className="mt-auto flex justify-end text-sm text-gray-900">
                        {renderValueWithTrend(String(entry.matchesPlayed), delta?.matches ?? null)}
                      </div>
                    </div>
                    <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">DAMAGE</p>
                      <div className="mt-auto flex justify-end text-sm text-gray-900">
                        {renderValueWithTrend(String(Math.round(entry.totalDamage)), delta?.damage ?? null)}
                      </div>
                    </div>
                    <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">K/M</p>
                      <p className="mt-auto text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {formatKillsPerMatch(entry)}
                      </p>
                    </div>
                    <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">WINNER</p>
                      <div className="mt-auto flex justify-end text-sm text-gray-900">
                        {renderValueWithTrend(String(entry.matchesWon), delta?.winner ?? null)}
                      </div>
                    </div>
                    <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">WIN RATE</p>
                      <div className="mt-auto flex justify-end text-sm text-gray-900">
                        {renderValueWithTrend(`${(entry.winRate * 100).toFixed(1)}%`, delta?.winRate ?? null, 1)}
                      </div>
                    </div>
                    <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">
                        <TeamModeBadge mode="solo" label="Solo" size="xs" className="shadow-none" />
                      </p>
                      <p className="mt-auto text-right text-sm font-semibold text-gray-900">{getDisplayedSoloClanKills(entry)}</p>
                    </div>
                    <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">
                        <TeamModeBadge mode="duo" label="Duo" size="xs" className="shadow-none" />
                      </p>
                      <p className="mt-auto text-right text-sm font-semibold text-gray-900">{entry.duoClanKills}</p>
                    </div>
                    <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">
                        <TeamModeBadge mode="trio" label="Trio" size="xs" className="shadow-none" />
                      </p>
                      <p className="mt-auto text-right text-sm font-semibold text-gray-900">{entry.trioClanKills}</p>
                    </div>
                    <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">
                        <TeamModeBadge mode="squad" label="Squad" size="xs" className="shadow-none" />
                      </p>
                      <p className="mt-auto text-right text-sm font-semibold text-gray-900">{entry.squadClanKills}</p>
                    </div>
                  </div>
                </article>
              )
            })}

            <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">-</span>
                  <span className="font-semibold text-gray-900">Total</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                  <p className="text-gray-500">KILLS</p>
                  <p className="mt-auto text-right text-sm font-semibold text-gray-900 tabular-nums">{totals.kills}</p>
                </div>
                <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                  <p className="text-gray-500">MATCHS</p>
                  <p className="mt-auto text-right text-sm font-semibold text-gray-900 tabular-nums">{totals.matches}</p>
                </div>
                <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                  <p className="text-gray-500">DAMAGE</p>
                  <p className="mt-auto text-right text-sm font-semibold text-gray-900 tabular-nums">{totals.damage}</p>
                </div>
                <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                  <p className="text-gray-500">K/M</p>
                  <p className="mt-auto text-right text-sm font-semibold text-gray-900 tabular-nums">
                    {totalKpm.toLocaleString('fr-FR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                  <p className="text-gray-500">WINNER</p>
                  <p className="mt-auto text-right text-sm font-semibold text-gray-900 tabular-nums">{totals.winner}</p>
                </div>
                <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                  <p className="text-gray-500">WIN RATE</p>
                  <p className="mt-auto text-right text-sm font-semibold text-gray-900 tabular-nums">{totalWinRate.toFixed(1)}%</p>
                </div>
                <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                  <p className="text-gray-500">
                    <TeamModeBadge mode="solo" label="Solo" size="xs" className="shadow-none" />
                  </p>
                  <p className="mt-auto text-right text-sm font-semibold text-gray-900">{totals.solo}</p>
                </div>
                <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                  <p className="text-gray-500">
                    <TeamModeBadge mode="duo" label="Duo" size="xs" className="shadow-none" />
                  </p>
                  <p className="mt-auto text-right text-sm font-semibold text-gray-900">{totals.duo}</p>
                </div>
                <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                  <p className="text-gray-500">
                    <TeamModeBadge mode="trio" label="Trio" size="xs" className="shadow-none" />
                  </p>
                  <p className="mt-auto text-right text-sm font-semibold text-gray-900">{totals.trio}</p>
                </div>
                <div className="flex min-h-20 flex-col rounded border border-gray-200 bg-gray-50 p-2">
                  <p className="text-gray-500">
                    <TeamModeBadge mode="squad" label="Squad" size="xs" className="shadow-none" />
                  </p>
                  <p className="mt-auto text-right text-sm font-semibold text-gray-900">{totals.squad}</p>
                </div>
              </div>
            </article>
          </div>

          <div className="app-table-shell hidden overflow-x-auto md:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '5.5%' }} />
                <col style={{ width: '5.5%' }} />
                <col style={{ width: '5.5%' }} />
                <col style={{ width: '5.5%' }} />
              </colgroup>
              <thead className="app-table-head text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Rang</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Joueur</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex w-full justify-end">Kills</div>
                  </th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex w-full justify-end">Matchs</div>
                  </th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex w-full justify-end">Damage</div>
                  </th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex w-full justify-end">K/M</div>
                  </th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex w-full justify-end">Winner</div>
                  </th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex w-full justify-end">Win Rate</div>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <div className="flex w-full justify-end">
                      <TeamModeBadge mode="solo" label="Solo" size="xxs" className="shadow-none app-team-mode-badge--table-head" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <div className="flex w-full justify-end">
                      <TeamModeBadge mode="duo" label="Duo" size="xxs" className="shadow-none app-team-mode-badge--table-head" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <div className="flex w-full justify-end">
                      <TeamModeBadge mode="trio" label="Trio" size="xxs" className="shadow-none app-team-mode-badge--table-head" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <div className="flex w-full justify-end">
                      <TeamModeBadge mode="squad" label="Squad" size="xxs" className="shadow-none app-team-mode-badge--table-head" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  const rank = index + 1
                  const medal = RANK_MEDALS[rank]
                  const badgeKeys = getRowBadgeKeys(entry)
                  const delta = getProgressionDelta(entry.memberId)
                  const rowClassName =
                    rank === 1
                      ? 'app-table-row app-table-row--top1'
                      : rank === 2
                        ? 'app-table-row app-table-row--top2'
                        : rank === 3
                          ? 'app-table-row app-table-row--top3'
                          : 'app-table-row'

                  return (
                    <tr
                      key={entry.id}
                      className={rowClassName}
                    >
                      <td className="px-4 py-3 text-center font-semibold text-gray-700">
                        {medal ?? rank}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
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
                          <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                            <span className="truncate">{entry.displayName}</span>
                            {badgeKeys.length > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                {badgeKeys.map((badgeKey) => {
                                  const badgeMeta = DISTINCTION_BADGE_META[badgeKey]

                                  return (
                                    <span
                                      key={`${entry.id}-${badgeKey}`}
                                      title={badgeMeta.label}
                                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
                                      aria-label={badgeMeta.label}
                                    >
                                      <Image src={badgeMeta.iconPath} alt={badgeMeta.label} width={20} height={20} />
                                    </span>
                                  )
                                })}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-right text-gray-700">
                        <div className="flex w-full justify-end">
                          {renderValueWithTrend(String(entry.totalKills), delta?.kills ?? null)}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-right text-gray-700">
                        <div className="flex w-full justify-end">
                          {renderValueWithTrend(String(entry.matchesPlayed), delta?.matches ?? null)}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-right text-gray-700">
                        <div className="flex w-full justify-end">
                          {renderValueWithTrend(String(Math.round(entry.totalDamage)), delta?.damage ?? null)}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-right text-gray-700 font-semibold tabular-nums">
                        {formatKillsPerMatch(entry)}
                      </td>
                      <td className="px-4 py-3 align-top text-right text-gray-700">
                        <div className="flex w-full justify-end">
                          {renderValueWithTrend(String(entry.matchesWon), delta?.winner ?? null)}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-right text-gray-700">
                        <div className="flex w-full justify-end">
                          {renderValueWithTrend(`${(entry.winRate * 100).toFixed(1)}%`, delta?.winRate ?? null, 1)}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-right text-gray-700">{getDisplayedSoloClanKills(entry)}</td>
                      <td className="px-4 py-3 align-top text-right text-gray-700">{entry.duoClanKills}</td>
                      <td className="px-4 py-3 align-top text-right text-gray-700">{entry.trioClanKills}</td>
                      <td className="px-4 py-3 align-top text-right text-gray-700">{entry.squadClanKills}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="app-table-head">
                  <td className="px-4 py-3 text-center font-semibold text-gray-700">-</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{totals.kills}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{totals.matches}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{totals.damage}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    {totalKpm.toLocaleString('fr-FR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{totals.winner}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{totalWinRate.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{totals.solo}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{totals.duo}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{totals.trio}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{totals.squad}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
