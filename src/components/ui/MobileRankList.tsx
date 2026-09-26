'use client'

import { ChevronDown } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import RankCell from '@/components/ui/RankCell'
import ShowMoreToggle from '@/components/ui/ShowMoreToggle'
import type { SortDirection } from '@/hooks/useTableSort'
import { DISTINCTION_BADGE_META, type DistinctionBadgeKey } from '@/lib/distinction-badges'

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
 * en accent), lignes compactes qui se déplient au toucher, 8 lignes puis « Afficher les N autres ».
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
  const visible = showAll ? rows : rows.slice(0, initialVisible)

  return (
    <div className="md:hidden">
      <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Trier par">
        <span className="shrink-0 pr-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">Trier par</span>
        {sortOptions.map((option) => {
          const active = option.value === sortKey
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onSortChange(option.value)}
              className={`app-sort-chip ${active ? 'app-sort-chip--active' : ''}`}
            >
              {option.label}
              {active ? <span aria-hidden="true"> {sortDir === 'asc' ? '↑' : '↓'}</span> : null}
            </button>
          )
        })}
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
                  <span className="block text-[17px] font-bold leading-none tabular-nums text-gray-900">{row.value}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--theme-ui-accent)]">{metricLabel}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {open ? (
                <div className="pb-3 pl-[52px] pr-3">
                  <div className="grid grid-cols-3 gap-1.5">
                    {row.details.map((detail) => (
                      <div key={detail.label} className="app-panel-muted rounded-lg px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-[0.04em] text-gray-500">{detail.label}</p>
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
        {rows.length > initialVisible ? (
          <ShowMoreToggle
            expanded={showAll}
            onToggle={() => setShowAll((current) => !current)}
            moreLabel={`Afficher les ${rows.length - initialVisible} autres`}
            lessLabel="Afficher moins"
            className="mt-0! rounded-none"
          />
        ) : null}
      </div>
    </div>
  )
}
