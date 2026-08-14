'use client'

import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'

import { ClanLeaderboardTable } from '@/components/leaderboard/ClanLeaderboardTable'
import SegmentedControl from '@/components/ui/SegmentedControl'
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
    <main className="app-container app-main">
      <header className="app-panel relative mb-6 overflow-hidden px-6 py-6 sm:py-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-amber-500/20 p-2 rounded-lg border border-amber-500/30">
              <Trophy className="w-6 h-6 text-amber-500" />
            </div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">
              Ligue Inter-Clans
            </h1>
          </div>
          <p className="text-[var(--theme-ui-text-muted)] max-w-2xl text-sm font-medium">
            Classement global des clans basé sur le Power Score composite (Win Rate, Dégâts, Kills).
          </p>
        </div>

        <div className="shrink-0 relative z-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--theme-ui-text-muted)] text-right">Période</p>
          <SegmentedControl
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            size="sm"
            fullWidthOnMobile
            className="w-full sm:w-auto"
          />
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
        <ClanLeaderboardTable entries={leaderboard} />
      )}
    </main>
  )
}
