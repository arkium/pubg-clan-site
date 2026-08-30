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

type Standing = {
  clanId: number
  totalPoints: number
  totalKills: number
  matchesPlayed: number
  wins: number
  bestPlacement: number | null
  averagePlacement: number
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseTournamentId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  return String(value)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ClanTournamentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const tournamentId = useMemo(() => parseTournamentId(params.tournamentId), [params.tournamentId])
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [standings, setStandings] = useState<Standing[]>([])
  const [participantClanCount, setParticipantClanCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    if (tournamentId) {
      router.replace(`/tournaments/${tournamentId}`)
    }
  }, [clanId, router, setClanId, tournamentId])

  useEffect(() => {
    if (!clanId || !tournamentId) return

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/clans/${clanId}/tournaments/${tournamentId}/standings`)
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({ error: 'Impossible de charger le tournoi.' }))) as { error?: string }
          throw new Error(payload.error ?? 'Impossible de charger le tournoi.')
        }
        const payload = (await response.json()) as { tournament?: Tournament; standings?: Standing[]; participantClanIds?: number[] }
        setTournament(payload.tournament ?? null)
        setStandings(payload.standings ?? [])
        setParticipantClanCount(payload.participantClanIds?.length ?? 0)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Impossible de charger le tournoi.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [clanId, tournamentId])

  if (clanId && tournamentId) return null

  if (!clanId || !tournamentId) return null

  if (loading) {
    return (
      <main className="app-container app-main">
        <p className="text-sm text-gray-500">Chargement...</p>
      </main>
    )
  }

  if (error || !tournament) {
    return (
      <main className="app-container app-main space-y-4">
        <p className="text-sm text-red-600">{error ?? 'Tournoi introuvable.'}</p>
        <Link href={`/clans/${clanId}/tournaments`} className="text-sm text-blue-600 hover:underline">← Retour aux tournois</Link>
      </main>
    )
  }

  return (
    <main className="app-container app-main space-y-6">
      <NavigationTrail
        currentLabel={tournament.title}
        currentHref={`/clans/${clanId}/tournaments/${tournament.id}`}
        fallbackParent={{ href: `/clans/${clanId}/tournaments`, label: 'Tournois', altHref: '/clans' }}
      />

      <section className="app-panel p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tournament.title}</h1>
            <p className="text-sm text-gray-500">{tournament.organizerClan?.name ?? 'Clan organisateur'} • {formatDate(tournament.startDate)} → {formatDate(tournament.endDate)}</p>
          </div>
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
            {tournament.status}
          </span>
        </div>

        {tournament.description ? <p className="mb-4 text-sm text-gray-700">{tournament.description}</p> : null}

        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
          {tournament.gameMode ? <span>Mode: {tournament.gameMode}</span> : null}
          {tournament.mapName ? <span>Carte: {tournament.mapName}</span> : null}
          <span>{participantClanCount} clan{participantClanCount > 1 ? 's' : ''} détecté{participantClanCount > 1 ? 's' : ''}</span>
        </div>
      </section>

      <section className="app-panel p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Classement</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Clan</th>
                <th className="pb-2 pr-4">Points</th>
                <th className="pb-2 pr-4">Kills</th>
                <th className="pb-2 pr-4">Matchs</th>
                <th className="pb-2 pr-4">Victoires</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing, index) => (
                <tr key={standing.clanId} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pr-4 font-medium">{index + 1}</td>
                  <td className="py-2 pr-4">{standing.clanId}</td>
                  <td className="py-2 pr-4">{standing.totalPoints}</td>
                  <td className="py-2 pr-4">{standing.totalKills}</td>
                  <td className="py-2 pr-4">{standing.matchesPlayed}</td>
                  <td className="py-2 pr-4">{standing.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
