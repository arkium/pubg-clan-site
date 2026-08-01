import type {
  DropPressureRankingEntry,
  DropPressureRankingSortKey,
} from '@/types/drop-pressure'

function rankingValue(entry: DropPressureRankingEntry, sortKey: DropPressureRankingSortKey) {
  return entry[sortKey] ?? -1
}

export function sortDropPressureRanking(
  entries: DropPressureRankingEntry[],
  sortKey: DropPressureRankingSortKey,
  direction: 'asc' | 'desc' = 'desc'
) {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...entries].sort((left, right) => {
    const difference = rankingValue(left, sortKey) - rankingValue(right, sortKey)
    if (difference !== 0) return difference * multiplier
    if (right.dropCount !== left.dropCount) return right.dropCount - left.dropCount
    return left.displayName.localeCompare(right.displayName, 'fr')
  })
}