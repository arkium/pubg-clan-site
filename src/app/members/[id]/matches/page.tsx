'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { History } from 'lucide-react'

import MatchHistory from '@/components/dashboard/MatchHistory'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { STANDARD_PERIODS, type StandardPeriod } from '@/lib/period'
import type {
  DashboardMatchSortDirection,
  DashboardMatchSortKey,
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
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period: historyPeriod, setPeriod: setHistoryPeriod, ready: periodReady } = usePagePeriod(
    STANDARD_PERIODS,
    'week'
  )
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
    if (!memberId || !periodReady) {
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
    periodReady,
  ])

  function changePeriod(value: StandardPeriod) {
    setHistoryPeriod(value)
    setHistoryOffset(0)
  }

  function changeDate(value: string) {
    setHistoryDate(value)
    setHistoryOffset(0)
  }

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <NavigationTrail
          currentLabel="Matchs"
          currentHref={`/members`}
          fallbackParent={{ href: `/members`, label: 'Membres' }}
        />
        <p className="mt-4 text-sm text-red-600">ID joueur invalide.</p>
      </div>
    )
  }

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter space-y-6">
        <NavigationTrail
          currentLabel="Matchs récents"
          currentHref={`/members/${memberId}/matches`}
          fallbackParent={{ href: `/members/${memberId}/dashboard`, label: 'Dashboard', altHref: '/members' }}
        />
        <MemberPageHeader
          title="Matchs"
          subtitle="Historique des matchs, avec tri et filtres par periode."
          showBackButton={false}
          backgroundImage="/matchesplayer.jpg"
          icon={<History className="h-4 w-4 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />}
        />
      </div>

      <DockingToolbar ariaLabel="Filtres de l'historique des matchs">
        {({ compact }) => (
          <>
            <PeriodFilter periods={STANDARD_PERIODS} value={historyPeriod} onChange={changePeriod} />
            {!compact ? (
              <div className="flex items-center gap-2 sm:ml-auto">
                <input
                  type="date"
                  value={historyDate}
                  onChange={(event) => changeDate(event.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
                  aria-label="Filtrer par date exacte"
                />
                {historyDate ? (
                  <button
                    type="button"
                    onClick={() => changeDate('')}
                    className="text-xs text-gray-500 underline hover:text-gray-700"
                  >
                    Effacer
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter space-y-6">
        <section className="app-panel overflow-hidden">
          <div className="border-t border-slate-200">
            <MatchHistory
              matches={historyData.matches}
              totalCount={historyData.totalCount}
              mapLabels={historyData.mapLabels}
              title="Tes dernieres parties"
              subtitle="Revis ton historique."
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
    </div>
  )
}