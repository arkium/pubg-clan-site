'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { History } from 'lucide-react'

import MatchHistory from '@/components/dashboard/MatchHistory'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import type {
  DashboardMatchSortDirection,
  DashboardMatchSortKey,
  DashboardPeriod,
  MatchesResponse,
} from '@/types/dashboard'

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function MatchesPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  const HISTORY_LIMIT = 10

  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState('')
  const [historyPeriod, setHistoryPeriod] = useState<DashboardPeriod>('week')
  const [historyDate, setHistoryDate] = useState('')
  const [historyOffset, setHistoryOffset] = useState(0)
  const [historySortKey, setHistorySortKey] = useState<DashboardMatchSortKey>('pubgCreatedAt')
  const [historySortDir, setHistorySortDir] = useState<DashboardMatchSortDirection>('desc')
  const [historyData, setHistoryData] = useState<MatchesResponse>({
    matches: [],
    totalCount: 0,
    mapLabels: {},
  })

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadImportedHistory() {
      try {
        setLoadingHistory(true)

        const params = new URLSearchParams({
          period: historyPeriod,
          limit: String(HISTORY_LIMIT),
          offset: String(historyOffset),
          sortBy: historySortKey,
          sortDirection: historySortDir,
          ...(historyDate ? { date: historyDate } : {}),
        })
        const response = await fetch(`/api/members/${memberId}/matches?${params.toString()}`)
        const payload = (await response.json()) as MatchesResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error : 'Impossible de charger les matchs importes')
        }

        if (!cancelled) {
          setHistoryData(payload as MatchesResponse)
        }
      } catch (historyError) {
        if (!cancelled) {
          setError(historyError instanceof Error ? historyError.message : 'Impossible de charger les matchs importes')
        }
      } finally {
        if (!cancelled) {
          setLoadingHistory(false)
        }
      }
    }

    void loadImportedHistory()

    return () => {
      cancelled = true
    }
  }, [
    HISTORY_LIMIT,
    historyDate,
    historyOffset,
    historyPeriod,
    historySortDir,
    historySortKey,
    memberId,
  ])


  if (!memberId) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">ID joueur invalide.</p>
      </main>
    )
  }

  return (
    <main className="app-page-surface min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <MemberPageHeader
          title="Matchs"
          subtitle="Historique des matchs, avec tri et filtres par periode."
          showBackButton={false}
          backgroundImage="/matchesplayer.jpg"
          icon={<History className="h-4 w-4 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />}
        />

        <section className="app-panel overflow-hidden">
          <div className="border-t border-slate-200">
            <MatchHistory
              matches={historyData.matches}
              totalCount={historyData.totalCount}
              mapLabels={historyData.mapLabels}
              title="Tes dernieres parties"
              subtitle="Revis ton historique."
              period={historyPeriod}
              onPeriodChange={(value) => {
                setHistoryPeriod(value)
                setHistoryOffset(0)
              }}
              date={historyDate}
              onDateChange={setHistoryDate}
              limit={HISTORY_LIMIT}
              offset={historyOffset}
              onOffsetChange={setHistoryOffset}
              sortKey={historySortKey}
              sortDir={historySortDir}
              onSortChange={(nextSortKey, nextSortDir) => {
                setHistorySortKey(nextSortKey)
                setHistorySortDir(nextSortDir)
                setHistoryOffset(0)
              }}
              loading={loadingHistory}
              unframed
            />
          </div>
        </section>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

      </div>
    </main>
  )
}