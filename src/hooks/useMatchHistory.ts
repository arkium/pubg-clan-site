'use client'

import { usePlayerMatches } from './usePlayerDashboard'
import type { DashboardPeriod } from '@/types/dashboard'

/**
 * Hook to fetch and paginate a player's match history.
 * Returns matches, totalCount, loading, and error.
 */
export function useMatchHistory(
  memberId: number | null,
  period: DashboardPeriod,
  limit: number,
  offset: number
) {
  const { data, loading, error } = usePlayerMatches(memberId, period, limit, offset)

  return {
    matches: data.matches,
    totalCount: data.totalCount,
    loading,
    error,
  }
}
