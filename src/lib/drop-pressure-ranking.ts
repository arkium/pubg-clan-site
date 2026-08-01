import type {
  DropPressureRankingEntry,
  DropPressureRankingSortKey,
} from '@/types/drop-pressure'

export function sortDropPressureRanking(
  entries: DropPressureRankingEntry[],
  sortKey: DropPressureRankingSortKey,
  direction: 'asc' | 'desc' = 'desc'
) {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...entries].sort((left, right) => {
    const leftValue = left[sortKey]
    const rightValue = right[sortKey]
    if (leftValue === null && rightValue !== null) return 1
    if (rightValue === null && leftValue !== null) return -1
    const difference = (leftValue ?? 0) - (rightValue ?? 0)
    if (difference !== 0) return difference * multiplier
    if (right.dropCount !== left.dropCount) return right.dropCount - left.dropCount
    return left.displayName.localeCompare(right.displayName, 'fr')
  })
}

export function getDropPressureRankingDisplay(
  sortedEntries: DropPressureRankingEntry[],
  currentMemberId?: number,
  limit = 5
) {
  const normalizedLimit = Math.max(1, Math.floor(limit))
  const topEntries = sortedEntries.slice(0, normalizedLimit).map((entry, index) => ({
    entry,
    rank: index + 1,
  }))
  const currentMemberIndex = currentMemberId
    ? sortedEntries.findIndex((entry) => entry.memberId === currentMemberId)
    : -1

  return {
    topEntries,
    pinnedEntry: currentMemberIndex >= normalizedLimit
      ? { entry: sortedEntries[currentMemberIndex]!, rank: currentMemberIndex + 1 }
      : null,
  }
}