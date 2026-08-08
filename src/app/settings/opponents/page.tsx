'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  Star,
  UserPlus,
  Users,
} from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SegmentedControl from '@/components/ui/SegmentedControl'

type Period = 'week' | 'month' | 'all'
type SortDirection = 'asc' | 'desc'
type ClanSortKey = 'name' | 'members' | 'encounters' | 'lastMatch'
type OpponentSortKey = 'opponent' | 'asOpponent' | 'asTeammate' | 'lastSeen'

type TrackedClanRow = {
  id: number
  name: string
  tag: string
  membersCount: number
  encounterCount: number
  lastMatchAt: string | null
  missingMembersCount: number
}

type OpponentClanRow = {
  id: string
  tag: string | null
  name: string | null
  isFavorite: boolean
  asOpponentCount: number
  asTeammateCount: number
  lastSeenAt: string
  trackedClanTags: string[]
}

type Pagination = { page: number; pageSize: number; total: number; totalPages: number }

type ClanMemberDetail = { id: number; displayName: string; pubgPlayerName: string; joinStatus: string }
type MissingCandidate = { playerId: string; pubgPlayerName: string; pubgAccountId: string; lastSeenAt: string }
type ClanDetail = {
  members: ClanMemberDetail[]
  missingCandidates: MissingCandidate[]
  missingCandidatesLimit: number
}

type OpponentPlayer = {
  playerId: string
  pubgPlayerName: string
  isFavorite: boolean
  asOpponentCount: number
  asTeammateCount: number
  lastSeenAt: string
  trackedMember: { id: number; displayName: string | null; clanTag: string | null } | null
}
type OpponentClanDetail = { players: OpponentPlayer[]; playersLimit: number }

type DetailState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }

type OpponentsPayload = {
  counters: {
    trackedClanCount: number
    opponentClanCount: number
    totalEncounters: number
    noClanPlayerCount: number
  }
  trackedClans: { rows: TrackedClanRow[]; pagination: Pagination }
  opponentClans: { rows: OpponentClanRow[]; pagination: Pagination }
}

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

export default function OpponentsSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [payload, setPayload] = useState<OpponentsPayload | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [period, setPeriod] = useState<Period>('all')

  const [clansPage, setClansPage] = useState(1)
  const [clansSortBy, setClansSortBy] = useState<ClanSortKey>('encounters')
  const [clansSortDir, setClansSortDir] = useState<SortDirection>('desc')
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


  const [notifications, setNotifications] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([])

  function addNotification(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now()
    setNotifications((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, 4000)
  }

  function removeNotification(id: number) {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const [expandedOpponentId, setExpandedOpponentId] = useState<string | null>(null)

  const [opponentDetails, setOpponentDetails] = useState<Record<string, DetailState<OpponentClanDetail>>>({})

  const [trackPending, setTrackPending] = useState<Set<string>>(new Set())

  async function handleTrackMember(playerId: string, targetClanId: number) {
    try {
      setTrackPending((prev) => new Set(prev).add(playerId))
      const res = await fetch('/api/settings/opponents/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, targetClanId })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Erreur lors du suivi')
      addNotification('Joueur suivi avec succès !', 'success')
      
      // Auto-refresh the UI
      setExpandedClanId(null)
      setExpandedOpponentId(null)
      setClanDetails({})
      setOpponentDetails({})
      setRefreshKey((k) => k + 1)
    } catch (err: any) {
      console.error(err)
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
              players: next[opponentClanId].data.players.map((p) =>
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

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/opponents')
    }
  }, [authenticated, loading, router])

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) {
      return
    }

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

        const nextPayload = (await response.json().catch(() => null)) as
          | OpponentsPayload
          | { error?: string }
          | null

        if (!response.ok) {
          throw new Error((nextPayload as { error?: string } | null)?.error ?? 'Chargement impossible')
        }

        if (!cancelled) {
          setPayload(nextPayload as OpponentsPayload)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Chargement impossible')
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false)
        }
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
    if (favoritePending.has(row.id) || !payload) {
      return
    }

    const nextValue = !row.isFavorite

    setFavoritePending((current) => new Set(current).add(row.id))
    setPayload({
      ...payload,
      opponentClans: {
        ...payload.opponentClans,
        rows: payload.opponentClans.rows.map((item) =>
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
      if (!response.ok) {
        throw new Error('Echec de la mise a jour du favori')
      }
    } catch {
      setPayload((current) =>
        current
          ? {
              ...current,
              opponentClans: {
                ...current.opponentClans,
                rows: current.opponentClans.rows.map((item) =>
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
          const body = (await response.json().catch(() => null)) as ClanDetail | { error?: string } | null
          if (!response.ok) {
            throw new Error((body as { error?: string } | null)?.error ?? 'Chargement impossible')
          }
          setClanDetails((current) => ({ ...current, [next]: { status: 'ready', data: body as ClanDetail } }))
        })
        .catch((detailError) => {
          setClanDetails((current) => ({
            ...current,
            [next]: {
              status: 'error',
              message: detailError instanceof Error ? detailError.message : 'Chargement impossible',
            },
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
          const body = (await response.json().catch(() => null)) as
            | OpponentClanDetail
            | { error?: string }
            | null
          if (!response.ok) {
            throw new Error((body as { error?: string } | null)?.error ?? 'Chargement impossible')
          }
          setOpponentDetails((current) => ({
            ...current,
            [next]: { status: 'ready', data: body as OpponentClanDetail },
          }))
        })
        .catch((detailError) => {
          setOpponentDetails((current) => ({
            ...current,
            [next]: {
              status: 'error',
              message: detailError instanceof Error ? detailError.message : 'Chargement impossible',
            },
          }))
        })
    }
  }

  if (loading || loadingData) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-600">Chargement des adversaires...</p>
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

  const trackedClans = payload?.trackedClans
  const opponentClans = payload?.opponentClans
  const counters = payload?.counters

  return (
    <main className="app-container app-main flex-1">
      <section className="app-panel mb-4 p-4">
        <SettingsPageHeader
          title="Adversaires"
          subtitle="Vue transverse des clans suivis et des clans adverses croises en match, tous clans suivis confondus."
        />
      </section>

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

          <div className="mt-4 space-y-2 md:hidden">
            {(trackedClans?.rows.length ?? 0) === 0 ? (
              <p className="app-panel p-3 text-xs text-slate-600">Aucun clan suivi.</p>
            ) : (
              trackedClans?.rows.map((row) => (
                <article key={row.id} className="app-panel p-3 text-xs text-slate-700">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleClanExpand(row.id)}
                      className="inline-flex items-center gap-1 text-left font-semibold text-slate-900"
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
                      className="shrink-0 text-slate-400"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                    <p>Effectif : {row.membersCount}</p>
                    <p>Rencontres : {row.encounterCount}</p>
                    <p>Dernier match : {formatDateTime(row.lastMatchAt)}</p>
                    {row.missingMembersCount > 0 ? (
                      <p className="font-semibold text-amber-700">
                        Membres manquants : {row.missingMembersCount}
                      </p>
                    ) : null}
                  </div>
                  {expandedClanId === row.id ? (
                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <ClanDetailPanel detail={clanDetails[row.id]} clanId={row.id} onTrack={handleTrackMember} trackPending={trackPending} />
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>

          <div className="app-table-shell mt-4 hidden overflow-x-auto md:block">
            <table className="min-w-full table-fixed text-left text-xs text-slate-700">
              <thead>
                <tr className="app-table-head text-[11px] uppercase tracking-wide text-slate-500">
                  <SortHeader label="Clan" sortKey="name" activeKey={clansSortBy} direction={clansSortDir} onSort={handleClanSort} />
                  <SortHeader label="Effectif" sortKey="members" activeKey={clansSortBy} direction={clansSortDir} onSort={handleClanSort} className="w-[90px]" />
                  <SortHeader label="Rencontres" sortKey="encounters" activeKey={clansSortBy} direction={clansSortDir} onSort={handleClanSort} className="w-[100px]" />
                  <SortHeader label="Dernier match" sortKey="lastMatch" activeKey={clansSortBy} direction={clansSortDir} onSort={handleClanSort} className="w-[120px]" />
                  <th className="w-[130px] px-2 py-2">Membres manquants</th>
                </tr>
              </thead>
              <tbody>
                {(trackedClans?.rows.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-slate-500">
                      Aucun clan suivi.
                    </td>
                  </tr>
                ) : (
                  trackedClans?.rows.map((row) => (
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
                        <td className="px-2 py-2 tabular-nums">{row.encounterCount}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(row.lastMatchAt)}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {row.missingMembersCount > 0 ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                              {row.missingMembersCount}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                      {expandedClanId === row.id ? (
                        <tr>
                          <td colSpan={5} className="bg-gray-50 px-2 py-3">
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

          <PaginationBar
            pagination={trackedClans?.pagination}
            onPageChange={setClansPage}
          />
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

          <div className="mt-4 space-y-2 md:hidden">
            {(opponentClans?.rows.length ?? 0) === 0 ? (
              <p className="app-panel p-3 text-xs text-slate-600">Aucun clan adverse pour ce filtre.</p>
            ) : (
              opponentClans?.rows.map((row) => (
                <OpponentMobileCard
                  key={row.id}
                  row={row}
                  pending={favoritePending.has(row.id)}
                  onToggleFavorite={() => toggleFavorite(row)}
                  expanded={expandedOpponentId === row.id}
                  onToggleExpand={() => toggleOpponentExpand(row.id)}
                  detail={opponentDetails[row.id]}
                  trackedClans={trackedClans?.rows || []}
                  onTrack={handleTrackMember}
                  trackPending={trackPending}
                  onTogglePlayerFavorite={handleFavoritePlayer}
                />
              ))
            )}
          </div>

          <div className="app-table-shell mt-4 hidden overflow-x-auto md:block">
            <table className="min-w-full table-fixed text-left text-xs text-slate-700">
              <thead>
                <tr className="app-table-head text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="w-[40px] px-2 py-2" />
                  <SortHeader label="Clan adverse" sortKey="opponent" activeKey={opponentsSortBy} direction={opponentsSortDir} onSort={handleOpponentSort} />
                  <SortHeader label="Fois adversaire" sortKey="asOpponent" activeKey={opponentsSortBy} direction={opponentsSortDir} onSort={handleOpponentSort} className="w-[120px]" />
                  <SortHeader label="Fois coequipier" sortKey="asTeammate" activeKey={opponentsSortBy} direction={opponentsSortDir} onSort={handleOpponentSort} className="w-[120px]" />
                  <SortHeader label="Derniere rencontre" sortKey="lastSeen" activeKey={opponentsSortBy} direction={opponentsSortDir} onSort={handleOpponentSort} className="w-[130px]" />
                  <th className="px-2 py-2">Clans nous ayant croises</th>
                </tr>
              </thead>
              <tbody>
                {(opponentClans?.rows.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-slate-500">
                      Aucun clan adverse pour ce filtre.
                    </td>
                  </tr>
                ) : (
                  opponentClans?.rows.map((row) => (
                    <Fragment key={row.id}>
                      <tr className="app-table-row">
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => toggleFavorite(row)}
                            disabled={favoritePending.has(row.id)}
                            aria-label={row.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
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
                              <span title="Vu bien plus souvent comme coequipier que comme adversaire — probablement un clan allie.">
                                <Info className="h-3.5 w-3.5 text-cyan-600" aria-hidden />
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(row.lastSeenAt)}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            {row.trackedClanTags.map((tag, index) => (
                              <span
                                key={`${row.id}-${tag}-${index}`}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                      {expandedOpponentId === row.id ? (
                        <tr>
                          <td colSpan={6} className="bg-gray-50 px-2 py-3">
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

          <PaginationBar
            pagination={opponentClans?.pagination}
            onPageChange={setOpponentsPage}
          />
        </div>
      </section>

      {/* Notifications Toast */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`flex min-w-[280px] items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-semibold shadow-xl transition-all ${
              n.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            <span>{n.message}</span>
            <button
              onClick={() => removeNotification(n.id)}
              className="ml-2 rounded-full p-1 opacity-70 hover:bg-white/20 hover:opacity-100 transition-colors"
              aria-label="Fermer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}

function OpponentMobileCard({
  row,
  pending,
  onToggleFavorite,
  expanded,
  onToggleExpand,
  detail,
  trackedClans,
  onTrack,
  trackPending,
  onTogglePlayerFavorite,
}: {
  row: OpponentClanRow
  pending: boolean
  onToggleFavorite: () => void
  expanded: boolean
  onToggleExpand: () => void
  detail: DetailState<OpponentClanDetail> | undefined
  trackedClans: TrackedClanRow[]
  onTrack: (playerId: string, targetClanId: number) => void
  trackPending: Set<string>
  onTogglePlayerFavorite: (playerId: string, current: boolean, opponentClanId: string) => void
}) {
  return (
    <article className="app-panel p-3 text-xs text-slate-700">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex items-center gap-1 text-left font-semibold text-slate-900"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          )}
          {row.tag ? `[${row.tag}] ` : ''}
          {row.name ?? 'Clan inconnu'}
        </button>
        <button
          type="button"
          onClick={onToggleFavorite}
          disabled={pending}
          aria-label={row.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          className="shrink-0 text-amber-500 hover:text-amber-600 disabled:opacity-50"
        >
          <Star className="h-4 w-4" fill={row.isFavorite ? 'currentColor' : 'none'} aria-hidden />
        </button>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
        <p>Adversaire : {row.asOpponentCount}</p>
        <p>Coequipier : {row.asTeammateCount}</p>
        <p>Derniere rencontre : {formatDateTime(row.lastSeenAt)}</p>
      </div>
      {row.trackedClanTags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {row.trackedClanTags.map((tag, index) => (
            <span
              key={`${row.id}-${tag}-${index}`}
              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {expanded ? (
        <div className="mt-2 border-t border-slate-200 pt-2">
          <OpponentDetailPanel detail={detail} opponentClanId={row.id} trackedClans={trackedClans} onTrack={onTrack} trackPending={trackPending} onToggleFavorite={onTogglePlayerFavorite} />
        </div>
      ) : null}
    </article>
  )
}

function ClanDetailPanel({ 
  detail, clanId, onTrack, trackPending 
}: { 
  detail: DetailState<ClanDetail> | undefined
  clanId: number
  onTrack: (playerId: string, clanId: number) => void
  trackPending: Set<string>
}) {
  if (!detail || detail.status === 'loading') {
    return <p className="text-xs text-slate-500">Chargement...</p>
  }
  if (detail.status === 'error') {
    return <p className="text-xs text-rose-700">{detail.message}</p>
  }

  const { members, missingCandidates, missingCandidatesLimit } = detail.data

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Membres ({members.length})
        </p>
        {members.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">Aucun membre actif.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-700">{member.displayName}</span>
                <span className="text-[10px] text-slate-400">{member.joinStatus}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Membres manquants détectés ({missingCandidates.length}
          {missingCandidates.length >= missingCandidatesLimit ? '+' : ''})
        </p>
        {missingCandidates.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">Aucun candidat détecté.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {missingCandidates.map((candidate) => (
              <li key={candidate.playerId} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-700">{candidate.pubgPlayerName}</span>
                <button
                  type="button"
                  onClick={() => onTrack(candidate.playerId, clanId)}
                  disabled={trackPending.has(candidate.playerId)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <UserPlus className="h-3 w-3" aria-hidden />
                  {trackPending.has(candidate.playerId) ? 'Ajout...' : 'Ajouter'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function OpponentDetailPanel({ 
  detail, opponentClanId, trackedClans, onTrack, trackPending, onToggleFavorite 
}: { 
  detail: DetailState<OpponentClanDetail> | undefined
  opponentClanId: string
  trackedClans: TrackedClanRow[]
  onTrack: (playerId: string, targetClanId: number) => void
  trackPending: Set<string>
  onToggleFavorite: (playerId: string, current: boolean, opponentClanId: string) => void
}) {
  const [selectedClanId, setSelectedClanId] = useState<number>(trackedClans[0]?.id || 0)
  if (!detail || detail.status === 'loading') {
    return <p className="text-xs text-slate-500">Chargement...</p>
  }
  if (detail.status === 'error') {
    return <p className="text-xs text-rose-700">{detail.message}</p>
  }

  const { players, playersLimit } = detail.data

  if (players.length === 0) {
    return <p className="text-xs text-slate-500">Aucun joueur pour ce clan adverse.</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Joueurs ({players.length}
          {players.length >= playersLimit ? '+' : ''})
        </p>
        <span
          title="Suivre l'ensemble de ce clan comme nouveau clan tracké n'est pas encore implémenté — chantier distinct (onboarding complet, pas juste un membre)"
          className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400"
        >
          <UserPlus className="h-3 w-3" aria-hidden />
          Suivre ce clan
        </span>
      </div>
      <ul className="mt-1 space-y-1">
        {players.map((player) => (
          <li key={player.playerId} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1 text-slate-700">
              <button onClick={() => onToggleFavorite(player.playerId, player.isFavorite, opponentClanId)} className="text-slate-400 hover:text-amber-500">
                <Star className={`h-3.5 w-3.5 ${player.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
              </button>
              {player.pubgPlayerName}
            </span>
            <span className="flex items-center gap-2">
              {player.trackedMember ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  Membre de {player.trackedMember.clanTag ?? '?'}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <select
                    className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-700"
                    value={selectedClanId}
                    onChange={(e) => setSelectedClanId(Number(e.target.value))}
                  >
                    {trackedClans.map(c => <option key={c.id} value={c.id}>{c.tag}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedClanId) onTrack(player.playerId, selectedClanId)
                    }}
                    disabled={trackPending.has(player.playerId)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <UserPlus className="h-3 w-3" aria-hidden />
                    {trackPending.has(player.playerId) ? '...' : 'Suivre'}
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

function PaginationBar({
  pagination,
  onPageChange,
}: {
  pagination: Pagination | undefined
  onPageChange: (page: number) => void
}) {
  const page = pagination?.page ?? 1
  const totalPages = pagination?.totalPages ?? 1
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
      <p className="text-slate-500">
        Page {page} sur {totalPages} • {pagination?.total ?? 0} ligne(s)
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="app-btn app-btn--sm app-btn--secondary"
        >
          Precedent
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="app-btn app-btn--sm app-btn--secondary"
        >
          Suivant
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
