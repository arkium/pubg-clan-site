'use client'

import { useEffect, useState } from 'react'

type TopPerformer = {
  memberId: number
  displayName: string
  value: number
  matchesPlayed: number
} | null

export type ClanOverviewStats = {
  syncedAt: string
  pubg: {
    shard: string
    clanId: string
    name: string
    tag: string
    memberCount: number | null
  } | null
  tracked: {
    membersCount: number
    aggregated: {
      totalKills: number
      totalDamage: number
      totalAssists: number
      totalRevives: number
      matchesPlayed: number
      matchesWon: number
      winRate: number
    }
    topPerformers: {
      kills: TopPerformer
      damage: TopPerformer
      winRate: TopPerformer
    }
  } | null
} | null

export type RosterMember = {
  id: number
  displayName: string
  pubgPlayerName: string
  pubgAccountId: string | null
  role: string
  joinedAt: string
  hasAccount: boolean
  lastRefreshedAt: string | null
}

export type ClanOverview = {
  clan: {
    id: number
    name: string
    tag: string
    pubgClanId: string | null
    platformShard: string
  }
  clanStats: ClanOverviewStats
  roster: RosterMember[]
}

export function useClanOverview(clanId: number | null) {
  const [data, setData] = useState<ClanOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clanId) return

    let cancelled = false

    async function fetchOverview() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`/api/clans/${clanId}/overview`)
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload?.error ?? 'Failed to fetch clan overview')
        }

        if (!cancelled) {
          setData(payload as ClanOverview)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch clan overview')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchOverview()

    return () => {
      cancelled = true
    }
  }, [clanId])

  return { data, loading, error }
}
