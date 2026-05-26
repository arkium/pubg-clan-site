'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import Leaderboard from '@/components/Leaderboard'
import LeaderboardStats from '@/components/LeaderboardStats'
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

function formatLastUpdated(value: string | null) {
  if (!value) {
    return 'Derniere mise a jour indisponible pour le moment.'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Derniere mise a jour indisponible pour le moment.'
  }

  return `Derniere mise a jour des stats: ${date.toLocaleString('fr-FR')}. Cette date correspond au dernier recalcul enregistre pour cette periode.`
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
      <header className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Classement du clan</h1>
            <p className="text-sm text-gray-600">
              Performances individuelles par période.
            </p>
            <p className="mt-1 text-xs text-gray-500">{formatLastUpdated(lastUpdatedAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/clans/${clanId}/stats`}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Clan
            </Link>
            <Link
              href="/members"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Joueurs
            </Link>
          </div>
        </div>
      </header>

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
          <LeaderboardStats entries={leaderboard} killsView={killsView} />

          <Leaderboard
            entries={leaderboard}
            progression={progression}
            sortBy={sortBy}
            killsView={killsView}
            onSortChange={setSortBy}
            onKillsViewChange={setKillsView}
          />
        </div>
      ) : null}
    </main>
  )
}
