'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { paginationItems } from '@/lib/pagination'

/**
 * Pagination numérotée ‹ 1 2 … 9 › avec « Lignes 9–16 sur 42 ». État actif en accent (`app-pager-button--active`).
 * Rien n'est rendu quand tout tient sur une page. Règle du site : une liste longue se pagine au lieu de défiler.
 */
export default function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  ariaLabel,
  itemLabel = 'Lignes',
  className = '',
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  ariaLabel: string
  /** « Lignes », « Objets », « Membres »… */
  itemLabel?: string
  className?: string
}) {
  if (pageCount <= 1) return null
  const start = (page - 1) * pageSize
  return (
    <nav
      className={`flex flex-wrap items-center justify-between gap-2.5 text-xs text-gray-500 ${className}`.trim()}
      aria-label={ariaLabel}
    >
      <span className="tabular-nums">
        {itemLabel} {start + 1}–{Math.min(start + pageSize, total)} sur {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="app-pager-button" onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Page précédente">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        {paginationItems(page, pageCount).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} className="px-1" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={item === page ? 'page' : undefined}
              className={`app-pager-button ${item === page ? 'app-pager-button--active' : ''}`}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          className="app-pager-button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === pageCount}
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
