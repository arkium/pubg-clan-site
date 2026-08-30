'use client'

import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { NavigationTrail } from '@/components/ui/NavigationTrail'

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

type Standing = {
  clanId: number
  totalPoints: number
  totalKills: number
  matchesPlayed: number
  wins: number
}

type TournamentMatch = {
  id: string
  createdAt: string
  mapName: string | null
  gameMode: string | null
  members: Array<{
    displayName: string | null
    clanId: number
    kills: number
    placement: number
  }>
}

type TournamentResponse = {
  tournament?: Tournament
  standings?: Standing[]
  matches?: TournamentMatch[]
  error?: string
}

function getTournamentId(value: string | string[] | undefined) {
  return typeof value === 'string' && value ? value : null
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function summarizeMatchTeams(match: TournamentMatch, clanNames: Map<number, string>) {
  const teams = new Map<number, { kills: number; placement: number }>()
  for (const member of match.members) {
    const current = teams.get(member.clanId) ?? { kills: 0, placement: member.placement }
    current.kills += member.kills
    current.placement = Math.min(current.placement, member.placement)
    teams.set(member.clanId, current)
  }

  return Array.from(teams.entries())
    .sort(([, left], [, right]) => left.placement - right.placement)
    .map(([clanId, result]) => `${clanNames.get(clanId) ?? `Clan #${clanId}`} : #${result.placement}, ${result.kills} kills`)
}

export default function TournamentDetailPage() {
  const params = useParams<{ tournamentId: string }>()
  const tournamentId = useMemo(() => getTournamentId(params.tournamentId), [params.tournamentId])
  const [data, setData] = useState<TournamentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tournamentId) return

    async function load() {
      try {
        setError(null)
        const response = await fetch(`/api/tournaments/${tournamentId}/standings`, { cache: 'no-store' })
        const payload = (await response.json()) as TournamentResponse
        if (!response.ok) throw new Error(payload.error ?? 'Impossible de charger le tournoi.')
        setData(payload)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Impossible de charger le tournoi.')
      }
    }

    void load()
  }, [tournamentId])

  const tournament = data?.tournament
  const clanNames = new Map<number, string>([
    ...(tournament?.organizerClan ? [[tournament.organizerClan.id, tournament.organizerClan.name] as [number, string]] : []),
    ...(tournament?.clans.map((entry) => [entry.clanId, entry.clan.name] as [number, string]) ?? []),
  ])

  return (
    <main className="app-container app-main space-y-6">
      <NavigationTrail
        currentLabel={tournament?.title ?? 'Tournoi'}
        currentHref={tournamentId ? `/tournaments/${tournamentId}` : '/tournaments'}
        fallbackParent={{ href: '/tournaments', label: 'Tournois', altHref: '/' }}
      />

      <header
        className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-center bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/ClanLeaderboardTable.jpg')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Trophy className="h-4 w-4 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">
              {tournament?.title ?? 'Tournoi inter-clans'}
            </h1>
          </div>
          {tournament ? (
            <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
              {tournament.organizerClan?.name ?? 'Clan organisateur'} · {formatDate(tournament.startDate)} au {formatDate(tournament.endDate)}
            </p>
          ) : null}
        </div>
      </header>

      {error ? <section className="app-panel p-6 text-sm text-red-600">{error}</section> : null}
      {!error && !tournament ? <section className="app-panel p-6 text-sm text-gray-500">Chargement...</section> : null}

      {tournament ? (
        <>
          <section className="app-panel p-6">
            {tournament.description ? <p className="text-sm text-gray-700">{tournament.description}</p> : null}
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-600">
              {tournament.gameMode ? <span>Mode : {tournament.gameMode}</span> : null}
              {tournament.mapName ? <span>Carte : {tournament.mapName}</span> : null}
              <span>{tournament.clans.length + 1} clans participants</span>
            </div>
          </section>

          <section className="app-panel p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Classement</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600">
                    <th className="pb-2 pr-4">#</th><th className="pb-2 pr-4">Clan</th><th className="pb-2 pr-4">Points</th><th className="pb-2 pr-4">Kills</th><th className="pb-2 pr-4">Matchs</th><th className="pb-2">Victoires</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.standings ?? []).map((standing, index) => (
                    <tr key={standing.clanId} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4 font-medium">{index + 1}</td><td className="py-2 pr-4">{standing.clanId}</td><td className="py-2 pr-4">{standing.totalPoints}</td><td className="py-2 pr-4">{standing.totalKills}</td><td className="py-2 pr-4">{standing.matchesPlayed}</td><td className="py-2">{standing.wins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="app-panel p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Matchs comptabilisés</h2>
            {(data?.matches ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">Aucun match custom ne correspond encore aux règles du tournoi.</p>
            ) : (
              <div className="space-y-3">
                {(data?.matches ?? []).map((match) => {
                  const telemetryClanId = match.members[0]?.clanId
                  const results = summarizeMatchTeams(match, clanNames)
                  const content = (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold text-gray-900">
                          {match.mapName ?? 'Carte inconnue'} <span className="font-normal text-gray-500">{match.gameMode ?? 'Mode inconnu'}</span>
                        </div>
                        <time className="text-sm text-gray-500">{formatDate(match.createdAt)}</time>
                      </div>
                      <p className="mt-2 text-sm text-gray-600">{results.join(' · ')}</p>
                    </>
                  )

                  return telemetryClanId ? (
                    <Link key={match.id} href={`/clans/${telemetryClanId}/matches/${match.id}/telemetry`} className="block rounded-lg border border-gray-200 bg-gray-50 p-4 transition hover:border-blue-300 hover:bg-blue-50">
                      {content}
                    </Link>
                  ) : (
                    <div key={match.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">{content}</div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}
