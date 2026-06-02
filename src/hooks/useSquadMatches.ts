'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ClanMatchesResponse, SquadPeriod } from '@/types/squad-matches'

const defaultData: ClanMatchesResponse = {
  clanId: 0,
  clanName: '',
  period: 'week',
  availableModes: [],
  mapLabels: {},
  squads: [],
  stats: {
    totalKills: 0,
    totalDamage: 0,
    winRate: 0,
    matchCount: 0,
  },
  modePerformance: [],
  sessions: [],
  synergies: {
    topPairs: [],
    topSquads: [],
  },
  topPerformers: {
    kills: [],
    damage: [],
    survival: [],
  },
}

const squadMatchesCache = new Map<string, ClanMatchesResponse>()

function buildCacheKey(clanId: number, period: SquadPeriod, gameMode?: string) {
  return `${clanId}:${period}:${gameMode ?? ''}`
}

export function useSquadMatches(clanId: number | null, period: SquadPeriod, gameMode?: string) {
  const [data, setData] = useState<ClanMatchesResponse>(defaultData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const cacheKey = useMemo(() => {
    if (!clanId) {
      return null
    }

    return buildCacheKey(clanId, period, gameMode)
  }, [clanId, period, gameMode])

  const refresh = useCallback(() => {
    if (!clanId) {
      return
    }

    const clanPrefix = `${clanId}:`
    for (const key of Array.from(squadMatchesCache.keys())) {
      if (key.startsWith(clanPrefix)) {
        squadMatchesCache.delete(key)
      }
    }

    setRefreshToken((current) => current + 1)
  }, [clanId])

  useEffect(() => {
    if (!clanId || !cacheKey) {
      return
    }

    const resolvedCacheKey = cacheKey
    let cancelled = false

    async function fetchSquadMatches() {
      try {
        setLoading(true)
        setError('')

        const cached = squadMatchesCache.get(resolvedCacheKey)
        if (cached) {
          if (!cancelled) {
            setData(cached)
            setLoading(false)
          }
          return
        }

        const params = new URLSearchParams({ period })
        if (gameMode) {
          params.set('gameMode', gameMode)
        }

        const response = await fetch(`/api/clans/${clanId}/matches?${params.toString()}`)
        const payload = (await response.json()) as ClanMatchesResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error : 'Failed to fetch squad matches')
        }

        if (!cancelled) {
          const resolved = payload as ClanMatchesResponse
          squadMatchesCache.set(resolvedCacheKey, resolved)
          setData(resolved)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error ? fetchError.message : 'Failed to fetch squad matches'
          )
          setData(defaultData)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchSquadMatches()

    return () => {
      cancelled = true
    }
  }, [cacheKey, clanId, gameMode, period, refreshToken])

  return {
    clanName: clanId ? data.clanName : '',
    availableModes: clanId ? data.availableModes : [],
    mapLabels: clanId ? data.mapLabels : {},
    squads: clanId ? data.squads : [],
    stats: clanId ? data.stats : defaultData.stats,
    modePerformance: clanId ? (data.modePerformance ?? []) : [],
    sessions: clanId ? data.sessions : [],
    synergies: clanId ? data.synergies : defaultData.synergies,
    topPerformers: clanId ? data.topPerformers : defaultData.topPerformers,
    loading: clanId ? loading : false,
    error: clanId ? error : '',
    refresh,
  }
}
