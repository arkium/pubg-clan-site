'use client'

/* eslint-disable @next/next/no-img-element -- avatars externes (Steam, Discord) */

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import MobileRankList, { type MobileRankRow } from '@/components/ui/MobileRankList'
import RankCell from '@/components/ui/RankCell'
import ShowMoreToggle from '@/components/ui/ShowMoreToggle'
import SortableTh from '@/components/ui/SortableTh'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import { DISTINCTION_BADGE_META, type DistinctionBadgeKey } from '@/lib/distinction-badges'
import {
  formatInteger,
  formatKpm,
  formatPlayTime,
  formatWinRate,
  LEADERBOARD_SORT_COLUMNS,
  type LeaderboardSortDirection,
  type LeaderboardSortKey,
  type RankedEntry,
} from '@/lib/leaderboard-sort'
import type { LeaderboardTeamMode, PlayerStatsEntry, WeeklyProgression } from '@/types/leaderboard'

/** Lignes affichées avant « Afficher les N autres joueurs » (maquette validée, écran 1). */
const DESKTOP_VISIBLE_ROWS = 10

const MOBILE_SORT_OPTIONS = (Object.keys(LEADERBOARD_SORT_COLUMNS) as LeaderboardSortKey[]).map((value) => ({
  value,
  label: LEADERBOARD_SORT_COLUMNS[value].label,
}))

const GROUPED_MODES = ['duo', 'trio', 'squad'] as const
const MODE_KILLS: Record<(typeof GROUPED_MODES)[number], (entry: PlayerStatsEntry) => number> = {
  duo: (entry) => entry.duoClanKills,
  trio: (entry) => entry.trioClanKills,
  squad: (entry) => entry.squadClanKills,
}
const MODE_LABELS = { duo: 'Duo', trio: 'Trio', squad: 'Squad' } as const

const TD = 'px-[9px] py-2.5 text-right tabular-nums text-gray-700 whitespace-nowrap'

interface LeaderboardProps {
  /** Lignes dans l'ordre d'affichage, avec leur rang (`rankLeaderboard`). */
  rows: RankedEntry[]
  sortKey: LeaderboardSortKey
  sortDir: LeaderboardSortDirection
  onSort: (key: LeaderboardSortKey) => void
  colTint: (key: LeaderboardSortKey) => string
  teamMode: LeaderboardTeamMode
  distinctions: Map<number, DistinctionBadgeKey[]>
  progression?: WeeklyProgression[]
  showPerformanceDelta?: boolean
}

function Avatar({ entry }: { entry: PlayerStatsEntry }) {
  return (
    <span className="app-avatar flex h-7 w-7 shrink-0 text-[11px] font-bold">
      {entry.avatarUrl ? (
        <img
          src={entry.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        entry.displayName.charAt(0).toUpperCase()
      )}
    </span>
  )
}

function DistinctionIcons({ keys, size }: { keys: DistinctionBadgeKey[] | undefined; size: number }) {
  return (keys ?? []).map((key) => (
    <Image
      key={key}
      src={DISTINCTION_BADGE_META[key].iconPath}
      alt={DISTINCTION_BADGE_META[key].shortLabel}
      title={DISTINCTION_BADGE_META[key].shortLabel}
      width={size}
      height={size}
      className="shrink-0"
    />
  ))
}

export default function Leaderboard({
  rows,
  sortKey,
  sortDir,
  onSort,
  colTint,
  teamMode,
  distinctions,
  progression = [],
  showPerformanceDelta = true,
}: LeaderboardProps) {
  const [showAll, setShowAll] = useState(false)
  // « Tous » regroupe Duo, Trio et Squad : les colonnes de mode n'ont de sens que là (un seul mode = une colonne égale
  // aux kills ; le Solo est exclu de « Tous », donc toujours nul).
  const showModes = teamMode === 'all'

  const killsDelta = new Map<number, number>()
  if (showPerformanceDelta) {
    for (const item of progression) {
      const weeks = item.weeklyStats
      if (weeks.length >= 2) {
        killsDelta.set(item.memberId, weeks[weeks.length - 1].totalKills - weeks[weeks.length - 2].totalKills)
      }
    }
  }

  const entries = rows.map(({ entry }) => entry)
  const totals = entries.reduce(
    (acc, entry) => ({
      kills: acc.kills + entry.totalKills,
      matches: acc.matches + entry.matchesPlayed,
      damage: acc.damage + entry.totalDamage,
      wins: acc.wins + entry.matchesWon,
      duo: acc.duo + entry.duoClanKills,
      trio: acc.trio + entry.trioClanKills,
      squad: acc.squad + entry.squadClanKills,
      time: acc.time + entry.timePlayedSeconds,
    }),
    { kills: 0, matches: 0, damage: 0, wins: 0, duo: 0, trio: 0, squad: 0, time: 0 }
  )

  if (rows.length === 0) {
    return (
      <section className="app-panel p-6 text-center">
        <p className="text-sm text-gray-500">
          Aucune donnée pour cette période. Le classement est recalculé à partir des matchs importés.
        </p>
      </section>
    )
  }

  const visibleRows = showAll ? rows : rows.slice(0, DESKTOP_VISIBLE_ROWS)
  const hiddenCount = rows.length - DESKTOP_VISIBLE_ROWS
  const th = { sortKey, sortDir, onSort }
  const tint = (key: LeaderboardSortKey) => ({ backgroundColor: colTint(key) })

  const mobileRows: MobileRankRow[] = rows.map(({ entry, rank }) => ({
    key: entry.id,
    rank,
    name: entry.displayName,
    href: `/members/${entry.memberId}/dashboard`,
    distinctions: distinctions.get(entry.memberId),
    subline: `${formatInteger(entry.matchesPlayed)} matchs · ${formatKpm(entry.avgKillsPerGame)} K/M · ${formatWinRate(entry.winRate)}`,
    value: LEADERBOARD_SORT_COLUMNS[sortKey].format(entry),
    details: [
      { label: 'Dégâts', value: formatInteger(entry.totalDamage) },
      { label: 'Top 1', value: formatInteger(entry.matchesWon) },
      { label: 'Temps', value: formatPlayTime(entry.timePlayedSeconds) },
      ...(showModes
        ? GROUPED_MODES.map((mode) => ({ label: MODE_LABELS[mode], value: formatInteger(MODE_KILLS[mode](entry)) }))
        : [{ label: 'Jours actifs', value: formatInteger(entry.activeDays) }]),
    ],
  }))

  return (
    <>
      <section className="app-table-shell hidden overflow-hidden md:block" aria-label="Classement">
        <div className="flex items-baseline justify-between gap-3 px-4 py-3.5">
          <h2 className="text-base font-bold text-gray-900">Classement</h2>
          <span className="text-xs text-gray-500">Cliquez sur un en-tête pour trier</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-[13px]">
            <thead className="app-table-head">
              <tr>
                <SortableTh align="left" className="pl-3">#</SortableTh>
                <SortableTh align="left">Joueur</SortableTh>
                <SortableTh {...th} column="kills">Kills</SortableTh>
                <SortableTh {...th} column="matches">Matchs</SortableTh>
                <SortableTh {...th} column="kpm">K/M</SortableTh>
                <SortableTh {...th} column="damage">Dégâts</SortableTh>
                <SortableTh {...th} column="wins" title="Victoires (top 1)">Top 1</SortableTh>
                <SortableTh {...th} column="winRate">Win rate</SortableTh>
                {showModes
                  ? GROUPED_MODES.map((mode) => (
                      <SortableTh key={mode} title={`Kills en ${MODE_LABELS[mode]}`}>
                        <span className="flex justify-end">
                          <TeamModeBadge mode={mode} label={MODE_LABELS[mode]} size="xxs" className="shadow-none app-team-mode-badge--table-head" />
                        </span>
                      </SortableTh>
                    ))
                  : null}
                <SortableTh {...th} column="timePlayed">Temps</SortableTh>
                {/* Seul en-tête autorisé à passer sur deux lignes : le tableau tient dans la carte sans défilement. */}
                <SortableTh {...th} column="activeDays" className="whitespace-normal! pr-3 leading-tight">
                  Jours actifs
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ entry, rank }) => {
                const delta = killsDelta.get(entry.memberId)
                return (
                  <tr key={entry.id} className={rank <= 3 ? `app-table-row app-table-row--top${rank}` : 'app-table-row'}>
                    <td className="py-2 pl-3 pr-[9px]">
                      <RankCell rank={rank} />
                    </td>
                    <td className="px-[9px] py-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Avatar entry={entry} />
                        <Link
                          href={`/members/${entry.memberId}/dashboard`}
                          className="truncate font-semibold text-gray-900 hover:underline"
                        >
                          {entry.displayName}
                        </Link>
                        <DistinctionIcons keys={distinctions.get(entry.memberId)} size={16} />
                      </span>
                    </td>
                    <td className={`${TD} font-bold text-gray-900`} style={tint('kills')}>
                      {formatInteger(entry.totalKills)}
                      {delta ? (
                        <span
                          className={`ml-1 text-[11px] ${delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                          title={`${delta > 0 ? '+' : ''}${delta} kills par rapport à la semaine précédente`}
                        >
                          {delta > 0 ? '▲' : '▼'}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD} style={tint('matches')}>{formatInteger(entry.matchesPlayed)}</td>
                    <td className={TD} style={tint('kpm')}>{formatKpm(entry.avgKillsPerGame)}</td>
                    <td className={TD} style={tint('damage')}>{formatInteger(entry.totalDamage)}</td>
                    <td className={TD} style={tint('wins')}>{formatInteger(entry.matchesWon)}</td>
                    <td className={TD} style={tint('winRate')}>{formatWinRate(entry.winRate)}</td>
                    {showModes
                      ? GROUPED_MODES.map((mode) => (
                          <td key={mode} className={TD}>
                            {formatInteger(MODE_KILLS[mode](entry))}
                          </td>
                        ))
                      : null}
                    <td className={`${TD} text-gray-500`} style={tint('timePlayed')}>{formatPlayTime(entry.timePlayedSeconds)}</td>
                    <td className={`${TD} pr-3 text-gray-500`} style={tint('activeDays')}>{formatInteger(entry.activeDays)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="app-table-head font-bold text-gray-900">
              <tr>
                <td className="py-2.5 pl-3" />
                <td className="px-[9px] py-2.5 text-left">Total clan</td>
                <td className={`${TD} text-gray-900`}>{formatInteger(totals.kills)}</td>
                <td className={`${TD} text-gray-900`}>{formatInteger(totals.matches)}</td>
                <td className={`${TD} text-gray-900`}>{formatKpm(totals.matches > 0 ? totals.kills / totals.matches : 0)}</td>
                <td className={`${TD} text-gray-900`}>{formatInteger(totals.damage)}</td>
                <td className={`${TD} text-gray-900`}>{formatInteger(totals.wins)}</td>
                <td className={`${TD} text-gray-900`}>{formatWinRate(totals.matches > 0 ? totals.wins / totals.matches : 0)}</td>
                {showModes
                  ? GROUPED_MODES.map((mode) => (
                      <td key={mode} className={`${TD} text-gray-900`}>
                        {formatInteger(totals[mode])}
                      </td>
                    ))
                  : null}
                <td className={`${TD} text-gray-900`}>{formatPlayTime(totals.time)}</td>
                <td className={`${TD} pr-3 text-gray-500`}>—</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {hiddenCount > 0 ? (
          <ShowMoreToggle
            expanded={showAll}
            onToggle={() => setShowAll((current) => !current)}
            moreLabel={`Afficher les ${hiddenCount} autres joueurs`}
            lessLabel="Afficher moins"
            className="mt-0! rounded-none"
          />
        ) : null}
      </section>

      <MobileRankList
        rows={mobileRows}
        sortOptions={MOBILE_SORT_OPTIONS}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={onSort}
        metricLabel={LEADERBOARD_SORT_COLUMNS[sortKey].label}
      />
    </>
  )
}
