'use client'

import MobileRankList, { type MobileRankRow } from '@/components/ui/MobileRankList'
import Pagination from '@/components/ui/Pagination'
import RankCell from '@/components/ui/RankCell'
import SortableTh from '@/components/ui/SortableTh'
import ArmoryWeaponImage from '@/components/weapons/ArmoryWeaponImage'
import type { SortDirection } from '@/hooks/useTableSort'
import type { Ranked } from '@/lib/leaderboard-sort'
import {
  ARMORY_SORT_COLUMNS,
  accuracyOf,
  formatCount,
  formatMeters,
  formatPercent,
  headshotRate,
  rowCategory,
  type ArmoryRow,
  type ArmorySortKey,
} from '@/lib/weapons/armory'

export const ARMORY_PAGE_SIZE = 8

const TD = 'whitespace-nowrap px-[9px] py-2 text-right tabular-nums'

const MOBILE_SORT_OPTIONS = (Object.keys(ARMORY_SORT_COLUMNS) as Array<keyof typeof ARMORY_SORT_COLUMNS>).map((value) => ({
  value: value as ArmorySortKey,
  label: ARMORY_SORT_COLUMNS[value].label,
}))

const rowKey = (row: ArmoryRow) => `${row.memberId}:${row.weaponName}`
const weaponText = (row: ArmoryRow) => row.weaponLabel ?? row.weaponName
const damageText = (row: ArmoryRow) => (typeof row.totalDamage === 'number' ? formatCount(row.totalDamage) : '–')
const accuracyText = (row: ArmoryRow) => {
  const accuracy = accuracyOf(row)
  return accuracy === null ? '–' : formatPercent(accuracy)
}
const maxDistanceText = (row: ArmoryRow) => (typeof row.maxDistance === 'number' ? formatMeters(row.maxDistance) : '–')

const METRIC_TEXT: Record<keyof typeof ARMORY_SORT_COLUMNS, (row: ArmoryRow) => string> = {
  kills: (row) => formatCount(row.kills),
  totalDamage: damageText,
  headshotRate: (row) => (row.kills > 0 ? formatPercent(headshotRate(row)) : '–'),
  accuracy: accuracyText,
  avgDistance: (row) => formatMeters(row.avgDistance),
  maxDistance: maxDistanceText,
  matchCount: (row) => formatCount(row.matchCount),
}

/**
 * Classement de l'armurerie : une ligne par joueur et par arme. Tri par les en-têtes (`SortableTh`), podium sur la
 * sélection affichée, tirs et touches dans l'infobulle de la précision. Sur mobile, `MobileRankList`.
 */
export default function ArmoryRanking({
  rows,
  sortKey,
  sortDir,
  onSort,
  colTint,
  page,
  onPageChange,
  showCategory,
}: {
  rows: Ranked<ArmoryRow>[]
  sortKey: ArmorySortKey
  sortDir: SortDirection
  onSort: (key: ArmorySortKey) => void
  colTint: (key: ArmorySortKey) => string
  page: number
  onPageChange: (page: number) => void
  /** « Tout l'arsenal » : le code de catégorie suit le nom de l'arme. */
  showCategory: boolean
}) {
  const pageCount = Math.max(1, Math.ceil(rows.length / ARMORY_PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const start = (current - 1) * ARMORY_PAGE_SIZE
  const pageRows = rows.slice(start, start + ARMORY_PAGE_SIZE)
  const th = { sortKey, sortDir, onSort }
  const tint = (key: ArmorySortKey) => ({ backgroundColor: colTint(key) })
  const cell = (key: ArmorySortKey) => `${TD} ${key === sortKey ? 'font-bold text-gray-900' : 'text-gray-700'}`
  const metricKey = sortKey === 'player' || sortKey === 'weapon' ? 'kills' : sortKey

  const mobileRows: MobileRankRow[] = rows.map(({ entry, rank }) => ({
    key: rowKey(entry),
    rank,
    name: weaponText(entry),
    href: `/members/${entry.memberId}/weapons`,
    subline: `${entry.displayName} · ${formatCount(entry.matchCount)} match${entry.matchCount > 1 ? 's' : ''}`,
    value: METRIC_TEXT[metricKey](entry),
    details: [
      { label: 'Kills', value: METRIC_TEXT.kills(entry) },
      { label: 'Dégâts', value: damageText(entry) },
      { label: 'HS %', value: METRIC_TEXT.headshotRate(entry) },
      { label: 'Précision', value: accuracyText(entry) },
      { label: 'Dist. moy.', value: formatMeters(entry.avgDistance) },
      { label: 'Dist. max', value: maxDistanceText(entry) },
    ],
  }))

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="armory-ranking-title">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="armory-ranking-title" className="text-[17px] font-extrabold text-gray-900">Classement</h2>
        <span className="text-[13px] text-gray-500">
          {formatCount(rows.length)} ligne{rows.length > 1 ? 's' : ''}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="app-panel px-4 py-3 text-sm text-gray-600">Aucune ligne pour cette sélection.</p>
      ) : (
        <>
          <MobileRankList
            rows={mobileRows}
            sortOptions={MOBILE_SORT_OPTIONS}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSort}
            metricLabel={ARMORY_SORT_COLUMNS[metricKey].label}
            linkLabel="Voir ses armes"
          />

          <div className="app-table-shell hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-[13px]">
                <thead className="app-table-head">
                  <tr>
                    <SortableTh align="left" className="pl-3">#</SortableTh>
                    <SortableTh {...th} column="player" align="left">Joueur</SortableTh>
                    <SortableTh {...th} column="weapon" align="left">Arme</SortableTh>
                    <SortableTh {...th} column="kills">Kills</SortableTh>
                    <SortableTh {...th} column="totalDamage">Dégâts</SortableTh>
                    <SortableTh {...th} column="headshotRate" title="Part des kills en headshot">HS %</SortableTh>
                    <SortableTh {...th} column="accuracy" title="Balles qui touchent ; tirs et touches au survol">Précision</SortableTh>
                    <SortableTh {...th} column="avgDistance" title="Distance moyenne des kills" className="hidden lg:table-cell">Dist. moy.</SortableTh>
                    <SortableTh {...th} column="maxDistance" title="Kill le plus lointain">Dist. max</SortableTh>
                    <SortableTh {...th} column="matchCount" className="hidden pr-3 lg:table-cell">Matchs</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(({ entry, rank }) => {
                    const accuracy = accuracyOf(entry)
                    return (
                      <tr key={rowKey(entry)} className={rank <= 3 ? `app-table-row app-table-row--top${rank}` : 'app-table-row'}>
                        <td className="py-2 pl-3 pr-[9px]">
                          <RankCell rank={rank} />
                        </td>
                        <td className="whitespace-nowrap px-[9px] py-2 font-semibold text-gray-900" style={tint('player')}>
                          {entry.displayName}
                        </td>
                        <td className="px-[9px] py-1.5 text-gray-900" style={tint('weapon')}>
                          <span className="flex items-center gap-2.5 whitespace-nowrap">
                            {/* Case de la largeur d'un fusil (silhouette de 20 px de haut) : les noms restent alignés. */}
                            <span className="flex h-7 w-[76px] shrink-0 items-center justify-center">
                              <ArmoryWeaponImage id={entry.weaponName} variant="row" />
                            </span>
                            <span>{weaponText(entry)}</span>
                            {showCategory ? (
                              <span className="text-[11px] font-extrabold text-gray-500">{rowCategory(entry)}</span>
                            ) : null}
                          </span>
                        </td>
                        <td className={cell('kills')} style={tint('kills')}>{formatCount(entry.kills)}</td>
                        <td className={cell('totalDamage')} style={tint('totalDamage')}>{damageText(entry)}</td>
                        <td className={cell('headshotRate')} style={tint('headshotRate')}>{METRIC_TEXT.headshotRate(entry)}</td>
                        <td
                          className={cell('accuracy')}
                          style={tint('accuracy')}
                          title={accuracy === null ? undefined : `${formatCount(entry.hitsLanded)} touches sur ${formatCount(entry.shotsFired)} tirs`}
                        >
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            <span className="h-[5px] w-11 overflow-hidden rounded-full bg-[var(--game-track)]" aria-hidden="true">
                              <span className="armory-share-bar block h-full" style={{ width: `${Math.min(100, accuracy ?? 0)}%` }} />
                            </span>
                            {accuracyText(entry)}
                          </span>
                        </td>
                        <td className={`${cell('avgDistance')} hidden whitespace-nowrap lg:table-cell`} style={tint('avgDistance')}>{formatMeters(entry.avgDistance)}</td>
                        <td className={`${cell('maxDistance')} whitespace-nowrap`} style={tint('maxDistance')}>{maxDistanceText(entry)}</td>
                        <td className={`${cell('matchCount')} hidden pr-3 lg:table-cell`} style={tint('matchCount')}>{formatCount(entry.matchCount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              className="border-t border-gray-200 px-3.5 py-2.5"
              ariaLabel="Pages du classement"
              page={current}
              pageCount={pageCount}
              total={rows.length}
              pageSize={ARMORY_PAGE_SIZE}
              onPageChange={onPageChange}
            />
          </div>
        </>
      )}
    </section>
  )
}
