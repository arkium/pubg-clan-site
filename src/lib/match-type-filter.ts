import type { ClanMatchTypeFilter } from '@/types/squad-matches'

export function parseClanMatchTypeFilter(value: string | null): ClanMatchTypeFilter {
  if (value === 'casual' || value === 'custom' || value === 'all') return value
  return 'official'
}

export function matchTypeMatchesFilter(
  actualMatchType: string,
  filter: 'official' | 'casual' | 'custom'
) {
  if (filter === 'casual') return actualMatchType === 'casual' || actualMatchType === 'airoyale'
  return actualMatchType === filter
}
