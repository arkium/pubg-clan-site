'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { usePlayerDashboard, usePlayerMatches } from '@/hooks/usePlayerDashboard'
import PlayerStats from '@/components/dashboard/PlayerStats'
import MatchHistory from '@/components/dashboard/MatchHistory'
import SquadFrequency from '@/components/dashboard/SquadFrequency'
import ProgressionChart from '@/components/dashboard/ProgressionChart'
import ComparisonRadar from '@/components/dashboard/ComparisonRadar'
import MemberSectionNav from '@/components/MemberSectionNav'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import type { DashboardPeriod } from '@/types/dashboard'

export default function DashboardPage() {
  const params = useParams()
  const memberId = params?.id ? Number(params.id) : null

  const [period, setPeriod] = useState<DashboardPeriod>('week')
  const [matchPeriod, setMatchPeriod] = useState<DashboardPeriod>('week')
  const [matchOffset, setMatchOffset] = useState(0)
  const MATCH_LIMIT = 10

  const { data, loading, error } = usePlayerDashboard(memberId, period)
  const {
    data: matchData,
    loading: matchLoading,
  } = usePlayerMatches(memberId, matchPeriod, MATCH_LIMIT, matchOffset)

  if (!memberId) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-red-600">ID joueur invalide.</p>
      </div>
    )
  }

  if (loading && !data.member.id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-red-600">Erreur : {error}</p>
        <Link href="/members" className="mt-2 inline-block text-blue-600 hover:underline">
          ← Retour aux membres
        </Link>
      </div>
    )
  }

  const { member, stats, clanAverage, progression, topPerformances, squads, mapLabels } = data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Content */}
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <MemberPageHeader
          title="Tableau de bord"
          subtitle="Vue synthese des performances du joueur."
        />

        <MemberSectionNav memberId={memberId} />

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
          loading={matchLoading}
          memberId={memberId}
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
                        #{m.placement} · {mapLabels[m.mapName] ?? m.mapName} ·{' '}
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
