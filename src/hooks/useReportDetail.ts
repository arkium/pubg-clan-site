'use client'

import { useEffect, useMemo, useState } from 'react'

import type { ReportDetailResponse } from '@/types/reports'

const defaultData: ReportDetailResponse = {
  report: {
    id: '',
    clanId: 0,
    clanName: '',
    type: 'weekly',
    periodStart: new Date(0).toISOString(),
    periodEnd: new Date(0).toISOString(),
    totalMatches: 0,
    totalKills: 0,
    totalDamage: 0,
    avgTeamSize: 0,
    avgWinRate: 0,
    createdAt: new Date(0).toISOString(),
    highlights: {
      topKiller: null,
      topDamage: null,
      bestWinRate: null,
      mvp: null,
    },
    playerStats: [],
  },
  sections: [],
  insights: [],
}

const detailCache = new Map<string, ReportDetailResponse>()

function buildCacheKey(clanId: number, reportId: string) {
  return `${clanId}:${reportId}`
}

export function useReportDetail(clanId: number | null, reportId: string | null) {
  const [data, setData] = useState<ReportDetailResponse>(defaultData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cacheKey = useMemo(() => {
    if (!clanId || !reportId) return null
    return buildCacheKey(clanId, reportId)
  }, [clanId, reportId])

  useEffect(() => {
    if (!clanId || !reportId || !cacheKey) {
      return
    }

    const resolvedCacheKey = cacheKey
    let cancelled = false

    async function fetchReportDetail() {
      try {
        setLoading(true)
        setError('')

        const cached = detailCache.get(resolvedCacheKey)
        if (cached) {
          if (!cancelled) {
            setData(cached)
            setLoading(false)
          }
          return
        }

        const response = await fetch(`/api/clans/${clanId}/reports/${reportId}`)
        const payload = (await response.json()) as ReportDetailResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error : 'Failed to fetch report detail')
        }

        if (!cancelled) {
          const resolved = payload as ReportDetailResponse
          detailCache.set(resolvedCacheKey, resolved)
          setData(resolved)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error ? fetchError.message : 'Failed to fetch report detail'
          )
          setData(defaultData)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchReportDetail()

    return () => {
      cancelled = true
    }
  }, [cacheKey, clanId, reportId])

  return {
    report: data.report,
    sections: data.sections,
    insights: data.insights,
    loading: clanId && reportId ? loading : false,
    error: clanId && reportId ? error : '',
  }
}
