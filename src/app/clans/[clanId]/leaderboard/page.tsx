'use client'
import { Crown } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import Leaderboard from '@/components/Leaderboard'
import { ClanLeaderboardTable } from '@/components/leaderboard/ClanLeaderboardTable'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'
import LeaderboardStats from '@/components/LeaderboardStats'
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
      <header
        className="relative mb-6 min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/leaderboard.jpg')`, backgroundPosition: 'center top' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Crown className="h-4 w-4 text-yellow-400 sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">Classement du clan</h1>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
            Performances individuelles par période.
          </p>
          <p className="mt-0.5 text-[10px] text-gray-300 drop-shadow-md sm:text-xs">{formatLastUpdated(lastUpdatedAt)}</p>
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
        <TableSkeleton className="mb-6" />
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
