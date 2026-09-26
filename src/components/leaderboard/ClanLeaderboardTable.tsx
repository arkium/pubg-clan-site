'use client'

import Link from 'next/link'

import MobileRankList from '@/components/ui/MobileRankList'
import PodiumCards from '@/components/ui/PodiumCards'
import RankCell from '@/components/ui/RankCell'
import SortableTh from '@/components/ui/SortableTh'
import { useTableSort } from '@/hooks/useTableSort'
import { formatInteger, formatWinRate, rankBy } from '@/lib/leaderboard-sort'

import type { ClanLeaderboardEntry } from '@/app/api/clans-leaderboard/route'

export type SortBy = 'powerScore' | 'activeMembers' | 'winRate' | 'avgDamage' | 'avgKills' | 'avgKnocks'

const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Colonnes triables, dans l'ordre du tableau ; la valeur formatée sert aussi au podium et à la liste mobile. */
const COLUMNS: Array<{ key: SortBy; label: string; title?: string; format: (entry: ClanLeaderboardEntry) => string }> = [
  { key: 'powerScore', label: 'Power score', format: (e) => formatInteger(e.powerScore) },
  { key: 'activeMembers', label: 'Actifs', title: 'Membres actifs sur la période', format: (e) => formatInteger(e.activeMembers) },
  { key: 'winRate', label: 'Win rate', format: (e) => formatWinRate(e.winRate) },
  { key: 'avgDamage', label: 'Dégâts moy.', title: 'Dégâts moyens par match', format: (e) => formatInteger(e.avgDamage) },
  { key: 'avgKills', label: 'Kills moy.', title: 'Kills moyens par match', format: (e) => oneDecimal.format(e.avgKills) },
  { key: 'avgKnocks', label: 'Knocks moy.', title: 'Knocks moyens par match', format: (e) => oneDecimal.format(e.avgKnocks) },
]
const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((column) => [column.key, column])) as Record<SortBy, (typeof COLUMNS)[number]>

const TD = 'px-[9px] py-2.5 text-right tabular-nums text-gray-700 whitespace-nowrap'

/** Ligue inter-clans. La période se choisit dans le bandeau de la page (docs/TODO/sticky.md §4). */
export function ClanLeaderboardTable({ entries }: { entries: ClanLeaderboardEntry[] }) {
  const { sortKey, sortDir, onSort, colTint } = useTableSort<SortBy>('powerScore')

  if (!entries || entries.length === 0) {
    return <div className="py-12 text-center text-gray-500">Aucun clan trouvé.</div>
  }

  const column = COLUMN_BY_KEY[sortKey]
  const value = (entry: ClanLeaderboardEntry) => entry[sortKey]
  const rows = rankBy(entries, value, sortDir)
  const th = { sortKey, sortDir, onSort }
  // Courte : elle tient sous le nom dans une carte du podium.
  const subline = (entry: ClanLeaderboardEntry) => `[${entry.tag}] · ${formatInteger(entry.activeMembers)} actifs`

  return (
    <div className="flex w-full flex-col gap-4">
      <PodiumCards
        metricLabel={column.label}
        entries={rankBy(entries, value, 'desc')
          .slice(0, 3)
          .map(({ entry }) => ({
            key: entry.clanId,
            name: entry.name,
            href: `/clans/${entry.clanId}/overview`,
            subline: subline(entry),
            value: column.format(entry),
          }))}
      />

      <section className="app-table-shell hidden overflow-hidden md:block" aria-label="Classement détaillé">
        <div className="flex items-baseline justify-between gap-3 px-4 py-3.5">
          <h2 className="text-base font-bold text-gray-900">Classement détaillé</h2>
          <span className="text-xs text-gray-500">Cliquez sur un en-tête pour trier</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-[13px]">
            <thead className="app-table-head">
              <tr>
                <SortableTh align="left" className="pl-3">#</SortableTh>
                <SortableTh align="left">Clan</SortableTh>
                {COLUMNS.map((col, index) => (
                  <SortableTh
                    key={col.key}
                    {...th}
                    column={col.key}
                    title={col.title}
                    className={index === COLUMNS.length - 1 ? 'pr-3' : ''}
                  >
                    {col.label}
                  </SortableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, rank }) => (
                <tr key={entry.clanId} className={rank <= 3 ? `app-table-row app-table-row--top${rank}` : 'app-table-row'}>
                  <td className="py-2 pl-3 pr-[9px]">
                    <RankCell rank={rank} />
                  </td>
                  <td className="px-[9px] py-2">
                    <Link href={`/clans/${entry.clanId}/overview`} className="font-semibold text-gray-900 hover:underline">
                      {entry.name}
                    </Link>
                    <span className="ml-1.5 font-mono text-xs text-gray-500">[{entry.tag}]</span>
                  </td>
                  {COLUMNS.map((col, index) => (
                    <td
                      key={col.key}
                      className={`${TD} ${col.key === sortKey ? 'font-bold text-gray-900' : ''} ${index === COLUMNS.length - 1 ? 'pr-3' : ''}`}
                      style={{ backgroundColor: colTint(col.key) }}
                    >
                      {col.format(entry)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <MobileRankList
        rows={rows.map(({ entry, rank }) => ({
          key: entry.clanId,
          rank,
          name: entry.name,
          href: `/clans/${entry.clanId}/overview`,
          subline: subline(entry),
          value: column.format(entry),
          details: COLUMNS.filter((col) => col.key !== sortKey).map((col) => ({ label: col.label, value: col.format(entry) })),
        }))}
        sortOptions={COLUMNS.map((col) => ({ value: col.key, label: col.label }))}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={onSort}
        metricLabel={column.label}
        linkLabel="Voir le clan"
      />

      <section className="app-panel-muted p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-900">Comment le Power score est calculé</h3>
        <p className="mt-1 text-xs text-gray-500">
          Un score composite qui combine quatre indicateurs de performance sur la période sélectionnée :
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Win rate × 100', 'Taux de victoire du clan'],
            ['+ Dégâts moy.', 'Dégâts infligés par match'],
            ['+ Kills moy. × 10', 'Kills par match'],
            ['+ Knocks moy. × 5', 'Knocks par match'],
          ].map(([formula, detail]) => (
            <div key={formula} className="app-panel px-3 py-2 text-xs">
              <span className="font-bold text-gray-900">{formula}</span>
              <p className="mt-0.5 text-gray-500">{detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Plus un clan gagne, inflige de dégâts, et met des adversaires au sol ou les élimine en moyenne, plus son Power score
          est élevé.
        </p>
      </section>
    </div>
  )
}
