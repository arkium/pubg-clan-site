'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

import MatchHistory from '@/components/dashboard/MatchHistory'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import PlacementBadge from '@/components/ui/PlacementBadge'
import { useAuthSession } from '@/hooks/useAuthSession'
import type {
  DashboardMatchSortDirection,
  DashboardMatchSortKey,
  DashboardPeriod,
  MatchesResponse,
} from '@/types/dashboard'

interface MatchInfo {
  memberId: number
  playerId: string
  shard: string
  recentApiMatchIds: string[]
  recentMatchesConsidered: number
  totalMatches: number
}

interface ApiMatch {
  id: string
  mode: string
  mapName: string
  createdAt: string
  durationSeconds: number
  stats: {
    kills: number
    assists: number
    damageDealt: number
    headshotKills: number
    revives: number
    position: number
  }
}

interface ImportedMatchResponse {
  id: string
}

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export default function MatchesPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  const { loading: authLoading, permissions } = useAuthSession()
  const HISTORY_LIMIT = 10
  const canImportMatches = permissions.includes('*')

  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null)
  const [apiMatches, setApiMatches] = useState<ApiMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingApiMatches, setLoadingApiMatches] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState('')
  const [importingAll, setImportingAll] = useState(false)
  const [importingMatchIds, setImportingMatchIds] = useState<string[]>([])
  const [historyPeriod, setHistoryPeriod] = useState<DashboardPeriod>('all')
  const [historyOffset, setHistoryOffset] = useState(0)
  const [historySortKey, setHistorySortKey] = useState<DashboardMatchSortKey>('pubgCreatedAt')
  const [historySortDir, setHistorySortDir] = useState<DashboardMatchSortDirection>('desc')
  const [historyReloadKey, setHistoryReloadKey] = useState(0)
  const [historyData, setHistoryData] = useState<MatchesResponse>({
    matches: [],
    totalCount: 0,
    mapLabels: {},
  })

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadImportedHistory() {
      try {
        setLoadingHistory(true)

        const params = new URLSearchParams({
          period: historyPeriod,
          limit: String(HISTORY_LIMIT),
          offset: String(historyOffset),
          sortBy: historySortKey,
          sortDirection: historySortDir,
        })
        const response = await fetch(`/api/members/${memberId}/matches?${params.toString()}`)
        const payload = (await response.json()) as MatchesResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error : 'Impossible de charger les matchs importes')
        }

        if (!cancelled) {
          setHistoryData(payload as MatchesResponse)
        }
      } catch (historyError) {
        if (!cancelled) {
          setError(historyError instanceof Error ? historyError.message : 'Impossible de charger les matchs importes')
        }
      } finally {
        if (!cancelled) {
          setLoadingHistory(false)
        }
      }
    }

    void loadImportedHistory()

    return () => {
      cancelled = true
    }
  }, [
    HISTORY_LIMIT,
    historyOffset,
    historyPeriod,
    historyReloadKey,
    historySortDir,
    historySortKey,
    memberId,
  ])

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadMatches() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(`/api/members/${memberId}/matches`)
        const payload = (await response.json()) as MatchInfo | { error?: string }

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error : 'Impossible de charger les matchs')
        }

        if (cancelled) {
          return
        }

        const data = payload as MatchInfo
        setMatchInfo(data)
        setApiMatches([])

        if (data.recentApiMatchIds.length === 0) {
          return
        }

        setLoadingApiMatches(true)
        const fetchedMatches: ApiMatch[] = []
        const delayMs = 6000

        for (let index = 0; index < data.recentApiMatchIds.length; index += 1) {
          if (cancelled) {
            return
          }

          if (index > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs))
          }

          const matchId = data.recentApiMatchIds[index]

          try {
            const matchResponse = await fetch(
              `/api/matches/${matchId}?shard=${data.shard}&playerId=${data.playerId}`
            )
            const matchPayload = (await matchResponse.json()) as ApiMatch | { error?: string }

            if (!matchResponse.ok) {
              throw new Error('error' in matchPayload ? matchPayload.error : 'Impossible de charger le match')
            }

            fetchedMatches.push(matchPayload as ApiMatch)
            if (!cancelled) {
              setApiMatches([...fetchedMatches])
            }
          } catch (matchError) {
            console.error(`Failed to fetch match ${matchId}:`, matchError)
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les matchs')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setLoadingApiMatches(false)
        }
      }
    }

    void loadMatches()

    return () => {
      cancelled = true
    }
  }, [memberId])

  async function importMatch(matchId: string) {
    if (!matchInfo) {
      return
    }

    setImportingMatchIds((current) => [...current, matchId])
    setError('')

    try {
      const response = await fetch(`/api/matches/${matchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: matchInfo.memberId,
          playerId: matchInfo.playerId,
          shard: matchInfo.shard,
        }),
      })
      const payload = (await response.json()) as ImportedMatchResponse | { error?: string }

      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : 'Impossible d\'importer le match')
      }

      setApiMatches((current) => current.filter((match) => match.id !== matchId))
      setHistoryReloadKey((current) => current + 1)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Impossible d\'importer le match')
      throw importError
    } finally {
      setImportingMatchIds((current) => current.filter((id) => id !== matchId))
    }
  }

  async function handleImportAll() {
    const pendingMatchIds = apiMatches.map((match) => match.id)

    if (pendingMatchIds.length === 0) {
      return
    }

    setImportingAll(true)
    setError('')

    try {
      for (const matchId of pendingMatchIds) {
        await importMatch(matchId)
      }
    } catch {
      // importMatch remonte deja le message d'erreur utile
    } finally {
      setImportingAll(false)
    }
  }

  if (!memberId) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">ID joueur invalide.</p>
      </main>
    )
  }

  if (loading && !matchInfo) {
    return <div className="p-8">Chargement des matchs du joueur...</div>
  }

  return (
    <main className="app-page-surface min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="app-panel overflow-hidden">
          <div className="p-4">
          <MemberPageHeader
            title="Matchs du joueur"
            subtitle="Matchs importes deja stockes et recuperation manuelle des derniers matchs PUBG."
            showBackButton={false}
            framed={false}
          />
          </div>

          {!matchInfo ? (
            <div className="border-t border-slate-200 px-6 py-6">
              <p className="text-sm text-gray-500">
                Les donnees de matchs sont indisponibles pour ce joueur.
              </p>
            </div>
          ) : (
            <div className="border-t border-slate-200">
              <MatchHistory
                matches={historyData.matches}
                totalCount={historyData.totalCount}
                mapLabels={historyData.mapLabels}
                title="Matchs importes"
                subtitle="Disponibles dans la DB"
                period={historyPeriod}
                onPeriodChange={(value) => {
                  setHistoryPeriod(value)
                  setHistoryOffset(0)
                }}
                limit={HISTORY_LIMIT}
                offset={historyOffset}
                onOffsetChange={setHistoryOffset}
                sortKey={historySortKey}
                sortDir={historySortDir}
                onSortChange={(nextSortKey, nextSortDir) => {
                  setHistorySortKey(nextSortKey)
                  setHistorySortDir(nextSortDir)
                  setHistoryOffset(0)
                }}
                loading={loadingHistory}
                unframed
              />
            </div>
          )}
        </section>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        {matchInfo ? (
          <>
            {authLoading || canImportMatches ? (
              <section className="app-panel p-6">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Matchs PUBG recents a importer</h2>
                    <p className="text-sm text-gray-500">
                      {apiMatches.length} match{apiMatches.length === 1 ? '' : 's'} non importe{apiMatches.length === 1 ? '' : 's'}
                      {' '}sur les {matchInfo.recentMatchesConsidered} plus recents
                      ({matchInfo.totalMatches} matchs remontes par PUBG).
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                      A importer
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleImportAll()}
                      disabled={importingAll || apiMatches.length === 0 || !canImportMatches}
                      className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {importingAll ? 'Import en cours...' : 'Importer tout'}
                    </button>
                  </div>
                </div>

                {!canImportMatches ? (
                  <p className="text-sm text-gray-500">Cette section est reservee aux owners.</p>
                ) : apiMatches.length === 0 && !loadingApiMatches ? (
                  <p className="text-sm text-gray-500">
                    Tous les derniers matchs sont deja importes.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="border border-gray-200 p-2 text-left">Mode</th>
                          <th className="border border-gray-200 p-2 text-left">Carte</th>
                          <th className="border border-gray-200 p-2 text-left">Joue le</th>
                          <th className="border border-gray-200 p-2 text-center">Kills</th>
                          <th className="border border-gray-200 p-2 text-center">Assists</th>
                          <th className="border border-gray-200 p-2 text-center">Degats</th>
                          <th className="border border-gray-200 p-2 text-center">Headshots</th>
                          <th className="border border-gray-200 p-2 text-center">Revives</th>
                          <th className="border border-gray-200 p-2 text-center">Place</th>
                          <th className="border border-gray-200 p-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apiMatches.map((match) => {
                          const isImporting = importingAll || importingMatchIds.includes(match.id)

                          return (
                            <tr key={match.id} className="hover:bg-gray-50">
                              <td className="border border-gray-200 p-2">{match.mode}</td>
                              <td className="border border-gray-200 p-2">
                                {historyData.mapLabels[match.mapName] ?? match.mapName}
                              </td>
                              <td className="border border-gray-200 p-2">
                                <div>{new Date(match.createdAt).toLocaleString('fr-FR')}</div>
                                <div className="text-xs text-gray-500">
                                  Duree : {formatDuration(match.durationSeconds)}
                                </div>
                              </td>
                              <td className="border border-gray-200 p-2 text-center">{match.stats.kills}</td>
                              <td className="border border-gray-200 p-2 text-center">{match.stats.assists}</td>
                              <td className="border border-gray-200 p-2 text-center">{match.stats.damageDealt.toFixed(0)}</td>
                              <td className="border border-gray-200 p-2 text-center">{match.stats.headshotKills}</td>
                              <td className="border border-gray-200 p-2 text-center">{match.stats.revives}</td>
                              <td className="border border-gray-200 p-2 text-center">
                                <PlacementBadge placement={match.stats.position} />
                              </td>
                              <td className="border border-gray-200 p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => void importMatch(match.id)}
                                  disabled={isImporting || !canImportMatches}
                                  className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isImporting ? 'Import...' : 'Importer'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {loadingApiMatches ? (
                  <p className="mt-4 text-sm text-gray-500">
                    Chargement des matchs API restants... le rythme est limite pour eviter les appels PUBG inutiles.
                  </p>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  )
}