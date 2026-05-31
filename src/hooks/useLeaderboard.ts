'use client'

import { useEffect, useMemo, useState } from 'react'

import type {
  LeaderboardKillsView,
  LeaderboardPeriod,
  LeaderboardResponse,
  LeaderboardSortBy,
} from '@/types/leaderboard'

const defaultHighlights: LeaderboardResponse['highlights'] = {
  topKiller: null,
  topDamage: null,
  bestWinRate: null,
  mvp: null,
}

const defaultData: LeaderboardResponse = {
  clanId: 0,
  period: 'week',
  sortBy: 'kills',
  lastUpdatedAt: null,
  leaderboard: [],
  highlights: defaultHighlights,
  progression: [],
}

const leaderboardCache = new Map<string, LeaderboardResponse>()

function buildCacheKey(
  clanId: number,
  period: LeaderboardPeriod,
  sortBy: LeaderboardSortBy,
  killsView: LeaderboardKillsView
) {
  return `v3:${clanId}:${period}:${sortBy}:${killsView}`
}

export function useLeaderboard(
  clanId: number | null,
  period: LeaderboardPeriod,
  sortBy: LeaderboardSortBy,
  killsView: LeaderboardKillsView
) {
  const [data, setData] = useState<LeaderboardResponse>(defaultData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cacheKey = useMemo(() => {
    if (!clanId) return null
    return buildCacheKey(clanId, period, sortBy, killsView)
  }, [clanId, period, sortBy, killsView])

  useEffect(() => {
    if (!clanId || !cacheKey) return

    const resolvedCacheKey = cacheKey
    let cancelled = false

    async function fetchLeaderboard() {
      try {
        setLoading(true)
        setError('')

        const cached = leaderboardCache.get(resolvedCacheKey)
        if (cached) {
          if (!cancelled) {
            setData(cached)
            setLoading(false)
          }
          return
        }

        const params = new URLSearchParams({ period, sortBy, killsView })
        const response = await fetch(`/api/clans/${clanId}/leaderboard?${params.toString()}`)
        const payload = (await response.json()) as LeaderboardResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error : 'Failed to fetch leaderboard')
        }

        if (!cancelled) {
          const resolved = payload as LeaderboardResponse
          leaderboardCache.set(resolvedCacheKey, resolved)
          setData(resolved)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error ? fetchError.message : 'Failed to fetch leaderboard'
          )
          setData(defaultData)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchLeaderboard()

    return () => {
      cancelled = true
    }
  }, [cacheKey, clanId, period, sortBy, killsView])

  return {
    leaderboard: clanId ? data.leaderboard : [],
    highlights: clanId ? data.highlights : defaultHighlights,
    progression: clanId ? data.progression : [],
    lastUpdatedAt: clanId ? data.lastUpdatedAt : null,
    loading: clanId ? loading : false,
    error: clanId ? error : '',
  }
}
