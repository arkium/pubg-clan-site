'use client'

import { Crown } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import Leaderboard from '@/components/Leaderboard'
import LeaderboardStats from '@/components/LeaderboardStats'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { useLeaderboard } from '@/hooks/useLeaderboard'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type { ClanMatchTypeFilter } from '@/types/squad-matches'
import type {
  LeaderboardPeriod,
  LeaderboardSortBy,
  LeaderboardTeamMode,
} from '@/types/leaderboard'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const PERIOD_OPTIONS: Array<{ value: LeaderboardPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

const MATCH_TYPE_OPTIONS: Array<{ value: ClanMatchTypeFilter; label: string }> = [
  { value: 'official', label: 'Officiel' },
  { value: 'casual', label: 'Casual' },
  { value: 'custom', label: 'Custom' },
  { value: 'all', label: 'Tous' },
]

const TEAM_MODE_OPTIONS: Array<{ value: LeaderboardTeamMode; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'solo', label: 'Solo' },
  { value: 'duo', label: 'Duo' },
  { value: 'trio', label: 'Trio' },
  { value: 'squad', label: 'Squad' },
]

function formatLastUpdated(value: string | null) {
  if (!value) {
    return 'Classement calculé en direct'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Classement calculé en direct'
  }

  return `Derniers matchs récupérés le ${date.toLocaleString('fr-FR')}`
}

export default function LeaderboardPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const [period, setPeriod] = useState<LeaderboardPeriod>('week')
  const [matchType, setMatchType] = useState<ClanMatchTypeFilter>('official')
  const [teamMode, setTeamMode] = useState<LeaderboardTeamMode>('all')
  const [sortBy, setSortBy] = useState<LeaderboardSortBy>('kills')

  const { leaderboard, progression, lastUpdatedAt, loading, error } = useLeaderboard(
    clanId,
    period,
    sortBy,
    matchType,
    teamMode
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
    <main className="flex-1">
      {/* Top container: Breadcrumb & Hero Header */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-8">
        <NavigationTrail
          currentLabel="Classement"
          currentHref={`/clans/${clanId}/leaderboard`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        <header
          className="relative mb-6 min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/leaderboard.jpg')`, backgroundPosition: 'center top' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Crown className="h-4 w-4 text-yellow-400 sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">
                Classement du clan
              </h1>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
              Performances individuelles par période, type de match et mode d'escouade.
            </p>
          </div>
        </header>
      </div>

      {/* Sticky Filter Toolbar */}
      <DockingToolbar variant="panel" maxWidthClass="max-w-6xl">
        <div className="flex w-full flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
              {leaderboard.length} membres
            </span>
            <span>{formatLastUpdated(lastUpdatedAt)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              size="sm"
              className="shrink-0"
            />
            <SegmentedControl
              options={MATCH_TYPE_OPTIONS}
              value={matchType}
              onChange={setMatchType}
              size="sm"
              className="shrink-0"
            />
            <SegmentedControl
              options={TEAM_MODE_OPTIONS}
              value={teamMode}
              onChange={setTeamMode}
              size="sm"
              className="shrink-0"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-gray-500">
            <span className="font-semibold text-gray-700">Note :</span> Le mode <span className="font-semibold text-gray-800">« Tous »</span> regroupe l'ensemble des matchs d'escouade du clan (Duo, Trio, Squad), sans les parties en Solo. Les statistiques individuelles en solo sont accessibles via le filtre <span className="font-semibold text-gray-800">« Solo »</span>.
          </p>
        </div>
      </DockingToolbar>

      {/* Main Content Area */}
      <div className="mx-auto w-full max-w-6xl px-4 pb-8">
        {loading ? <TableSkeleton className="mb-6" /> : null}
        {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

        {!loading && !error ? (
          <div className="space-y-6">
            <LeaderboardStats entries={leaderboard} />

            <Leaderboard
              entries={leaderboard}
              progression={progression}
              sortBy={sortBy}
              teamMode={teamMode}
              onSortChange={setSortBy}
              showPerformanceDelta={period !== 'all'}
            />
          </div>
        ) : null}
      </div>
    </main>
  )
}

