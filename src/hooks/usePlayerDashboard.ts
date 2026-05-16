'use client'

import { useEffect, useState } from 'react'

import type { DashboardPeriod, DashboardResponse, MatchesResponse } from '@/types/dashboard'

const defaultDashboard: DashboardResponse = {
  member: { id: 0, displayName: '', pubgPlayerName: '', platformShard: '', createdAt: '' },
  stats: null,
  clanAverage: null,
  progression: [],
  topPerformances: [],
  squads: [],
  period: 'week',
}

const defaultMatches: MatchesResponse = {
  matches: [],
  totalCount: 0,
}

export function usePlayerDashboard(memberId: number | null, period: DashboardPeriod) {
  const [data, setData] = useState<DashboardResponse>(defaultDashboard)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!memberId) return
    let cancelled = false

    async function fetchDashboard() {
      try {
        setLoading(true)
        setError('')
        const params = new URLSearchParams({ period })
        const response = await fetch(`/api/members/${memberId}/dashboard?${params.toString()}`)
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to fetch dashboard')
        }

        if (!cancelled) setData(payload as DashboardResponse)
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch dashboard')
          setData(defaultDashboard)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchDashboard()
    return () => {
      cancelled = true
    }
  }, [memberId, period])

  return { data, loading, error }
}

export function usePlayerMatches(
  memberId: number | null,
  period: DashboardPeriod,
  limit: number,
  offset: number
) {
  const [data, setData] = useState<MatchesResponse>(defaultMatches)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!memberId) return
    let cancelled = false

    async function fetchMatches() {
      try {
        setLoading(true)
        setError('')
        const params = new URLSearchParams({
          period,
          limit: String(limit),
          offset: String(offset),
        })
        const response = await fetch(`/api/members/${memberId}/matches?${params.toString()}`)
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to fetch matches')
        }

        if (!cancelled) setData(payload as MatchesResponse)
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch matches')
          setData(defaultMatches)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchMatches()
    return () => {
      cancelled = true
    }
  }, [memberId, period, limit, offset])

  return { data, loading, error }
}
