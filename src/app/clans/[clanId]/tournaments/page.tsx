'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useSelectedClan } from '@/hooks/useSelectedClan'

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
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
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

export default function ClanTournamentsPage() {
  const params = useParams()
  const router = useRouter()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    router.replace('/tournaments')
  }, [clanId, router, setClanId])

  useEffect(() => {
    if (!clanId) return

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/clans/${clanId}/tournaments`)
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
  }, [clanId])

  if (clanId) return null

  if (!clanId) return null

  return (
    <main className="app-container app-main space-y-6">
      <NavigationTrail
        currentLabel="Tournois"
        currentHref={`/clans/${clanId}/tournaments`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: 'Vue d\'ensemble', altHref: '/clans' }}
      />

      <section className="app-panel p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tournois</h1>
            <p className="text-sm text-gray-500">Suivi des tournois inter-clans et classement automatique.</p>
          </div>
          <Link
            href={`/clans/${clanId}/settings/tournaments`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Créer
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Chargement...</p>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!loading && !error && tournaments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
            Aucun tournoi pour ce clan pour le moment.
          </div>
        ) : null}

        <div className="space-y-4">
          {tournaments.map((tournament) => (
            <Link
              key={tournament.id}
              href={`/clans/${clanId}/tournaments/${tournament.id}`}
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
                {tournament.gameMode ? <span>Mode: {tournament.gameMode}</span> : null}
                {tournament.mapName ? <span>Carte: {tournament.mapName}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
