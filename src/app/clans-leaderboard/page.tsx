'use client'

import { Suspense, useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'

import { ClanLeaderboardTable } from '@/components/leaderboard/ClanLeaderboardTable'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import type { ClanLeaderboardEntry, ClansLeaderboardResponse } from '@/app/api/clans-leaderboard/route'
import { STANDARD_PERIODS } from '@/lib/period'

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-amber-500 animate-spin" />
    </div>
  )
}

function ClansLeaderboardContent() {
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(STANDARD_PERIODS, 'week')
  // `null` tant qu'aucun classement n'est arrivé : ensuite, l'ancien reste affiché pendant un
  // rechargement, pour que la page ne se replie pas sous le bandeau à chaque changement de période.
  const [leaderboard, setLeaderboard] = useState<ClanLeaderboardEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!periodReady) return
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
  }, [period, periodReady])

  return (
    <>
      <DockingToolbar ariaLabel="Période de la ligue inter-clans">
        <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
      </DockingToolbar>

      <div className="app-container app-gutter">
        {error ? (
          <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-center">
            {error}
          </div>
        ) : leaderboard === null ? (
          <LoadingSpinner />
        ) : (
          <div aria-busy={loading} className={loading ? 'opacity-60' : undefined}>
            <ClanLeaderboardTable entries={leaderboard} />
          </div>
        )}
      </div>
    </>
  )
}

export default function ClansLeaderboardPage() {
  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter">
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-center bg-no-repeat sm:min-h-[13rem]"
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
      </div>

      {/* `usePagePeriod` lit `?period=` : une route statique exige cette frontière (CLAUDE.md, piège n° 5).
          Le héro, au-dessus, reste rendu côté serveur. */}
      <Suspense fallback={<LoadingSpinner />}>
        <ClansLeaderboardContent />
      </Suspense>
    </div>
  )
}
