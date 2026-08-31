'use client'

import Link from 'next/link'
import { Fragment, useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  Star,
  UserPlus,
  Users,
  RefreshCcw,
} from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import SegmentedControl from '@/components/ui/SegmentedControl'

// Types (simplified for this file)
type SortDirection = 'asc' | 'desc'
type Period = 'week' | 'month' | 'all'
type ClanSortKey = 'name' | 'members' | 'encounters' | 'lastMatch'
type OpponentSortKey = 'opponent' | 'asOpponent' | 'asTeammate' | 'lastSeen' | 'memberCount' | 'trackedClansCount'

// Basic types needed for the explorer
type Pagination = { page: number; pageSize: number; total: number; totalPages: number }
type TrackedClanRow = any
type OpponentClanRow = any
type DetailState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }
type ClanDetail = any
type OpponentClanDetail = any

function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('fr-FR')
}

function SortHeader<T extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className = '',
}: {
  label: string
  sortKey: T
  activeKey: T
  direction: SortDirection
  onSort: (key: T) => void
  className?: string
}) {
  const isActive = sortKey === activeKey
  return (
    <th className={`px-2 py-2 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
      >
        {label}
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3 w-3" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  )
}

export default function OpponentsExplorerPage() {
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [payload, setPayload] = useState<any>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [period, setPeriod] = useState<Period>('all')

  const [clansPage, setClansPage] = useState(1)
  const [clansSortBy, setClansSortBy] = useState<ClanSortKey>('name')
  const [clansSortDir, setClansSortDir] = useState<SortDirection>('asc')
  const [clansQueryInput, setClansQueryInput] = useState('')
  const [clansQuery, setClansQuery] = useState('')

  const [opponentsPage, setOpponentsPage] = useState(1)
  const [opponentsSortBy, setOpponentsSortBy] = useState<OpponentSortKey>('asOpponent')
  const [opponentsSortDir, setOpponentsSortDir] = useState<SortDirection>('desc')
  const [opponentsQueryInput, setOpponentsQueryInput] = useState('')
  const [opponentsQuery, setOpponentsQuery] = useState('')

  const [favoritePending, setFavoritePending] = useState<Set<string>>(new Set())

  const [expandedClanId, setExpandedClanId] = useState<number | null>(null)
  const [clanDetails, setClanDetails] = useState<Record<number, DetailState<ClanDetail>>>({})

  const [expandedOpponentId, setExpandedOpponentId] = useState<string | null>(null)
  const [opponentDetails, setOpponentDetails] = useState<Record<string, DetailState<OpponentClanDetail>>>({})

  const [trackPending, setTrackPending] = useState<Set<string>>(new Set())
  const [notifications, setNotifications] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([])

  function addNotification(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now()
    setNotifications((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, 5000)
  }

  function removeNotification(id: number) {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) return

    let cancelled = false
    async function load() {
      try {
        setLoadingData(true)
        setError('')

        const searchParams = new URLSearchParams({
          period,
          clansPage: String(clansPage),
          clansSortBy,
          clansSortDir,
          opponentsPage: String(opponentsPage),
          opponentsSortBy,
          opponentsSortDir,
        })
        if (clansQuery) searchParams.set('clansQ', clansQuery)
        if (opponentsQuery) searchParams.set('opponentsQ', opponentsQuery)

        const response = await fetch(`/api/settings/opponents?${searchParams.toString()}`, {
          cache: 'no-store',
        })

        const nextPayload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(nextPayload?.error ?? 'Chargement impossible')
        }

        if (!cancelled) {
          setPayload(nextPayload)
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Chargement impossible')
      } finally {
        if (!cancelled) setLoadingData(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [
    authenticated,
    isSuperUser,
    loading,
    period,
    clansPage,
    clansSortBy,
    clansSortDir,
    clansQuery,
    opponentsPage,
    opponentsSortBy,
    opponentsSortDir,
    opponentsQuery,
    refreshKey,
  ])

  function handleClanSort(key: ClanSortKey) {
    setClansPage(1)
    if (key === clansSortBy) {
      setClansSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setClansSortBy(key)
      setClansSortDir('desc')
    }
  }

  function handleOpponentSort(key: OpponentSortKey) {
    setOpponentsPage(1)
    if (key === opponentsSortBy) {
      setOpponentsSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setOpponentsSortBy(key)
      setOpponentsSortDir('desc')
    }
  }

  async function toggleFavorite(row: OpponentClanRow) {
    if (favoritePending.has(row.id) || !payload) return
    const nextValue = !row.isFavorite

    setFavoritePending((current) => new Set(current).add(row.id))
    setPayload({
      ...payload,
      opponentClans: {
        ...payload.opponentClans,
        rows: payload.opponentClans.rows.map((item: any) =>
          item.id === row.id ? { ...item, isFavorite: nextValue } : item
        ),
      },
    })

    try {
      const response = await fetch(`/api/settings/opponent-clans/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isFavorite: nextValue }),
      })
      if (!response.ok) throw new Error('Echec de la mise a jour')
    } catch {
      setPayload((current: any) =>
        current
          ? {
              ...current,
              opponentClans: {
                ...current.opponentClans,
                rows: current.opponentClans.rows.map((item: any) =>
                  item.id === row.id ? { ...item, isFavorite: row.isFavorite } : item
                ),
              },
            }
          : current
      )
    } finally {
      setFavoritePending((current) => {
        const next = new Set(current)
        next.delete(row.id)
        return next
      })
    }
  }

  function toggleClanExpand(clanId: number) {
    const next = expandedClanId === clanId ? null : clanId
    setExpandedClanId(next)

    if (next !== null && !clanDetails[next]) {
      setClanDetails((current) => ({ ...current, [next]: { status: 'loading' } }))
      fetch(`/api/settings/opponents/clans/${next}/members`, { cache: 'no-store' })
        .then(async (response) => {
          const body = await response.json().catch(() => null)
          if (!response.ok) throw new Error(body?.error ?? 'Chargement impossible')
          setClanDetails((current) => ({ ...current, [next]: { status: 'ready', data: body } }))
        })
        .catch((detailError) => {
          setClanDetails((current) => ({
            ...current,
            [next]: { status: 'error', message: detailError.message },
          }))
        })
    }
  }

  function toggleOpponentExpand(opponentClanId: string) {
    const next = expandedOpponentId === opponentClanId ? null : opponentClanId
    setExpandedOpponentId(next)

    if (next !== null && !opponentDetails[next]) {
      setOpponentDetails((current) => ({ ...current, [next]: { status: 'loading' } }))
      fetch(`/api/settings/opponent-clans/${next}/players`, { cache: 'no-store' })
        .then(async (response) => {
          const body = await response.json().catch(() => null)
          if (!response.ok) throw new Error(body?.error ?? 'Chargement impossible')
          setOpponentDetails((current) => ({ ...current, [next]: { status: 'ready', data: body } }))
        })
        .catch((detailError) => {
          setOpponentDetails((current) => ({
            ...current,
            [next]: { status: 'error', message: detailError.message },
          }))
        })
    }
  }

  async function handleTrackMember(playerId: string, targetClanId?: number) {
    try {
      setTrackPending((prev) => new Set(prev).add(playerId))
      const bodyPayload: any = { playerId }
      if (targetClanId) bodyPayload.targetClanId = targetClanId
      
      const res = await fetch('/api/settings/opponents/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Erreur lors du suivi')
      addNotification('Joueur suivi avec succès !', 'success')
      
      setExpandedClanId(null)
      setExpandedOpponentId(null)
      setClanDetails({})
      setOpponentDetails({})
      setRefreshKey((k) => k + 1)
    } catch (err: any) {
      addNotification(err.message || 'Erreur inconnue', 'error')
    } finally {
      setTrackPending((prev) => {
        const next = new Set(prev)
        next.delete(playerId)
        return next
      })
    }
  }

  async function handleFavoritePlayer(playerId: string, current: boolean, opponentClanId: string) {
    try {
      setOpponentDetails((prev) => {
        const next = { ...prev }
        if (next[opponentClanId]?.status === 'ready') {
          next[opponentClanId] = {
            ...next[opponentClanId],
            data: {
              ...next[opponentClanId].data,
              players: next[opponentClanId].data.players.map((p: any) =>
                p.playerId === playerId ? { ...p, isFavorite: !current } : p
              )
            }
          }
        }
        return next
      })
      const res = await fetch(`/api/settings/players/${playerId}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !current })
      })
      if (!res.ok) throw new Error('Failed to update favorite')
    } catch(err) {
      console.error(err)
    }
  }

  if (loading || !authenticated || !isSuperUser) return null
  if (loadingData && !payload) return <p className="p-4 text-sm text-slate-600">Chargement...</p>

  const trackedClans = payload?.trackedClans
  const opponentClans = payload?.opponentClans
  const counters = payload?.counters

  return (
    <div className={`space-y-4 ${loadingData ? 'opacity-50 pointer-events-none transition-opacity duration-200' : ''}`}>
      <section className="app-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Clans suivis" value={String(counters?.trackedClanCount ?? 0)} />
            <MetricCard label="Clans adverses" value={String(counters?.opponentClanCount ?? 0)} />
            <MetricCard label="Rencontres" value={String(counters?.totalEncounters ?? 0)} />
            <MetricCard label="Sans clan" value={String(counters?.noClanPlayerCount ?? 0)} />
          </div>
          <SegmentedControl
            size="sm"
            value={period}
            onChange={(value) => {
              setClansPage(1)
              setOpponentsPage(1)
              setPeriod(value as Period)
            }}
            options={[
              { value: 'week', label: 'Semaine' },
              { value: 'month', label: 'Mois' },
              { value: 'all', label: 'Tous' },
            ]}
          />
        </div>

        {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

        {/* Tableau 1 — Clans suivis */}
        <div className="app-panel-muted mt-8 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <Users className="h-4 w-4 text-slate-500" aria-hidden />
              Clans suivis
              <button
                type="button"
                onClick={() => setRefreshKey(k => k + 1)}
                disabled={loadingData}
                className="ml-2 inline-flex items-center justify-center rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                title="Rafraîchir les données"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin text-sky-500' : ''}`} aria-hidden />
              </button>
            </h2>
            <input
              type="text"
              value={clansQueryInput}
              onChange={(event) => setClansQueryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setClansPage(1)
                  setClansQuery(clansQueryInput.trim())
                }
              }}
              onBlur={() => {
                setClansPage(1)
                setClansQuery(clansQueryInput.trim())
              }}
              placeholder="Rechercher un clan..."
              className="w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
          </div>

          <div className="app-table-shell mt-4 overflow-x-auto">
            <table className="min-w-full table-fixed text-left text-xs text-slate-700">
              <thead>
                <tr className="app-table-head text-[11px] uppercase tracking-wide text-slate-500">
                  <SortHeader label="Clan" sortKey="name" activeKey={clansSortBy} direction={clansSortDir} onSort={handleClanSort} />
                  <SortHeader label="Effectif" sortKey="members" activeKey={clansSortBy} direction={clansSortDir} onSort={handleClanSort} className="w-[90px]" />
                  <SortHeader label="Dernier match" sortKey="lastMatch" activeKey={clansSortBy} direction={clansSortDir} onSort={handleClanSort} className="w-[120px]" />
                  <th className="w-[130px] px-2 py-2">Membres manquants</th>
                </tr>
              </thead>
              <tbody>
                {(trackedClans?.rows.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-slate-500">Aucun clan suivi.</td>
                  </tr>
                ) : (
                  trackedClans?.rows.map((row: any) => (
                    <Fragment key={row.id}>
                      <tr className="app-table-row">
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleClanExpand(row.id)}
                              className="inline-flex items-center gap-1 font-semibold text-slate-900 hover:underline"
                            >
                              {expandedClanId === row.id ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                              )}
                              {row.name} <span className="text-slate-500">[{row.tag}]</span>
                            </button>
                            <Link
                              href={`/clans/${row.id}/telemetry/opponents`}
                              title="Voir la page adversaires de ce clan"
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                          </div>
                        </td>
                        <td className="px-2 py-2 tabular-nums">{row.membersCount}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(row.lastMatchAt)}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {row.missingMembersCount > 0 ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                              {row.missingMembersCount}
                            </span>
                          ) : '-'}
                        </td>
                      </tr>
                      {expandedClanId === row.id ? (
                        <tr>
                          <td colSpan={4} className="bg-gray-50 px-2 py-3">
                            <ClanDetailPanel detail={clanDetails[row.id]} clanId={row.id} onTrack={handleTrackMember} trackPending={trackPending} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationBar pagination={trackedClans?.pagination} onPageChange={setClansPage} />
        </div>

        {/* Tableau 2 — Clans adversaires */}
        <div className="app-panel-muted mt-8 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">Clans adversaires</h2>
            <input
              type="text"
              value={opponentsQueryInput}
              onChange={(event) => setOpponentsQueryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setOpponentsPage(1)
                  setOpponentsQuery(opponentsQueryInput.trim())
                }
              }}
              onBlur={() => {
                setOpponentsPage(1)
                setOpponentsQuery(opponentsQueryInput.trim())
              }}
              placeholder="Rechercher un clan adverse..."
              className="w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
          </div>

          <div className="app-table-shell mt-4 overflow-x-auto">
            <table className="min-w-full table-fixed text-left text-xs text-slate-700">
              <thead>
                <tr className="app-table-head text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="w-[40px] px-2 py-2" />
                  <SortHeader label="Clan adverse" sortKey="opponent" activeKey={opponentsSortBy} direction={opponentsSortDir} onSort={handleOpponentSort} />
                  <SortHeader label="Fois adversaire" sortKey="asOpponent" activeKey={opponentsSortBy} direction={opponentsSortDir} onSort={handleOpponentSort} className="w-[120px]" />
                  <SortHeader label="Fois coequipier" sortKey="asTeammate" activeKey={opponentsSortBy} direction={opponentsSortDir} onSort={handleOpponentSort} className="w-[120px]" />
                  <SortHeader label="Derniere rencontre" sortKey="lastSeen" activeKey={opponentsSortBy} direction={opponentsSortDir} onSort={handleOpponentSort} className="w-[130px]" />
                  <SortHeader label="Membres identifies" sortKey="memberCount" activeKey={opponentsSortBy} direction={opponentsSortDir} onSort={handleOpponentSort} />
                  <SortHeader label="Nombre de clans nous ayant croisés" sortKey="trackedClansCount" activeKey={opponentsSortBy} direction={opponentsSortDir} onSort={handleOpponentSort} />
                </tr>
              </thead>
              <tbody>
                {(opponentClans?.rows.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-slate-500">Aucun clan adverse pour ce filtre.</td>
                  </tr>
                ) : (
                  opponentClans?.rows.map((row: any) => (
                    <Fragment key={row.id}>
                      <tr className="app-table-row">
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => toggleFavorite(row)}
                            disabled={favoritePending.has(row.id)}
                            className="text-amber-500 hover:text-amber-600 disabled:opacity-50"
                          >
                            <Star className="h-4 w-4" fill={row.isFavorite ? 'currentColor' : 'none'} aria-hidden />
                          </button>
                        </td>
                        <td className="px-2 py-2 font-semibold text-slate-900">
                          <button
                            type="button"
                            onClick={() => toggleOpponentExpand(row.id)}
                            className="inline-flex items-center gap-1 text-left hover:underline"
                          >
                            {expandedOpponentId === row.id ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                            )}
                            {row.tag ? `[${row.tag}] ` : ''}
                            {row.name ?? 'Clan inconnu'}
                          </button>
                        </td>
                        <td className="px-2 py-2 tabular-nums">{row.asOpponentCount}</td>
                        <td className="px-2 py-2 tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            {row.asTeammateCount}
                            {row.asTeammateCount > row.asOpponentCount * 2 && row.asTeammateCount > 2 ? (
                              <Info className="h-3.5 w-3.5 text-cyan-600" aria-hidden />
                            ) : null}
                          </span>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(row.lastSeenAt)}</td>
                        <td className="px-2 py-2 tabular-nums">{row.memberCount}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {row.trackedClansCount > 0 ? row.trackedClansCount : '-'}
                        </td>
                      </tr>
                      {expandedOpponentId === row.id ? (
                        <tr>
                          <td colSpan={7} className="bg-gray-50 px-2 py-3">
                            <OpponentDetailPanel detail={opponentDetails[row.id]} opponentClanId={row.id} trackedClans={trackedClans?.rows || []} onTrack={handleTrackMember} trackPending={trackPending} onToggleFavorite={handleFavoritePlayer} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationBar pagination={opponentClans?.pagination} onPageChange={setOpponentsPage} />

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 shadow-sm dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-400">
            <h3 className="mb-2 font-semibold text-slate-800 dark:text-slate-200">Légende :</h3>
            <ul className="space-y-1.5">
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Fois adversaire :</strong> Nombre de fois où des joueurs de ce clan se sont retrouvés dans une équipe ennemie face à l'un de vos membres suivis.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Fois coéquipier :</strong> Nombre de fois où des joueurs de ce clan se sont retrouvés dans la même équipe (via le matchmaking automatique) qu'un de vos membres suivis.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Membres identifiés :</strong> Nombre de joueurs distincts de ce clan que le système a croisés et recensés au fil du temps.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Nombre de clans nous ayant croisés :</strong> Nombre de vos clans suivis qui ont rencontré ce clan adverse au moins une fois.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`flex min-w-[280px] items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-semibold shadow-xl transition-all ${
              n.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            <span>{n.message}</span>
            <button onClick={() => removeNotification(n.id)} className="ml-2 rounded-full p-1 opacity-70 hover:bg-white/20">
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ClanDetailPanel({ detail, clanId, onTrack, trackPending }: any) {
  if (!detail || detail.status === 'loading') return <p className="text-xs text-slate-500">Chargement...</p>
  if (detail.status === 'error') return <p className="text-xs text-rose-700">{detail.message}</p>
  const { members, missingCandidates } = detail.data
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Membres ({members.length})</p>
        <ul className="mt-1 space-y-1">
          {members.map((m: any) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-700">{m.displayName}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Candidats ({missingCandidates.length})</p>
        <ul className="mt-1 space-y-1">
          {missingCandidates.map((c: any) => (
            <li key={c.playerId} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-700">{c.pubgPlayerName}</span>
              <button onClick={() => onTrack(c.playerId, clanId)} disabled={trackPending.has(c.playerId)} className="app-btn app-btn--sm app-btn--secondary">Ajouter</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function OpponentDetailPanel({ detail, opponentClanId, trackedClans, onTrack, trackPending, onToggleFavorite }: any) {
  const [selectedClanId, setSelectedClanId] = useState<number>(trackedClans[0]?.id || 0)
  const [trackClanPending, setTrackClanPending] = useState(false)
  const [trackClanSuccess, setTrackClanSuccess] = useState(false)
  const [trackClanError, setTrackClanError] = useState('')

  if (!detail || detail.status === 'loading') return <p className="text-xs text-slate-500">Chargement...</p>
  if (detail.status === 'error') return <p className="text-xs text-rose-700">{detail.message}</p>
  const { players, playersLimit } = detail.data

  async function handleTrackClan() {
    try {
      setTrackClanPending(true)
      setTrackClanError('')
      
      const response = await fetch('/api/settings/clans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opponentClanId }),
      })
      
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Erreur lors de la création du clan')
        
      setTrackClanSuccess(true)
    } catch (err: any) {
      setTrackClanError(err.message)
    } finally {
      setTrackClanPending(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Joueurs ({players.length}
          {playersLimit && players.length >= playersLimit ? '+' : ''})
        </p>
        <div className="flex items-center gap-2">
          {trackClanError && <span className="text-[10px] text-rose-600 font-semibold">{trackClanError}</span>}
          {trackClanSuccess ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
              Clan suivi ajouté !
            </span>
          ) : (
            <button
              type="button"
              onClick={handleTrackClan}
              disabled={trackClanPending}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
              title="Créer ce clan en tant que nouveau clan suivi dans l'application"
            >
              <UserPlus className="h-3 w-3" aria-hidden />
              {trackClanPending ? 'Création...' : 'Suivre ce clan'}
            </button>
          )}
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {players.map((p: any) => (
          <li key={p.playerId} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1 text-slate-700">
              <button onClick={() => onToggleFavorite(p.playerId, p.isFavorite, opponentClanId)}>
                <Star className={`h-3.5 w-3.5 ${p.isFavorite ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} />
              </button>
              {p.pubgPlayerName}
            </span>
            <span className="flex items-center gap-2">
              {p.trackedMember ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-800">Membre de {p.trackedMember.clanTag}</span>
              ) : (
                <span className="flex items-center gap-1">
                  <button onClick={() => onTrack(p.playerId)} disabled={trackPending.has(p.playerId)} className="app-btn app-btn--sm app-btn--secondary">
                    <UserPlus className="h-3 w-3" />
                    Suivre
                  </button>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PaginationBar({ pagination, onPageChange }: any) {
  if (!pagination || pagination.total === 0) return null

  const page = pagination.page ?? 1
  const totalPages = pagination.totalPages ?? 1
  const total = pagination.total ?? 0
  const limit = 10 // Based on PAGE_SIZE in the API

  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)

  return (
    <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
      <span style={{ fontSize: '0.8rem', color: 'var(--theme-ui-text-muted)' }}>
        Lignes <strong style={{ color: 'var(--theme-ui-text)' }}>{start}–{end}</strong> sur <strong style={{ color: 'var(--theme-ui-text)' }}>{total}</strong>
      </span>
      <div className="app-pagination">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="app-pagination-button"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <span className="app-pagination-label">{page} / {totalPages}</span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="app-pagination-button"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="app-panel-muted p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
    </article>
  )
}
