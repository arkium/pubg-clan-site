'use client'

import { usePlayerMatches } from './usePlayerDashboard'
import type { DashboardMatchSortDirection, DashboardMatchSortKey, DashboardPeriod } from '@/types/dashboard'

/**
 * Hook to fetch and paginate a player's match history.
 * Returns matches, totalCount, loading, and error.
 */
export function useMatchHistory(
  memberId: number | null,
  period: DashboardPeriod,
  limit: number,
  offset: number,
  sortBy: DashboardMatchSortKey = 'pubgCreatedAt',
  sortDirection: DashboardMatchSortDirection = 'desc'
) {
  const { data, loading, error } = usePlayerMatches(memberId, period, limit, offset, sortBy, sortDirection)

  return {
    matches: data.matches,
    totalCount: data.totalCount,
    loading,
    error,
  }
}
