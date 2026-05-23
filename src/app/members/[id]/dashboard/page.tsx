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
import type { DashboardPeriod } from '@/types/dashboard'

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  week: 'Cette semaine',
  month: 'Ce mois',
  all: 'Tout le temps',
}

const MAP_LABELS: Record<string, string> = {
  Baltic_Main: 'Erangel',
  Savage_Main: 'Sanhok',
  Desert_Main: 'Miramar',
  DihorOtok_Main: 'Vikendi',
  Range_Main: 'Camp Jackal',
  Summerland_Main: 'Karakin',
  Tiger_Main: 'Taego',
  Kiki_Main: 'Deston',
  Chimera_Main: 'Paramo',
  Heaven_Main: 'Haven',
}

function formatMap(name: string) {
  return MAP_LABELS[name] ?? name
}

function daysSince(iso: string): number {
  const diff = Date.now() - new Date(iso).getTime()
  return Math.floor(diff / 86400000)
}

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

  const { member, stats, clanAverage, progression, topPerformances, squads } = data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto max-w-5xl">
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
            <Link href="/members" className="hover:text-blue-600 hover:underline">
              Membres
            </Link>
            <span>/</span>
            <span className="font-medium text-gray-700">
              {member.displayName || '—'}
            </span>
            <span>/</span>
            <span>Dashboard</span>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Player info */}
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-blue-600 text-xl font-bold text-white">
                {member.avatarUrl ? (
                  <img
                    src={member.avatarUrl}
                    alt={member.displayName + ' avatar'}
                    className="h-14 w-14 rounded-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <span>{member.displayName.charAt(0).toUpperCase() || '?'}</span>
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{member.displayName}</h1>
                <p className="text-sm text-gray-500">
                  {member.pubgPlayerName} · {member.platformShard}
                </p>
                {member.createdAt && (
                  <p className="text-xs text-gray-400">
                    Membre depuis {daysSince(member.createdAt)} jours
                  </p>
                )}
              </div>
            </div>

            {/* Period selector */}
            <div className="flex rounded border border-gray-200 p-0.5">
              {(['week', 'month', 'all'] as DashboardPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
                    p === period ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Stats principales */}
        <PlayerStats stats={stats} clanAverage={clanAverage} />

        {/* Progression + Radar */}
        <div className="grid gap-6 md:grid-cols-2">
          <ProgressionChart progression={progression} />
          <ComparisonRadar stats={stats} clanAverage={clanAverage} />
        </div>

        {/* Match history */}
        <MatchHistory
          matches={matchData.matches}
          totalCount={matchData.totalCount}
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
                        #{m.placement} · {formatMap(m.mapName)} ·{' '}
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
