'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface ImportedMatch {
  id: string
  pubgMatchId: string
  gameMode: string
  mapName: string
  kills: number
  assists: number
  damageDealt: number
  placement: number
  duration: number
  createdAt: string
}

interface MatchInfo {
  memberId: number
  playerId: string
  shard: string
  importedMatches: ImportedMatch[]
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

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export default function MatchesPage() {
  const params = useParams()
  const memberId = useMemo(
    () => (Array.isArray(params.id) ? params.id[0] : params.id),
    [params.id]
  )
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null)
  const [importedMatches, setImportedMatches] = useState<ImportedMatch[]>([])
  const [apiMatches, setApiMatches] = useState<ApiMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingApiMatches, setLoadingApiMatches] = useState(false)
  const [error, setError] = useState('')
  const [importingAll, setImportingAll] = useState(false)
  const [importingMatchIds, setImportingMatchIds] = useState<string[]>([])

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadMatches() {
      setLoading(true)
      setError('')

      try {
        const res = await fetch(`/api/members/${memberId}/matches`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load matches')
        }

        if (cancelled) {
          return
        }

        setMatchInfo(data)
        setImportedMatches(data.importedMatches)
        setApiMatches([])

        if (data.recentApiMatchIds.length === 0) {
          return
        }

        setLoadingApiMatches(true)
        const fetchedMatches: ApiMatch[] = []
        const delayMs = 6000

        for (let i = 0; i < data.recentApiMatchIds.length; i += 1) {
          if (cancelled) {
            return
          }

          if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs))
          }

          const matchId = data.recentApiMatchIds[i]

          try {
            const matchRes = await fetch(
              `/api/matches/${matchId}?shard=${data.shard}&playerId=${data.playerId}`
            )
            const matchData = await matchRes.json()

            if (!matchRes.ok) {
              throw new Error(matchData.error || 'Failed to load match')
            }

            fetchedMatches.push(matchData)
            if (!cancelled) {
              setApiMatches([...fetchedMatches])
            }
          } catch (matchError) {
            console.error(`Failed to fetch match ${matchId}:`, matchError)
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load matches')
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
      const res = await fetch(`/api/matches/${matchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: matchInfo.memberId,
          playerId: matchInfo.playerId,
          shard: matchInfo.shard,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to import match')
      }

      setImportedMatches((current) => [data, ...current.filter((match) => match.id !== data.id)])
      setApiMatches((current) => current.filter((match) => match.id !== matchId))
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Failed to import match')
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
      // importMatch already surfaces the specific error message
    } finally {
      setImportingAll(false)
    }
  }

  if (loading) {
    return <div className="p-8">Loading matches...</div>
  }

  if (error && !matchInfo) {
    return <div className="p-8 text-red-600">{error}</div>
  }

  if (!matchInfo) {
    return <div className="p-8">Failed to load matches</div>
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Member Matches</h1>
            <p className="text-sm text-gray-600">
              Imported matches stay at the top. Only recent PUBG API matches that are not
              imported are listed below.
            </p>
          </div>
          <Link
            href="/members"
            className="inline-flex items-center justify-center rounded bg-white px-4 py-2 text-sm font-medium text-blue-700 shadow hover:bg-blue-50"
          >
            Back to members
          </Link>
        </div>

        {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <section className="rounded bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Imported matches</h2>
              <p className="text-sm text-gray-500">
                {importedMatches.length} imported match{importedMatches.length === 1 ? '' : 'es'}
              </p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              Imported
            </span>
          </div>

          {importedMatches.length === 0 ? (
            <p className="text-sm text-gray-500">No imported matches yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border border-gray-200 p-2 text-left">Mode</th>
                    <th className="border border-gray-200 p-2 text-left">Map</th>
                    <th className="border border-gray-200 p-2 text-left">Import date</th>
                    <th className="border border-gray-200 p-2 text-center">Kills</th>
                    <th className="border border-gray-200 p-2 text-center">Assists</th>
                    <th className="border border-gray-200 p-2 text-center">Damage</th>
                    <th className="border border-gray-200 p-2 text-center">Placement</th>
                    <th className="border border-gray-200 p-2 text-center">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {importedMatches.map((match) => (
                    <tr key={match.id} className="hover:bg-gray-50">
                      <td className="border border-gray-200 p-2">{match.gameMode}</td>
                      <td className="border border-gray-200 p-2">{match.mapName}</td>
                      <td className="border border-gray-200 p-2">
                        <div>{new Date(match.createdAt).toLocaleString()}</div>
                        <div className="text-xs text-gray-500">Match ID: {match.pubgMatchId}</div>
                      </td>
                      <td className="border border-gray-200 p-2 text-center">{match.kills}</td>
                      <td className="border border-gray-200 p-2 text-center">{match.assists}</td>
                      <td className="border border-gray-200 p-2 text-center">
                        {match.damageDealt.toFixed(0)}
                      </td>
                      <td className="border border-gray-200 p-2 text-center">{match.placement}</td>
                      <td className="border border-gray-200 p-2 text-center">
                        {formatDuration(match.duration)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded bg-white p-6 shadow">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Recent PUBG API matches</h2>
              <p className="text-sm text-gray-500">
                Showing {apiMatches.length} not-imported match{apiMatches.length === 1 ? '' : 'es'}
                {' '}from the latest {matchInfo.recentMatchesConsidered} recent matches
                ({matchInfo.totalMatches} total reported by PUBG).
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Not imported
              </span>
              <button
                type="button"
                onClick={handleImportAll}
                disabled={importingAll || apiMatches.length === 0}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importingAll ? 'Importing...' : 'Import All'}
              </button>
            </div>
          </div>

          {apiMatches.length === 0 && !loadingApiMatches ? (
            <p className="text-sm text-gray-500">
              All of the latest matches are already imported.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border border-gray-200 p-2 text-left">Mode</th>
                    <th className="border border-gray-200 p-2 text-left">Map</th>
                    <th className="border border-gray-200 p-2 text-left">Played at</th>
                    <th className="border border-gray-200 p-2 text-center">Kills</th>
                    <th className="border border-gray-200 p-2 text-center">Assists</th>
                    <th className="border border-gray-200 p-2 text-center">Damage</th>
                    <th className="border border-gray-200 p-2 text-center">Headshots</th>
                    <th className="border border-gray-200 p-2 text-center">Revives</th>
                    <th className="border border-gray-200 p-2 text-center">Position</th>
                    <th className="border border-gray-200 p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {apiMatches.map((match) => {
                    const isImporting = importingAll || importingMatchIds.includes(match.id)

                    return (
                      <tr key={match.id} className="hover:bg-gray-50">
                        <td className="border border-gray-200 p-2">{match.mode}</td>
                        <td className="border border-gray-200 p-2">{match.mapName}</td>
                        <td className="border border-gray-200 p-2">
                          <div>{new Date(match.createdAt).toLocaleString()}</div>
                          <div className="text-xs text-gray-500">
                            Duration: {formatDuration(match.durationSeconds)}
                          </div>
                        </td>
                        <td className="border border-gray-200 p-2 text-center">{match.stats.kills}</td>
                        <td className="border border-gray-200 p-2 text-center">{match.stats.assists}</td>
                        <td className="border border-gray-200 p-2 text-center">
                          {match.stats.damageDealt.toFixed(0)}
                        </td>
                        <td className="border border-gray-200 p-2 text-center">
                          {match.stats.headshotKills}
                        </td>
                        <td className="border border-gray-200 p-2 text-center">{match.stats.revives}</td>
                        <td className="border border-gray-200 p-2 text-center">{match.stats.position}</td>
                        <td className="border border-gray-200 p-2 text-center">
                          <button
                            type="button"
                            onClick={() => void importMatch(match.id)}
                            disabled={isImporting}
                            className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isImporting ? 'Importing...' : 'Import'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {loadingApiMatches && (
            <p className="mt-4 text-sm text-gray-500">
              Loading remaining API matches... this is rate-limited to avoid unnecessary PUBG API
              calls.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
