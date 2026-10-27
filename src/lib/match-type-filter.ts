import type { ClanMatchTypeFilter } from '@/types/squad-matches'

export function parseClanMatchTypeFilter(value: string | null): ClanMatchTypeFilter {
  if (value === 'competitive' || value === 'casual' || value === 'custom' || value === 'all') return value
  return 'official'
}

/**
 * Filtre « Type de partie » d'une page joueur (docs/TODO/aide-des-pages.md, lot 7) : `fallback` (le comportement de la
 * page avant le filtre) quand le paramètre manque ou est inconnu.
 */
export function parsePlayerMatchType(value: string | null, fallback: ClanMatchTypeFilter): ClanMatchTypeFilter {
  return value === 'official' || value === 'competitive' || value === 'casual' || value === 'custom' || value === 'all' ? value : fallback
}

/** Valeurs de `matchType` couvertes par un filtre ; `null` pour « Tous ». Casual comprend les lobbies de bots. */
export function matchTypeValues(filter: ClanMatchTypeFilter): string[] | null {
  if (filter === 'all') return null
  return filter === 'casual' ? ['casual', 'airoyale'] : [filter]
}

/** Clause Prisma sur `matchType` (`Match` comme `SquadMatch`) : rien pour « Tous ». */
export function matchTypeWhere(filter: ClanMatchTypeFilter): { matchType?: string | { in: string[] } } {
  const values = matchTypeValues(filter)
  if (!values) return {}
  return values.length === 1 ? { matchType: values[0] } : { matchType: { in: values } }
}

export function matchTypeMatchesFilter(
  actualMatchType: string,
  filter: 'official' | 'competitive' | 'casual' | 'custom'
) {
  if (filter === 'casual') return actualMatchType === 'casual' || actualMatchType === 'airoyale'
  return actualMatchType === filter
}
