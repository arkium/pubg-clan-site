'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { paginate } from '@/lib/pagination'

/**
 * Rangée d'éléments (puces, cartes) paginée par chevrons ‹ › au lieu d'un défilement horizontal (règle du site).
 * Sur mobile, `pageSize` éléments à la fois, qui passent à la ligne si besoin ; à partir de `sm`, tout est affiché et
 * passe à la ligne. `tone="dark"` pour un fond d'image (bandeau), sinon les boutons de pagination du thème.
 */
export default function ChevronPager({
  items,
  pageSize,
  ariaLabel,
  tone = 'theme',
  className = '',
  activeKey,
}: {
  items: Array<{ key: string; node: ReactNode }>
  pageSize: number
  ariaLabel: string
  tone?: 'theme' | 'dark'
  className?: string
  /** Élément sélectionné : la page qui le contient s'ouvre en premier. */
  activeKey?: string
}) {
  const [page, setPage] = useState(() => {
    const index = activeKey ? items.findIndex((item) => item.key === activeKey) : -1
    return index > 0 ? Math.floor(index / pageSize) + 1 : 1
  })
  const { current, pageCount, visible } = paginate(items, page, pageSize)
  const button =
    tone === 'dark'
      ? 'grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-white/20 bg-slate-950/55 text-white backdrop-blur-md transition hover:bg-slate-950/75 disabled:opacity-35'
      : 'app-pager-button shrink-0'

  return (
    <nav aria-label={ariaLabel} className={className}>
      <div className="hidden flex-wrap gap-1.5 sm:flex">
        {items.map((item) => (
          <span key={item.key} className="contents">
            {item.node}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1.5 sm:hidden">
        {pageCount > 1 ? (
          <button type="button" className={button} onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Éléments précédents">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-live="polite">
          {visible.map((item) => (
            <span key={item.key} className="contents">
              {item.node}
            </span>
          ))}
        </div>
        {pageCount > 1 ? (
          <button type="button" className={button} onClick={() => setPage(current + 1)} disabled={current === pageCount} aria-label="Éléments suivants">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        {pageCount > 1 ? (
          <span className="sr-only">
            Page {current} sur {pageCount}
          </span>
        ) : null}
      </div>
    </nav>
  )
}
