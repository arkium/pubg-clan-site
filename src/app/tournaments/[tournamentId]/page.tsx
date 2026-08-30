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
  participantClanIds?: number[]
  matches?: TournamentMatch[]
  error?: string
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

const MODE_LABELS: Record<string, string> = {
  squad: 'Squad',
  'squad-fpp': 'Squad FPP',
  duo: 'Duo',
  'duo-fpp': 'Duo FPP',
  solo: 'Solo',
  'solo-fpp': 'Solo FPP',
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

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMapName(name: string): string {
  return MAP_LABELS[name] ?? name
}

function formatMode(mode: string): string {
  return MODE_LABELS[mode] ?? mode
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
              <span>{data?.participantClanIds?.length ?? 0} clans suivis détectés</span>
            </div>
          </section>

          <section className="app-panel p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--theme-ui-text)]">Classement</h2>
            <div className="app-table-shell overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="app-table-head text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-3 text-center">Rang</th>
                    <th className="px-3 py-3 text-left">Clan</th>
                    <th className="px-3 py-3 text-right">Points</th>
                    <th className="px-3 py-3 text-right">Kills</th>
                    <th className="px-3 py-3 text-right">Matchs</th>
                    <th className="px-3 py-3 text-right">Victoires</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.standings ?? []).map((standing, index) => {
                    const rank = index + 1
                    const rankClassName = rank === 1 ? 'app-table-row--top1' : rank === 2 ? 'app-table-row--top2' : rank === 3 ? 'app-table-row--top3' : ''
                    
                    return (
                      <tr key={standing.clanId} className={`app-table-row ${rankClassName}`}>
                        <td className="px-3 py-3 text-center font-semibold text-gray-700">{rank}</td>
                        <td className="px-3 py-3 font-bold text-[var(--theme-ui-text)]">
                          {clanNames.get(standing.clanId) ?? `Clan #${standing.clanId}`}
                        </td>
                        <td className="px-3 py-3 text-right font-black text-amber-500">{standing.totalPoints}</td>
                        <td className="px-3 py-3 text-right font-mono text-[var(--theme-ui-text-muted)]">{standing.totalKills}</td>
                        <td className="px-3 py-3 text-right font-mono text-[var(--theme-ui-text-muted)]">{standing.matchesPlayed}</td>
                        <td className="px-3 py-3 text-right font-mono text-[var(--theme-ui-text-muted)]">{standing.wins}</td>
                      </tr>
                    )
                  })}
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
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--theme-ui-text)] flex items-center gap-2">
                            {match.mapName ? formatMapName(match.mapName) : 'Carte inconnue'}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--theme-ui-text-muted)]">
                            {formatDate(match.createdAt)} · {formatTime(match.createdAt)}
                          </p>
                        </div>
                        {match.gameMode && (
                          <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--theme-ui-text-muted)] bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                            <span>{formatMode(match.gameMode)}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {results.map((r, i) => (
                           <span key={i} className="inline-flex items-center rounded-md bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-sm">
                             {r}
                           </span>
                        ))}
                      </div>
                    </>
                  )

                  return telemetryClanId ? (
                    <Link key={match.id} href={`/tournaments/${tournamentId}/matches/${match.id}/telemetry?clanId=${telemetryClanId}`} className="app-table-shell block p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      {content}
                    </Link>
                  ) : (
                    <div key={match.id} className="app-table-shell p-4">{content}</div>
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
