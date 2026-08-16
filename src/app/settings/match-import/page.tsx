'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PlacementBadge from '@/components/ui/PlacementBadge'
import { useAuthSession } from '@/hooks/useAuthSession'

interface MemberOption {
  id: number
  displayName: string
  clan: { id: number; name: string; tag: string } | null
}

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

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export default function MatchImportSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [members, setMembers] = useState<MemberOption[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null)

  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null)
  const [apiMatches, setApiMatches] = useState<ApiMatch[]>([])
  const [checkingPubgMatches, setCheckingPubgMatches] = useState(false)
  const [hasCheckedPubgMatches, setHasCheckedPubgMatches] = useState(false)
  const [loadingApiMatches, setLoadingApiMatches] = useState(false)
  const [importingAll, setImportingAll] = useState(false)
  const [importingMatchIds, setImportingMatchIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [mapLabels, setMapLabels] = useState<Record<string, string>>({})

  const pubgCheckCancelledRef = useRef(false)

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/match-import')
    }
  }, [authenticated, loading, router])

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) {
      return
    }

    let cancelled = false

    async function loadMembers() {
      try {
        setLoadingMembers(true)
        const response = await fetch('/api/members', { cache: 'no-store' })
        const payload = (await response.json()) as MemberOption[] | { error?: string }

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error : 'Impossible de charger les membres')
        }

        if (!cancelled) {
          setMembers(payload as MemberOption[])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les membres')
        }
      } finally {
        if (!cancelled) {
          setLoadingMembers(false)
        }
      }
    }

    void loadMembers()

    return () => {
      cancelled = true
    }
  }, [authenticated, isSuperUser, loading])

  useEffect(() => {
    return () => {
      pubgCheckCancelledRef.current = true
    }
  }, [])

  function resetMemberState() {
    pubgCheckCancelledRef.current = true
    setMatchInfo(null)
    setApiMatches([])
    setHasCheckedPubgMatches(false)
    setCheckingPubgMatches(false)
    setLoadingApiMatches(false)
    setError('')
  }

  async function checkPubgMatches() {
    if (!selectedMemberId) {
      return
    }

    pubgCheckCancelledRef.current = false
    const cancelledRef = pubgCheckCancelledRef

    setCheckingPubgMatches(true)
    setError('')

    try {
      const response = await fetch(`/api/members/${selectedMemberId}/matches`)
      const payload = (await response.json()) as MatchInfo | { error?: string }

      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : 'Impossible de charger les matchs')
      }

      if (cancelledRef.current) {
        return
      }

      const data = payload as MatchInfo
      setMatchInfo(data)
      setApiMatches([])
      setHasCheckedPubgMatches(true)

      if (data.recentApiMatchIds.length === 0) {
        return
      }

      setLoadingApiMatches(true)
      const fetchedMatches: ApiMatch[] = []
      const delayMs = 6000

      for (let index = 0; index < data.recentApiMatchIds.length; index += 1) {
        if (cancelledRef.current) {
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
          if (!cancelledRef.current) {
            setApiMatches([...fetchedMatches])
          }
        } catch (matchError) {
          console.error(`Failed to fetch match ${matchId}:`, matchError)
        }
      }
    } catch (loadError) {
      if (!cancelledRef.current) {
        setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les matchs')
      }
    } finally {
      if (!cancelledRef.current) {
        setCheckingPubgMatches(false)
        setLoadingApiMatches(false)
      }
    }
  }

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
        throw new Error('error' in payload ? payload.error : "Impossible d'importer le match")
      }

      setApiMatches((current) => current.filter((match) => match.id !== matchId))
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Impossible d'importer le match")
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

  useEffect(() => {
    async function loadMapLabels() {
      try {
        const response = await fetch('/api/settings/map-labels', { cache: 'no-store' })
        if (!response.ok) return
        const payload = (await response.json()) as { labels?: Record<string, string> }
        setMapLabels(payload.labels ?? {})
      } catch {
        // Les libelles de carte ne sont pas critiques, on garde les noms bruts en cas d'echec
      }
    }

    void loadMapLabels()
  }, [])

  if (loading || loadingMembers) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-600">Chargement...</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!isSuperUser) {
    return (
      <main className="app-container app-main flex-1">
        <section className="app-panel p-6">
          <h1 className="text-xl font-bold text-amber-900">Acces restreint</h1>
          <p className="mt-2 text-sm text-amber-800">Cette page est reservee au SuperUser.</p>
          <Link href="/" className="mt-5 app-btn app-btn--md app-btn--secondary">
            Retour a l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <section className="app-panel p-4">
        <SettingsPageHeader
          title="Import de matchs PUBG"
          subtitle="Verifie et importe manuellement les derniers matchs PUBG d'un membre, tous clans confondus."
        />
      </section>

      <section className="app-panel p-6">
        <label className="block text-sm font-medium text-gray-700">
          Membre
          <select
            value={selectedMemberId ?? ''}
            onChange={(event) => {
              const value = event.target.value ? Number(event.target.value) : null
              setSelectedMemberId(value)
              resetMemberState()
            }}
            className="mt-1 w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selectionner un membre...</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName} {member.clan ? `[${member.clan.tag}]` : '(sans clan)'}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {selectedMemberId ? (
        !hasCheckedPubgMatches ? (
          <section className="app-panel p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Matchs PUBG recents a importer</h2>
                <p className="text-sm text-gray-500">
                  Interroge l&apos;API PUBG pour verifier s&apos;il y a de nouveaux matchs a importer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void checkPubgMatches()}
                disabled={checkingPubgMatches}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checkingPubgMatches ? 'Verification...' : 'Verifier les nouveaux matchs PUBG'}
              </button>
            </div>
          </section>
        ) : matchInfo ? (
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
                  disabled={importingAll || apiMatches.length === 0}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importingAll ? 'Import en cours...' : 'Importer tout'}
                </button>
              </div>
            </div>

            {apiMatches.length === 0 && !loadingApiMatches ? (
              <p className="text-sm text-gray-500">Tous les derniers matchs sont deja importes.</p>
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
                            {mapLabels[match.mapName] ?? match.mapName}
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
                              disabled={isImporting}
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
        ) : null
      ) : null}
    </main>
  )
}
