'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useParams } from 'next/navigation'

import { usePlayerDashboard, usePlayerMatches } from '@/hooks/usePlayerDashboard'
import PlayerStats from '@/components/dashboard/PlayerStats'
import MatchHistory from '@/components/dashboard/MatchHistory'
import SquadFrequency from '@/components/dashboard/SquadFrequency'
import ProgressionChart from '@/components/dashboard/ProgressionChart'
import ComparisonRadar from '@/components/dashboard/ComparisonRadar'
import MemberSectionNav from '@/components/MemberSectionNav'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import PlacementBadge from '@/components/ui/PlacementBadge'
import type {
  DashboardMatchSortDirection,
  DashboardMatchSortKey,
  DashboardPeriod,
} from '@/types/dashboard'

export default function DashboardPage() {
  const params = useParams()
  const memberId = params?.id ? Number(params.id) : null

  const [period, setPeriod] = useState<DashboardPeriod>('week')
  const [matchPeriod, setMatchPeriod] = useState<DashboardPeriod>('week')
  const [matchOffset, setMatchOffset] = useState(0)
  const [matchSortKey, setMatchSortKey] = useState<DashboardMatchSortKey>('pubgCreatedAt')
  const [matchSortDir, setMatchSortDir] = useState<DashboardMatchSortDirection>('desc')
  const MATCH_LIMIT = 10

  const { data, loading, error } = usePlayerDashboard(memberId, period)
  const {
    data: matchData,
    loading: matchLoading,
  } = usePlayerMatches(memberId, matchPeriod, MATCH_LIMIT, matchOffset, matchSortKey, matchSortDir)

  if (!memberId) {
    return (
      <div className="app-page-surface min-h-screen p-8">
        <p className="text-red-600">ID joueur invalide.</p>
      </div>
    )
  }

  if (loading && !data.member.id) {
    return (
      <div className="app-page-surface flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-page-surface min-h-screen p-8">
        <p className="text-red-600">Erreur : {error}</p>
        <Link href="/members" className="mt-2 inline-block text-blue-600 hover:underline">
          ← Retour aux membres
        </Link>
      </div>
    )
  }

  const { stats, clanAverage, progression, topPerformances, squads, mapLabels } = data

  return (
    <div className="app-page-surface min-h-screen">
      {/* Content */}
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <MemberPageHeader
            title="Tableau de bord"
            subtitle="Vue synthese des performances du joueur."
            showBackButton={false}
            framed={false}
          />
          <MemberSectionNav memberId={memberId} framed={false} showMemberIdentity={false} />
        </section>

        {/* Stats principales */}
        <PlayerStats
          stats={stats}
          clanAverage={clanAverage}
          period={period}
          onPeriodChange={setPeriod}
        />

        {/* Progression + Radar */}
        <div className="grid gap-6 md:grid-cols-2">
          <ProgressionChart progression={progression} />
          <ComparisonRadar stats={stats} clanAverage={clanAverage} />
        </div>

        {/* Match history */}
        <MatchHistory
          matches={matchData.matches}
          totalCount={matchData.totalCount}
          mapLabels={matchData.mapLabels}
          period={matchPeriod}
          onPeriodChange={(p) => {
            setMatchPeriod(p)
            setMatchOffset(0)
          }}
          limit={MATCH_LIMIT}
          offset={matchOffset}
          onOffsetChange={setMatchOffset}
          sortKey={matchSortKey}
          sortDir={matchSortDir}
          onSortChange={(nextSortKey, nextSortDir) => {
            setMatchSortKey(nextSortKey)
            setMatchSortDir(nextSortDir)
            setMatchOffset(0)
          }}
          loading={matchLoading}
        />

        {/* Squad frequency + Top performances */}
        <div className="grid gap-6 md:grid-cols-2">
          <SquadFrequency squads={squads} />

          {/* Top performances */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-900">Meilleures performances</h2>
              <p className="text-xs text-gray-500">Top 5 par kills</p>
            </div>
            {topPerformances.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">
                Aucun match enregistré pour l&apos;instant.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {topPerformances.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {m.kills} kills · {Math.round(m.damageDealt)} dmg
                      </p>
                      <p className="text-xs text-gray-500">
                        <PlacementBadge placement={m.placement} className="mr-1 align-middle" />
                        {mapLabels[m.mapName] ?? m.mapName} ·{' '}
                        {new Date(m.pubgCreatedAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    {m.placement === 1 && (
                      <span className="text-lg" title="Victoire">
                        🏆
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
