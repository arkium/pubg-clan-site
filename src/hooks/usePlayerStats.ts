'use client'

import { usePlayerDashboard } from './usePlayerDashboard'
import type { DashboardPeriod } from '@/types/dashboard'

/**
 * Hook to fetch and cache player stats for a given period.
 * Returns stats, clanAverage, progression, topPerformances, squads, loading, and error.
 */
export function usePlayerStats(memberId: number | null, period: DashboardPeriod) {
  const { data, loading, error } = usePlayerDashboard(memberId, period)

  return {
    stats: data.stats,
    clanAverage: data.clanAverage,
    progression: data.progression,
    topPerformances: data.topPerformances,
    squads: data.squads,
    member: data.member,
    loading,
    error,
  }
}
