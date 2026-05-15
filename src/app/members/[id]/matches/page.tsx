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

interface LifetimeStats {
  combat: {
    kills: number
    deaths: number
    kdRatio: number
    headshots: number
    assists: number
    knockouts: number
    highestKillstreak: number
    longestKill: number
    teamkills: number
    suicides: number
  }
  victory: {
    wins: number
    losses: number
    winLossRatio: number
    longestTimeAlive: number
  }
  support: {
    teammatesRevived: number
    boostsUsed: number
    healed: number
  }
  vehicle: {
    vehiclesDestroyed: number
    roadkills: number
  }
  movement: {
    drivenDistance: number
    walkedDistance: number
    swamDistance: number
  }
  other: {
    weaponsPicked: number
    damageGiven: number
  }
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function formatDurationLong(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  }

  return `${minutes}m ${remainingSeconds}s`
}

function formatNumber(value: number) {
  return value.toLocaleString()
}

function formatRatio(value: number) {
  return value.toFixed(2)
}

function formatDistanceMetersToKm(value: number) {
  return `${(value / 1000).toFixed(2)} km`
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
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingApiMatches, setLoadingApiMatches] = useState(false)
  const [error, setError] = useState('')
  const [statsError, setStatsError] = useState('')
  const [refreshingStats, setRefreshingStats] = useState(false)
  const [importingAll, setImportingAll] = useState(false)
  const [importingMatchIds, setImportingMatchIds] = useState<string[]>([])

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadStats() {
      setLoadingStats(true)
      setStatsError('')

      try {
        const res = await fetch(`/api/members/${memberId}/stats`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load lifetime stats')
        }

        if (!cancelled) {
          setLifetimeStats(data.stats)
        }
      } catch (statsLoadError) {
        if (!cancelled) {
          setStatsError(
            statsLoadError instanceof Error ? statsLoadError.message : 'Failed to load lifetime stats'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingStats(false)
        }
      }
    }

    void loadStats()

    return () => {
      cancelled = true
    }
  }, [memberId])

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

  async function handleRefreshStats() {
    if (!memberId) {
      return
    }

    setRefreshingStats(true)
    setStatsError('')

    try {
      const res = await fetch(`/api/members/${memberId}/stats`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load lifetime stats')
      }

      setLifetimeStats(data.stats)
    } catch (statsLoadError) {
      setStatsError(
        statsLoadError instanceof Error ? statsLoadError.message : 'Failed to load lifetime stats'
      )
    } finally {
      setRefreshingStats(false)
    }
  }

  const showPageLoading = loading && loadingStats

  if (showPageLoading) {
    return <div className="p-8">Loading member data...</div>
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
        {statsError && lifetimeStats && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            {statsError}
          </div>
        )}

        <section className="rounded bg-white p-6 shadow">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Lifetime statistics</h2>
              <p className="text-sm text-gray-500">
                Comprehensive PUBG all-time stats for this member.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRefreshStats()}
              disabled={refreshingStats || loadingStats}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshingStats ? 'Refreshing...' : 'Refresh stats'}
            </button>
          </div>

          {loadingStats && !lifetimeStats ? (
            <p className="text-sm text-gray-500">Loading lifetime stats...</p>
          ) : statsError && !lifetimeStats ? (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {statsError}
            </div>
          ) : lifetimeStats ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <article className="rounded border border-gray-200 p-4">
                <h3 className="mb-3 text-lg font-semibold">Combat</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt>Kills</dt><dd>{formatNumber(lifetimeStats.combat.kills)}</dd></div>
                  <div className="flex justify-between"><dt>Deaths</dt><dd>{formatNumber(lifetimeStats.combat.deaths)}</dd></div>
                  <div className="flex justify-between"><dt>K/D ratio</dt><dd>{formatRatio(lifetimeStats.combat.kdRatio)}</dd></div>
                  <div className="flex justify-between"><dt>Headshots</dt><dd>{formatNumber(lifetimeStats.combat.headshots)}</dd></div>
                  <div className="flex justify-between"><dt>Assists</dt><dd>{formatNumber(lifetimeStats.combat.assists)}</dd></div>
                  <div className="flex justify-between"><dt>Knockouts</dt><dd>{formatNumber(lifetimeStats.combat.knockouts)}</dd></div>
                  <div className="flex justify-between"><dt>Highest killstreak</dt><dd>{formatNumber(lifetimeStats.combat.highestKillstreak)}</dd></div>
                  <div className="flex justify-between"><dt>Longest kill</dt><dd>{lifetimeStats.combat.longestKill.toFixed(2)} m</dd></div>
                  <div className="flex justify-between"><dt>Teamkills</dt><dd>{formatNumber(lifetimeStats.combat.teamkills)}</dd></div>
                  <div className="flex justify-between"><dt>Suicides</dt><dd>{formatNumber(lifetimeStats.combat.suicides)}</dd></div>
                </dl>
              </article>

              <article className="rounded border border-gray-200 p-4">
                <h3 className="mb-3 text-lg font-semibold">Victory</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt>Wins</dt><dd>{formatNumber(lifetimeStats.victory.wins)}</dd></div>
                  <div className="flex justify-between"><dt>Losses</dt><dd>{formatNumber(lifetimeStats.victory.losses)}</dd></div>
                  <div className="flex justify-between"><dt>Win/Loss ratio</dt><dd>{formatRatio(lifetimeStats.victory.winLossRatio)}</dd></div>
                  <div className="flex justify-between"><dt>Longest time alive</dt><dd>{formatDurationLong(lifetimeStats.victory.longestTimeAlive)}</dd></div>
                </dl>
              </article>

              <article className="rounded border border-gray-200 p-4">
                <h3 className="mb-3 text-lg font-semibold">Support</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt>Teammates revived</dt><dd>{formatNumber(lifetimeStats.support.teammatesRevived)}</dd></div>
                  <div className="flex justify-between"><dt>Boosts used</dt><dd>{formatNumber(lifetimeStats.support.boostsUsed)}</dd></div>
                  <div className="flex justify-between"><dt>Healed</dt><dd>{formatNumber(lifetimeStats.support.healed)}</dd></div>
                </dl>
              </article>

              <article className="rounded border border-gray-200 p-4">
                <h3 className="mb-3 text-lg font-semibold">Vehicles</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt>Vehicles destroyed</dt><dd>{formatNumber(lifetimeStats.vehicle.vehiclesDestroyed)}</dd></div>
                  <div className="flex justify-between"><dt>Roadkills</dt><dd>{formatNumber(lifetimeStats.vehicle.roadkills)}</dd></div>
                </dl>
              </article>

              <article className="rounded border border-gray-200 p-4">
                <h3 className="mb-3 text-lg font-semibold">Movement</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt>Driven distance</dt><dd>{formatDistanceMetersToKm(lifetimeStats.movement.drivenDistance)}</dd></div>
                  <div className="flex justify-between"><dt>Walked distance</dt><dd>{formatDistanceMetersToKm(lifetimeStats.movement.walkedDistance)}</dd></div>
                  <div className="flex justify-between"><dt>Swam distance</dt><dd>{formatDistanceMetersToKm(lifetimeStats.movement.swamDistance)}</dd></div>
                </dl>
              </article>

              <article className="rounded border border-gray-200 p-4">
                <h3 className="mb-3 text-lg font-semibold">Other</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt>Weapons picked</dt><dd>{formatNumber(lifetimeStats.other.weaponsPicked)}</dd></div>
                  <div className="flex justify-between"><dt>Damage given</dt><dd>{formatNumber(lifetimeStats.other.damageGiven)}</dd></div>
                </dl>
              </article>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No lifetime stats available.</p>
          )}
        </section>

        {!matchInfo ? (
          <section className="rounded bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Match data is currently unavailable for this member.
            </p>
          </section>
        ) : (
          <>

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
          </>
        )}
      </div>
    </div>
  )
}
