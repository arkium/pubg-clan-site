'use client'

import { useState } from 'react'

export type SortDirection = 'asc' | 'desc'

/**
 * Tri d'un tableau par clic sur l'en-tête (docs/TODO/refonte-ui.md §3) : une nouvelle colonne trie par
 * ordre décroissant, un second clic sur la même colonne inverse l'ordre. `firstDirection` change le premier
 * sens d'une colonne (une colonne de texte — joueur, arme — commence en croissant, de A à Z).
 */
export function useTableSort<K extends string>(
  initialKey: K,
  initialDirection: SortDirection = 'desc',
  firstDirection: (key: K) => SortDirection = () => 'desc'
) {
  const [state, setState] = useState<{ key: K; direction: SortDirection }>({ key: initialKey, direction: initialDirection })

  function onSort(key: K) {
    setState((current) =>
      current.key === key
        ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: firstDirection(key) }
    )
  }

  /** Teinte de la colonne triée, à poser sur son `<col>`. */
  function colTint(key: K) {
    return key === state.key ? 'var(--theme-ui-accent-tint)' : 'transparent'
  }

  return { sortKey: state.key, sortDir: state.direction, onSort, colTint, setSort: setState }
}
