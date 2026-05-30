/* eslint-disable @next/next/no-img-element */

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

const MODE_ICONS = {
  solo: '/icons/squads/solo.svg',
  duo: '/icons/squads/duo.svg',
  trio: '/icons/squads/trio.svg',
  squad: '/icons/squads/squad.svg',
} as const

const SCOPE_ICONS = {
  clan: '/icons/squads/scope-clan.svg',
  outside: '/icons/squads/scope-outside.svg',
} as const

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

function ModeLabel({
  icon,
  modeHint,
  scope,
}: {
  icon: (typeof MODE_ICONS)[keyof typeof MODE_ICONS]
  modeHint: string
  scope: keyof typeof SCOPE_ICONS
}) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      <img
        src={icon}
        alt={modeHint}
        className="h-4 w-4 rounded-sm"
        title={modeHint}
        aria-label={modeHint}
      />
      <img
        src={SCOPE_ICONS[scope]}
        alt={scope === 'clan' ? 'Perimetre clan' : 'Perimetre hors clan'}
        className="h-4 w-4 rounded-sm"
        title={scope === 'clan' ? 'Clan' : 'Hors clan'}
      />
    </span>
  )
}

interface LeaderboardProps {
  entries: PlayerStatsEntry[]
  progression?: WeeklyProgression[]
  sortBy: LeaderboardSortBy
  killsView: LeaderboardKillsView
  onSortChange: (sortBy: LeaderboardSortBy) => void
  onKillsViewChange: (view: LeaderboardKillsView) => void
}

export default function Leaderboard({
  entries,
  progression = [],
  sortBy,
  killsView,
  onSortChange,
  onKillsViewChange,
}: LeaderboardProps) {
  const sortOptions: LeaderboardSortBy[] = ['kills', 'damage', 'winRate', 'matches']
  const progressionByMember = new Map<number, WeeklyProgression['weeklyStats']>(
    progression.map((item) => [item.memberId, item.weeklyStats])
  )

  function getProgressionDelta(memberId: number) {
    const weeklyStats = progressionByMember.get(memberId)
    if (!weeklyStats || weeklyStats.length < 2) {
      return null
    }

    const first = weeklyStats[0]
    const last = weeklyStats[weeklyStats.length - 1]

    return {
      kills: last.totalKills - first.totalKills,
      winner: last.matchesWon - first.matchesWon,
      winRate: (last.winRate - first.winRate) * 100,
      matches: last.matchesPlayed - first.matchesPlayed,
      damage: Math.round(last.totalDamage - first.totalDamage),
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
    const trend = getTrend(delta)

    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className="font-semibold text-gray-900">{value}</span>
        <span className={`text-xs font-semibold ${trend.tone}`}>
          {delta === null ? '•' : `${trend.symbol}${formatDeltaMagnitude(delta, decimals)}`}
        </span>
      </span>
    )
  }

  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Classement</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded border border-gray-200 p-1">
            <button
              type="button"
              onClick={() => onKillsViewChange('clan')}
              className={`rounded px-3 py-1 text-sm font-medium ${
                killsView === 'clan' ? 'bg-slate-900 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
              title="Classement inchange: kills avec membres du clan uniquement"
            >
              Kills clan
            </button>
            <button
              type="button"
              onClick={() => onKillsViewChange('withSolo')}
              className={`rounded px-3 py-1 text-sm font-medium ${
                killsView === 'withSolo' ? 'bg-slate-900 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
              title="Affichage Kills = kills clan + kills solo hors clan"
            >
              Kills + solo
            </button>
          </div>

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
      </div>

      <p className="mb-3 text-xs text-gray-500">
        Le classement et les badges du tableau restent calcules sur les kills clan (sans solo). Le toggle
        "Kills + solo" recalcule uniquement les cartes Top performers.
      </p>

      {entries.length === 0 ? (
        <div className="rounded border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-600">
            Aucune donnée disponible. Les stats sont calculées automatiquement chaque nuit.
          </p>
        </div>
      ) : (
        <div>
          <div className="space-y-3 md:hidden">
            {entries.map((entry, index) => {
              const rank = index + 1
              const medal = RANK_MEDALS[rank]
              const badgeIcon = entry.badgeType ? BADGE_ICONS[entry.badgeType] : null
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
                        {badgeIcon ? (
                          <span
                            title={entry.badgeType ?? ''}
                            className="shrink-0 text-base leading-none"
                            aria-label={entry.badgeType ?? 'badge'}
                          >
                            {badgeIcon}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">KILLS</p>
                      <p className="text-sm text-gray-900">
                        {renderValueWithTrend(String(entry.totalKills), delta?.kills ?? null)}
                      </p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">DAMAGE</p>
                      <p className="text-sm text-gray-900">
                        {renderValueWithTrend(String(Math.round(entry.totalDamage)), delta?.damage ?? null)}
                      </p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">WINNER</p>
                      <p className="text-sm text-gray-900">
                        {renderValueWithTrend(String(entry.matchesWon), delta?.winner ?? null)}
                      </p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">WIN RATE</p>
                      <p className="text-sm text-gray-900">
                        {renderValueWithTrend(`${(entry.winRate * 100).toFixed(1)}%`, delta?.winRate ?? null, 1)}
                      </p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">MATCHS</p>
                      <p className="text-sm text-gray-900">
                        {renderValueWithTrend(String(entry.matchesPlayed), delta?.matches ?? null)}
                      </p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="inline-flex items-center gap-1 text-gray-500">
                        <img
                          src={MODE_ICONS.solo}
                          alt="Solo"
                          className="h-3.5 w-3.5 rounded-sm"
                          title="Solo"
                          aria-label="Solo"
                        />
                        SOLO
                        <img
                          src={SCOPE_ICONS.outside}
                          alt="Perimetre hors clan"
                          className="h-3.5 w-3.5 rounded-sm"
                          title="Hors clan"
                        />
                      </p>
                      <p className="text-sm font-semibold text-gray-900">{entry.soloKills}</p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="inline-flex items-center gap-1 text-gray-500">
                        <img
                          src={MODE_ICONS.duo}
                          alt="Duo"
                          className="h-3.5 w-3.5 rounded-sm"
                          title="Duo"
                          aria-label="Duo"
                        />
                        DUO
                        <img
                          src={SCOPE_ICONS.clan}
                          alt="Perimetre clan"
                          className="h-3.5 w-3.5 rounded-sm"
                          title="Clan"
                        />
                      </p>
                      <p className="text-sm font-semibold text-gray-900">{entry.duoClanKills}</p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="inline-flex items-center gap-1 text-gray-500">
                        <img
                          src={MODE_ICONS.trio}
                          alt="Trio"
                          className="h-3.5 w-3.5 rounded-sm"
                          title="Trio"
                          aria-label="Trio"
                        />
                        TRIO
                        <img
                          src={SCOPE_ICONS.clan}
                          alt="Perimetre clan"
                          className="h-3.5 w-3.5 rounded-sm"
                          title="Clan"
                        />
                      </p>
                      <p className="text-sm font-semibold text-gray-900">{entry.trioClanKills}</p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="inline-flex items-center gap-1 text-gray-500">
                        <img
                          src={MODE_ICONS.squad}
                          alt="Squad"
                          className="h-3.5 w-3.5 rounded-sm"
                          title="Squad"
                          aria-label="Squad"
                        />
                        SQUAD
                        <img
                          src={SCOPE_ICONS.clan}
                          alt="Perimetre clan"
                          className="h-3.5 w-3.5 rounded-sm"
                          title="Clan"
                        />
                      </p>
                      <p className="text-sm font-semibold text-gray-900">{entry.squadClanKills}</p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto rounded border border-gray-200 bg-white shadow-sm md:block">
            <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: '5%' }} />
              <col style={{ width: '23%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Rang</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Joueur</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Kills</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Damage</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Winner</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Win Rate</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Matchs</th>
                  <th className="px-4 py-3 text-center">
                    <ModeLabel icon={MODE_ICONS.solo} modeHint="Solo" scope="outside" />
                  </th>
                  <th className="px-4 py-3 text-center">
                    <ModeLabel icon={MODE_ICONS.duo} modeHint="Duo" scope="clan" />
                  </th>
                  <th className="px-4 py-3 text-center">
                    <ModeLabel icon={MODE_ICONS.trio} modeHint="Trio" scope="clan" />
                  </th>
                  <th className="px-4 py-3 text-center">
                    <ModeLabel icon={MODE_ICONS.squad} modeHint="Squad" scope="clan" />
                  </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry, index) => {
                const rank = index + 1
                const medal = RANK_MEDALS[rank]
                const badgeIcon = entry.badgeType ? BADGE_ICONS[entry.badgeType] : null
                const delta = getProgressionDelta(entry.memberId)

                return (
                  <tr
                    key={entry.id}
                    className={rank <= 3 ? 'bg-yellow-50/30' : 'hover:bg-gray-50'}
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
                          {badgeIcon ? (
                            <span
                              title={entry.badgeType ?? ''}
                              className="shrink-0 text-base leading-none"
                              aria-label={entry.badgeType ?? 'badge'}
                            >
                              {badgeIcon}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {renderValueWithTrend(String(entry.totalKills), delta?.kills ?? null)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {renderValueWithTrend(String(Math.round(entry.totalDamage)), delta?.damage ?? null)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {renderValueWithTrend(String(entry.matchesWon), delta?.winner ?? null)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {renderValueWithTrend(`${(entry.winRate * 100).toFixed(1)}%`, delta?.winRate ?? null, 1)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {renderValueWithTrend(String(entry.matchesPlayed), delta?.matches ?? null)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{entry.soloKills}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{entry.duoClanKills}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{entry.trioClanKills}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{entry.squadClanKills}</td>
                  </tr>
                )
              })}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
