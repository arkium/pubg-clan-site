'use client'

import type { ReactNode } from 'react'

import type { SortDirection } from '@/hooks/useTableSort'

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

const TH_CLASS = 'whitespace-nowrap px-[9px] py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-500'

/**
 * En-tête de colonne triable (docs/ui/composants-refonte.md, `SortableTh`). Le bouton interne porte le focus
 * clavier ; `aria-sort` annonce l'ordre. Sans `column`, l'en-tête a le même style mais n'est pas triable.
 */
export default function SortableTh<K extends string>({
  column,
  sortKey,
  sortDir,
  onSort,
  align = 'right',
  title,
  className = '',
  children,
}: {
  column?: K
  sortKey?: K
  sortDir?: SortDirection
  onSort?: (key: K) => void
  align?: keyof typeof ALIGN
  title?: string
  className?: string
  children: ReactNode
}) {
  const sortable = column !== undefined && onSort !== undefined
  const active = sortable && column === sortKey
  const ariaSort = !sortable ? undefined : active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'

  return (
    <th scope="col" aria-sort={ariaSort} title={title} className={`${TH_CLASS} ${ALIGN[align]} ${className}`.trim()}>
      {sortable ? (
        <button
          type="button"
          onClick={() => onSort(column)}
          className={`inline-flex items-center gap-1 font-semibold uppercase tracking-[0.04em] ${
            active ? 'text-[var(--theme-ui-accent-text)]' : 'hover:text-gray-900'
          }`}
        >
          {children}
          {active ? <span aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
        </button>
      ) : (
        children
      )}
    </th>
  )
}

/** Rappel du tri, affiché à droite du bandeau docké (`dockedAside`) : un texte, jamais un contrôle. */
export function SortReminder({ label, sortDir }: { label: string; sortDir: SortDirection }) {
  return (
    <span className="whitespace-nowrap text-xs text-gray-500">
      Tri : <b className="font-semibold text-[var(--theme-ui-accent-text)]">{label} {sortDir === 'asc' ? '↑' : '↓'}</b>
    </span>
  )
}
