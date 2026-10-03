'use client'

import { ChevronDown } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import ChevronPager from '@/components/ui/ChevronPager'
import Pagination from '@/components/ui/Pagination'
import RankCell from '@/components/ui/RankCell'
import ShowMoreToggle from '@/components/ui/ShowMoreToggle'
import type { SortDirection } from '@/hooks/useTableSort'
import { DISTINCTION_BADGE_META, type DistinctionBadgeKey } from '@/lib/distinction-badges'
import { paginate } from '@/lib/pagination'

/** Au-delà, « Afficher les N autres » déplierait une liste interminable : la liste se pagine. */
const SHOW_MORE_MAX_ROWS = 15

export type MobileRankRow = {
  key: string | number
  rank: number
  name: string
  href?: string
  distinctions?: DistinctionBadgeKey[]
  /** « 30 matchs · 2,00 K/M · 10,0 % » */
  subline: string
  /** Valeur du critère trié, déjà formatée. */
  value: string
  /** Détails affichés au dépliage (grille de 3 colonnes). */
  details: Array<{ label: string; value: string }>
}

/**
 * Classement sur mobile (docs/ui/composants-refonte.md, `MobileRankList`) : puces « Trier par » (état actif
 * en accent), lignes compactes qui se déplient au toucher, 8 lignes puis « Afficher les N autres » jusqu'à 15 lignes,
 * pagination numérotée au-delà (8 lignes par page, retour à la première page quand le tri ou le contenu change).
 */
export default function MobileRankList<K extends string>({
  rows,
  sortOptions,
  sortKey,
  sortDir,
  onSortChange,
  metricLabel,
  initialVisible = 8,
  linkLabel = 'Voir le joueur',
}: {
  rows: MobileRankRow[]
  sortOptions: Array<{ value: K; label: string }>
  sortKey: K
  sortDir: SortDirection
  onSortChange: (key: K) => void
  metricLabel: string
  initialVisible?: number
  /** Texte du lien de la ligne dépliée (« Voir le clan » pour la ligue). */
  linkLabel?: string
}) {
  const [expanded, setExpanded] = useState<string | number | null>(rows[0]?.key ?? null)
  const [showAll, setShowAll] = useState(false)
  const paginated = rows.length > SHOW_MORE_MAX_ROWS
  // Signature de la liste : la page revient à 1 dès que l'ordre ou le contenu change (tri, filtre, période).
  const signature = useMemo(() => rows.map((row) => String(row.key)).join('|'), [rows])
  const [pageState, setPageState] = useState({ signature, page: 1 })
  const page = pageState.signature === signature ? pageState.page : 1
  const { current, pageCount, visible: pageRows } = paginate(rows, page, initialVisible)
  const visible = paginated ? pageRows : showAll ? rows : rows.slice(0, initialVisible)

  return (
    <div className="md:hidden">
      {/* Pas de défilement horizontal (règle du site) : les puces se paginent par chevrons, 3 par page. */}
      <div className="mb-2 flex flex-col gap-1.5" role="group" aria-label="Trier par">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">Trier par</span>
        <ChevronPager
          ariaLabel="Critères de tri"
          pageSize={3}
          activeKey={sortKey}
          items={sortOptions.map((option) => {
            const active = option.value === sortKey
            return {
              key: option.value,
              node: (
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSortChange(option.value)}
                  className={`app-sort-chip ${active ? 'app-sort-chip--active' : ''}`}
                >
                  {option.label}
                  {active ? <span aria-hidden="true"> {sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                </button>
              ),
            }
          })}
        />
      </div>

      <div className="app-table-shell overflow-hidden">
        {visible.map((row) => {
          const open = expanded === row.key
          return (
            <div key={row.key} className="border-b border-gray-200 last:border-b-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : row.key)}
                className="flex min-h-14 w-full items-center gap-2.5 px-3 py-2.5 text-left"
              >
                <span className="flex w-[30px] shrink-0 justify-center">
                  <RankCell rank={row.rank} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-semibold text-gray-900">
                    <span className="truncate">{row.name}</span>
                    {(row.distinctions ?? []).map((key) => (
                      <Image key={key} src={DISTINCTION_BADGE_META[key].iconPath} alt={DISTINCTION_BADGE_META[key].shortLabel} width={14} height={14} />
                    ))}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">{row.subline}</span>
                </span>
                <span className="text-right">
                  <span className="t-hero t-hero--sm block text-gray-900">{row.value}</span>
                  <span className="t-label t-accent">{metricLabel}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {open ? (
                <div className="pb-3 pl-[52px] pr-3">
                  <div className="grid grid-cols-3 gap-1.5">
                    {row.details.map((detail) => (
                      <div key={detail.label} className="app-panel-muted rounded-lg px-2 py-1.5">
                        <p className="t-label">{detail.label}</p>
                        <p className="text-[13px] font-semibold tabular-nums text-gray-900">{detail.value}</p>
                      </div>
                    ))}
                  </div>
                  {row.href ? (
                    <Link href={row.href} className="mt-2 inline-block text-xs font-semibold text-[var(--theme-ui-accent-text)] hover:underline">
                      {linkLabel}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
        {!paginated && rows.length > initialVisible ? (
          <ShowMoreToggle
            expanded={showAll}
            onToggle={() => setShowAll((current) => !current)}
            moreLabel={`Afficher les ${rows.length - initialVisible} autres`}
            lessLabel="Afficher moins"
            className="mt-0! rounded-none"
          />
        ) : null}
      </div>
      {paginated ? (
        <Pagination
          className="mt-2.5"
          page={current}
          pageCount={pageCount}
          total={rows.length}
          pageSize={initialVisible}
          onPageChange={(next) => setPageState({ signature, page: next })}
          ariaLabel="Pages de la liste du classement"
        />
      ) : null}
    </div>
  )
}
