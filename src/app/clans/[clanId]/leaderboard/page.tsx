'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import Leaderboard from '@/components/Leaderboard'
import LeaderboardStats from '@/components/LeaderboardStats'
import ProgressionChart from '@/components/ProgressionChart'
import { useLeaderboard } from '@/hooks/useLeaderboard'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type { LeaderboardPeriod, LeaderboardSortBy } from '@/types/leaderboard'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  week: 'Semaine',
  month: 'Mois',
  all: 'All Time',
}

export default function LeaderboardPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const [period, setPeriod] = useState<LeaderboardPeriod>('week')
  const [sortBy, setSortBy] = useState<LeaderboardSortBy>('kills')
  const [chartMetric, setChartMetric] = useState<LeaderboardSortBy>('kills')

  const { leaderboard, highlights, progression, loading, error } = useLeaderboard(
    clanId,
    period,
    sortBy
  )

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  if (!clanId) return null

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Classement du clan</h1>
          <p className="text-sm text-gray-600">
            Performances individuelles par période.
          </p>
        </div>
        <Link
          href={`/clans/${clanId}/matches`}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Matchs ensemble
        </Link>
      </div>

      {/* Period selector */}
      <div className="mb-6 rounded border border-gray-200 bg-white p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Période</p>
        <div className="flex rounded border border-gray-200 p-1">
          {(['week', 'month', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                value === period
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {PERIOD_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mb-6 text-sm text-gray-600">Chargement du classement...</p>
      ) : null}
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <div className="space-y-6">
          <LeaderboardStats highlights={highlights} />

          <Leaderboard
            entries={leaderboard}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />

          <ProgressionChart
            progression={progression}
            metric={chartMetric}
            onMetricChange={setChartMetric}
          />
        </div>
      ) : null}
    </main>
  )
}
