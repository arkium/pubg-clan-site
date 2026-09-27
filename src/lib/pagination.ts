/**
 * Pagination des listes et tableaux (`Pagination`, src/components/ui/Pagination.tsx). Règle du site : une liste trop
 * longue se pagine, elle ne défile jamais horizontalement ni sans fin.
 */

/** Numéros de page à afficher : première, dernière, la courante et ses voisines ; `'gap'` pour « … ». */
export function paginationItems(page: number, pageCount: number, siblings = 1): Array<number | 'gap'> {
  const items: Array<number | 'gap'> = []
  for (let index = 1; index <= pageCount; index++) {
    if (index === 1 || index === pageCount || Math.abs(index - page) <= siblings) items.push(index)
    else if (items[items.length - 1] !== 'gap') items.push('gap')
  }
  return items
}

/** Page affichée d'une liste : page ramenée dans les bornes, éléments visibles, rang du premier. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  const start = (current - 1) * pageSize
  return { current, pageCount, start, visible: items.slice(start, start + pageSize) }
}
