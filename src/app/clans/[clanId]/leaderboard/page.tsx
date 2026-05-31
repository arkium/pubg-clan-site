'use client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import Leaderboard from '@/components/Leaderboard'
import LeaderboardStats from '@/components/LeaderboardStats'
import ClanSectionNav from '@/components/ClanSectionNav'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useLeaderboard } from '@/hooks/useLeaderboard'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type { LeaderboardKillsView, LeaderboardPeriod, LeaderboardSortBy } from '@/types/leaderboard'

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

const PERIOD_OPTIONS = (Object.entries(PERIOD_LABELS) as [LeaderboardPeriod, string][]).map(([value, label]) => ({
  value,
  label,
}))

const KILLS_VIEW_LABELS: Record<LeaderboardKillsView, string> = {
  clan: 'Clan',
  withSolo: 'Inclus Solo',
}

const KILLS_VIEW_OPTIONS = (Object.entries(KILLS_VIEW_LABELS) as [LeaderboardKillsView, string][]).map(
  ([value, label]) => ({
    value,
    label,
  })
)

function formatLastUpdated(value: string | null) {
  if (!value) {
    return 'Classement calculé en direct depuis les matchs de la période sélectionnée. Derniers matchs récupérés : horodatage indisponible.'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Classement calculé en direct depuis les matchs de la période sélectionnée. Derniers matchs récupérés : horodatage indisponible.'
  }

  return `Classement calculé en direct depuis les matchs de la période sélectionnée. Derniers matchs récupérés au ${date.toLocaleString('fr-FR')}.`
}

export default function LeaderboardPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const [period, setPeriod] = useState<LeaderboardPeriod>('week')
  const [sortBy, setSortBy] = useState<LeaderboardSortBy>('kills')
  const [killsView, setKillsView] = useState<LeaderboardKillsView>('clan')

  const { leaderboard, progression, lastUpdatedAt, loading, error } = useLeaderboard(
    clanId,
    period,
    sortBy,
    killsView
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
      <header className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Classement du clan</h1>
            <p className="text-sm text-gray-600">
              Performances individuelles par période.
            </p>
            <p className="mt-1 text-xs text-gray-500">{formatLastUpdated(lastUpdatedAt)}</p>
            <ClanSectionNav clanId={clanId} />
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="mb-6 rounded border border-gray-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Période</p>
            <SegmentedControl
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              size="sm"
              fullWidthOnMobile
              className="w-full sm:w-auto"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Mode de calcul</p>
            <SegmentedControl
              options={KILLS_VIEW_OPTIONS}
              value={killsView}
              onChange={setKillsView}
              size="sm"
              fullWidthOnMobile
              className="w-full sm:w-auto"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="mb-6 text-sm text-gray-600">Chargement du classement...</p>
      ) : null}
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <div className="space-y-6">
          <LeaderboardStats entries={leaderboard} />

          <Leaderboard
            entries={leaderboard}
            progression={progression}
            sortBy={sortBy}
            killsView={killsView}
            onSortChange={setSortBy}
            showPerformanceDelta={period !== 'all'}
          />
        </div>
      ) : null}
    </main>
  )
}
