'use client'

import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'

import { ClanLeaderboardTable } from '@/components/leaderboard/ClanLeaderboardTable'
import type { ClanLeaderboardEntry, ClansLeaderboardResponse } from '@/app/api/clans-leaderboard/route'
import type { LeaderboardPeriod } from '@/types/leaderboard'

const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  week: 'Semaine',
  month: 'Mois',
  all: 'All Time',
}

const PERIOD_OPTIONS = (Object.entries(PERIOD_LABELS) as [LeaderboardPeriod, string][]).map(([value, label]) => ({
  value,
  label,
}))

export default function ClansLeaderboardPage() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('week')
  const [leaderboard, setLeaderboard] = useState<ClanLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    fetch(`/api/clans-leaderboard?period=${period}`)
      .then((res) => {
        if (!res.ok) throw new Error('Erreur lors du chargement de la ligue')
        return res.json()
      })
      .then((data: ClansLeaderboardResponse) => {
        if (mounted) {
          setLeaderboard(data.leaderboard)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Erreur inconnue')
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [period])

  return (
    <main className="app-container app-main space-y-4">
      <header
        className="relative mb-6 min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-center bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/ClanLeaderboardTable.jpg')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Trophy className="h-4 w-4 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">Ligue Inter-Clans</h1>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
            Classement global basé sur le Power Score composite (Win Rate, Dégâts, Kills).
          </p>
        </div>
      </header>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-amber-500 animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-center">
          {error}
        </div>
      )}

      {!loading && !error && (
        <ClanLeaderboardTable
          entries={leaderboard}
          period={period}
          periodOptions={PERIOD_OPTIONS}
          onPeriodChange={setPeriod}
        />
      )}
    </main>
  )
}
