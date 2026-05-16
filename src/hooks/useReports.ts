'use client'

import { useEffect, useMemo, useState } from 'react'

import type { ReportFilterType, ReportListResponse } from '@/types/reports'

const defaultData: ReportListResponse = {
  reports: [],
  totalCount: 0,
}

const reportsCache = new Map<string, ReportListResponse>()

function buildCacheKey(clanId: number, type: ReportFilterType, limit: number, offset: number) {
  return `${clanId}:${type}:${limit}:${offset}`
}

export function useReports(
  clanId: number | null,
  type: ReportFilterType,
  limit = 10,
  offset = 0
) {
  const [data, setData] = useState<ReportListResponse>(defaultData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cacheKey = useMemo(() => {
    if (!clanId) return null
    return buildCacheKey(clanId, type, limit, offset)
  }, [clanId, limit, offset, type])

  useEffect(() => {
    if (!clanId || !cacheKey) {
      return
    }

    const resolvedCacheKey = cacheKey
    let cancelled = false

    async function fetchReports() {
      try {
        setLoading(true)
        setError('')

        const cached = reportsCache.get(resolvedCacheKey)
        if (cached) {
          if (!cancelled) {
            setData(cached)
            setLoading(false)
          }
          return
        }

        const params = new URLSearchParams({
          type,
          limit: String(limit),
          offset: String(offset),
        })
        const response = await fetch(`/api/clans/${clanId}/reports?${params.toString()}`)
        const payload = (await response.json()) as ReportListResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error : 'Failed to fetch reports')
        }

        if (!cancelled) {
          const resolved = payload as ReportListResponse
          reportsCache.set(resolvedCacheKey, resolved)
          setData(resolved)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch reports')
          setData(defaultData)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchReports()

    return () => {
      cancelled = true
    }
  }, [cacheKey, clanId, limit, offset, type])

  return {
    reports: clanId ? data.reports : [],
    totalCount: clanId ? data.totalCount : 0,
    loading: clanId ? loading : false,
    error: clanId ? error : '',
  }
}
