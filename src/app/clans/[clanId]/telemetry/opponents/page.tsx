'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { useSelectedClan } from '@/hooks/useSelectedClan'

type EncounteredPlayerRow = {
  id: string
  pubgAccountId: string
  pubgPlayerName: string
  pubgClanTag: string | null
  pubgClanName: string | null
  clanResolvedAt: string | null
  encounterCount: number
  firstSeenAt: string
  lastSeenAt: string
}

type RivalClan = {
  tag: string
  encounterCount: number
}

type EncounteredPlayersPayload = {
  data?: {
    summary: {
      totalPlayers: number
      resolvedCount: number
      pendingCount: number
      distinctClansIdentified: number
    }
    topRivalClans: RivalClan[]
    players: EncounteredPlayerRow[]
  }
  error?: string
}

type SortKey = 'encounterCount' | 'lastSeenAt' | 'pubgPlayerName'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function EncounteredOpponentsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<EncounteredPlayersPayload['data'] | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [clanFilter, setClanFilter] = useState<'all' | 'resolved' | 'pending'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('encounterCount')

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  const loadPlayers = useCallback(
    async (currentClanId: number) => {
      try {
        setLoading(true)
        const response = await fetch(`/api/clans/${currentClanId}/encountered-players`, {
          cache: 'no-store',
        })

        const data = (await response.json().catch(() => null)) as EncounteredPlayersPayload | null

        if (!response.ok || !data?.data) {
          if (response.status === 401 || response.status === 403) {
            router.replace(`/login?redirect=${encodeURIComponent(`/clans/${currentClanId}/telemetry/opponents`)}`)
            return
          }

          setPayload(null)
          setError(data?.error ?? 'Chargement des adversaires rencontrés impossible')
          return
        }

        setPayload(data.data)
        setError(null)
      } catch {
        setPayload(null)
        setError('Chargement des adversaires rencontrés impossible')
      } finally {
        setLoading(false)
      }
    },
    [router]
  )

  useEffect(() => {
    if (!clanId) {
      return
    }

    void loadPlayers(clanId)
  }, [clanId, loadPlayers])

  const filteredPlayers = useMemo(() => {
    if (!payload) {
      return []
    }

    const search = searchTerm.trim().toLowerCase()

    return payload.players.filter((player) => {
      if (clanFilter === 'resolved' && !player.clanResolvedAt) {
        return false
      }

      if (clanFilter === 'pending' && player.clanResolvedAt) {
        return false
      }

      if (!search) {
        return true
      }

      const haystack = [player.pubgPlayerName, player.pubgClanTag ?? '', player.pubgClanName ?? '']
        .join(' ')
        .toLowerCase()

      return haystack.includes(search)
    })
  }, [payload, searchTerm, clanFilter])

  const sortedPlayers = useMemo(() => {
    return [...filteredPlayers].sort((left, right) => {
      if (sortKey === 'pubgPlayerName') {
        return left.pubgPlayerName.localeCompare(right.pubgPlayerName)
      }

      if (sortKey === 'lastSeenAt') {
        return new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime()
      }

      return right.encounterCount - left.encounterCount
    })
  }, [filteredPlayers, sortKey])

  if (loading) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
        <p className="text-sm text-slate-600">Chargement des adversaires rencontrés...</p>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <section className="app-panel p-4">
        <SettingsPageHeader
          title="Adversaires rencontrés"
          subtitle="Joueurs adverses croisés en match par le clan — nom et clan PUBG identifiés, sans les ajouter au tracking actif."
        />
      </section>

      {error ? <section className="app-panel p-4 text-sm text-rose-800">{error}</section> : null}

      {payload ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Adversaires suivis</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{payload.summary.totalPlayers}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Clans identifiés</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{payload.summary.distinctClansIdentified}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Résolus</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{payload.summary.resolvedCount}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">En attente de résolution</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">{payload.summary.pendingCount}</p>
            </article>
          </section>

          {payload.topRivalClans.length > 0 ? (
            <section className="app-panel p-4">
              <h2 className="text-lg font-semibold text-slate-900">Clans adverses les plus croisés</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {payload.topRivalClans.map((rival) => (
                  <span
                    key={rival.tag}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700"
                  >
                    [{rival.tag}] · {rival.encounterCount} croisement{rival.encounterCount > 1 ? 's' : ''}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="app-panel p-4">
            <h2 className="text-lg font-semibold text-slate-900">Liste des adversaires</h2>
            <p className="mt-1 text-sm text-slate-600">
              Résolution du clan PUBG limitée aux joueurs croisés au moins deux fois, un seul appel par joueur.
            </p>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recherche
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="joueur, tag de clan..."
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 placeholder:text-slate-400"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Statut de résolution
                <select
                  value={clanFilter}
                  onChange={(event) => setClanFilter(event.target.value as 'all' | 'resolved' | 'pending')}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="all">Tous</option>
                  <option value="resolved">Résolus</option>
                  <option value="pending">En attente</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tri
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="encounterCount">Croisements</option>
                  <option value="lastSeenAt">Dernière rencontre</option>
                  <option value="pubgPlayerName">Nom</option>
                </select>
              </label>
            </div>

            <div className="mt-3">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Résultats: {sortedPlayers.length} / {payload.players.length}
              </span>
            </div>

            <div className="app-table-shell mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Joueur</th>
                    <th className="px-2 py-2">Clan PUBG</th>
                    <th className="px-2 py-2 text-right">Croisements</th>
                    <th className="px-2 py-2">Première rencontre</th>
                    <th className="px-2 py-2">Dernière rencontre</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player) => (
                    <tr key={player.id} className="app-table-row align-top">
                      <td className="px-2 py-2 font-medium text-slate-800">{player.pubgPlayerName}</td>
                      <td className="px-2 py-2 text-slate-700">
                        {player.pubgClanTag ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            [{player.pubgClanTag}] {player.pubgClanName ?? ''}
                          </span>
                        ) : player.clanResolvedAt ? (
                          <span className="text-xs text-slate-500">Sans clan</span>
                        ) : (
                          <span className="text-xs text-amber-700">En attente de résolution</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-700">{player.encounterCount}</td>
                      <td className="px-2 py-2 text-slate-700">{formatDateTime(player.firstSeenAt)}</td>
                      <td className="px-2 py-2 text-slate-700">{formatDateTime(player.lastSeenAt)}</td>
                    </tr>
                  ))}
                  {sortedPlayers.length === 0 ? (
                    <tr className="app-table-row">
                      <td colSpan={5} className="px-2 py-6 text-center text-sm text-slate-500">
                        Aucun adversaire rencontré pour l&apos;instant.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
