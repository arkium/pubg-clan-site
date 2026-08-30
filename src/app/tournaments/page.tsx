'use client'

import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'

type Tournament = {
  id: string
  title: string
  description: string | null
  status: string
  startDate: string
  endDate: string
  gameMode: string | null
  mapName: string | null
  organizerClan: { id: number; name: string } | null
  clans: Array<{ clanId: number; clan: { id: number; name: string } }>
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  finished: 'Terminé',
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  finished: 'bg-gray-100 text-gray-700',
}

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/tournaments', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Impossible de charger les tournois.')
        }
        const payload = (await response.json()) as { tournaments?: Tournament[] }
        setTournaments(payload.tournaments ?? [])
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Impossible de charger les tournois.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  return (
    <main className="app-container app-main space-y-6">
      <header
        className="relative mb-6 min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-center bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/ClanLeaderboardTable.jpg')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Trophy className="h-4 w-4 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">Tournois inter-clans</h1>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
            Découvrez et suivez les compétitions organisées par les clans.
          </p>
        </div>
      </header>

      <section className="app-panel p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Tous les tournois</h2>
            <p className="text-sm text-gray-500">Découvrez et suivez les tournois entre clans.</p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Chargement...</p>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!loading && !error && tournaments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
            Aucun tournoi pour le moment.
          </div>
        ) : null}

        <div className="space-y-4">
          {tournaments.map((tournament) => (
            <Link
              key={tournament.id}
              href={`/tournaments/${tournament.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50/40"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">{tournament.title}</h2>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[tournament.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {STATUS_LABELS[tournament.status] ?? tournament.status}
                    </span>
                  </div>
                  {tournament.description ? <p className="text-sm text-gray-600">{tournament.description}</p> : null}
                </div>
                <div className="text-sm text-gray-500">
                  {formatDate(tournament.startDate)} → {formatDate(tournament.endDate)}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                {tournament.organizerClan ? <span className="font-medium">Organisé par: {tournament.organizerClan.name}</span> : null}
                {tournament.gameMode ? <span>Mode: {tournament.gameMode}</span> : null}
                {tournament.mapName ? <span>Carte: {tournament.mapName}</span> : null}
                <span>{tournament.clans.length + 1} clans</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
