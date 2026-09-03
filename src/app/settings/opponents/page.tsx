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
  CheckCircle2,
  AlertTriangle,
  Flame,
  Handshake,
} from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import SegmentedControl from '@/components/ui/SegmentedControl'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type SortDirection = 'asc' | 'desc'
type Period = 'week' | 'month' | 'all'
type ClanSortKey = 'name' | 'members' | 'encounters' | 'lastMatch'
type OpponentSortKey =
  | 'opponent'
  | 'asOpponent'
  | 'asTeammate'
  | 'totalEncounters'
  | 'lastSeen'
  | 'memberCount'
  | 'trackedClansCount'
  | 'favorite'

type Pagination = { page: number; pageSize: number; total: number; totalPages: number }
type TrackedClanRow = any
type OpponentClanRow = any
type DetailState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }
type ClanDetail = any
type OpponentClanDetail = any

function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatRelativeTime(dateStr: string | null) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diffSec < 60) return 'à l’instant'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `il y a ${diffHours} h`
  const diffDays = Math.floor(diffHours / 24)
  return `il y a ${diffDays} j`
}

function SortHeader<T extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className = '',
  tooltip,
}: {
  label: string
  sortKey: T
  activeKey: T
  direction: SortDirection
  onSort: (key: T) => void
  className?: string
  tooltip?: string
}) {
  const isActive = sortKey === activeKey
  return (
    <th className={`px-2.5 py-2.5 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-left transition-colors group"
        title={tooltip ? `${label} : ${tooltip}` : label}
      >
        <span>{label}</span>
        {tooltip && (
          <span
            title={tooltip}
            className="cursor-help"
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="h-3 w-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" />
          </span>
        )}
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden />
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

  // Period
  const [period, setPeriod] = useState<Period>('all')

  // Table 1 — Tracked Clans
  const [clansPage, setClansPage] = useState(1)
  const [clansSortBy, setClansSortBy] = useState<ClanSortKey>('name')
  const [clansSortDir, setClansSortDir] = useState<SortDirection>('asc')
  const [clansQueryInput, setClansQueryInput] = useState('')
  const [clansQuery, setClansQuery] = useState('')

  // Table 2 — Opponent Clans
  const [opponentsPage, setOpponentsPage] = useState(1)
  const [opponentsSortBy, setOpponentsSortBy] = useState<OpponentSortKey>('totalEncounters')
  const [opponentsSortDir, setOpponentsSortDir] = useState<SortDirection>('desc')
  const [opponentsQueryInput, setOpponentsQueryInput] = useState('')
  const [opponentsQuery, setOpponentsQuery] = useState('')
  const [opponentsFilter, setOpponentsFilter] = useState<'all' | 'favorites' | 'teammates'>('all')

  // Recalculation state
  const [isRecalculating, setIsRecalculating] = useState(false)
  const [recalcSuccess, setRecalcSuccess] = useState('')
  const [recalcError, setRecalcError] = useState('')

  // Favorite toggle state
  const [favoritePending, setFavoritePending] = useState<Set<string>>(new Set())

  // Expand state
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
          opponentsFilter,
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
    opponentsFilter,
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

  async function handleRecalculateStats() {
    if (
      !confirm(
        `Voulez-vous recalculer et synchroniser les statistiques de rencontres pour la période "${period === 'week' ? 'Semaine' : period === 'month' ? 'Mois' : 'Tous les matchs'}" ?\n\nCette opération mettra à jour l'ensemble des compteurs et classements de tous les clans adverses.`
      )
    ) {
      return
    }

    try {
      setIsRecalculating(true)
      setRecalcSuccess('')
      setRecalcError('')

      const res = await fetch('/api/settings/opponents/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Erreur serveur HTTP ${res.status}`)
      }

      const durSec = data.durationMs ? (data.durationMs / 1000).toFixed(1) : '1'
      setRecalcSuccess(`Statistiques recalculées avec succès en ${durSec}s !`)
      setRefreshKey((k) => k + 1)
    } catch (err: any) {
      setRecalcError(err.message || 'Échec du recalcul des statistiques')
    } finally {
      setIsRecalculating(false)
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
        body: JSON.stringify(bodyPayload),
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
              ),
            },
          }
        }
        return next
      })
      const res = await fetch(`/api/settings/players/${playerId}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !current }),
      })
      if (!res.ok) throw new Error('Failed to update favorite')
    } catch (err) {
      console.error(err)
    }
  }

  if (loading || !authenticated || !isSuperUser) return null
  if (loadingData && !payload) return <p className="p-4 text-sm text-slate-600">Chargement...</p>

  const trackedClans = payload?.trackedClans
  const opponentClans = payload?.opponentClans
  const counters = payload?.counters

  return (
    <div className={`space-y-4 ${loadingData ? 'opacity-70 pointer-events-none transition-opacity duration-200' : ''}`}>
      <section className="app-panel p-5 sm:p-7 space-y-6">
        {/* Top Header with Metric Cards & Recalculate */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Observatoire des Clans & Adversaires
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Surveillance globale des clans PUBG croisés par vos membres suivis.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <SegmentedControl
                size="sm"
                value={period}
                onChange={(value) => {
                  setClansPage(1)
                  setOpponentsPage(1)
                  setPeriod(value as Period)
                }}
                options={[
                  { value: 'week', label: '7 jours' },
                  { value: 'month', label: '30 jours' },
                  { value: 'all', label: 'Tous les temps' },
                ]}
              />

              <button
                type="button"
                onClick={handleRecalculateStats}
                disabled={isRecalculating || loadingData}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-xs"
                title="Recalculer les statistiques d’adversaires et synchroniser le cache"
              >
                <RefreshCcw className={cx('h-3.5 w-3.5', isRecalculating && 'animate-spin text-indigo-500')} />
                {isRecalculating ? 'Calcul en cours...' : 'Recalculer les stats'}
              </button>
            </div>
          </div>

          {/* Feedback messages for recalculation */}
          {recalcSuccess && (
            <div className="flex items-center gap-2 p-3 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{recalcSuccess}</span>
            </div>
          )}

          {recalcError && (
            <div className="flex items-center gap-2 p-3 text-xs font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400 rounded-lg border border-rose-200 dark:border-rose-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{recalcError}</span>
            </div>
          )}

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label="Clans suivis"
              value={Number(counters?.trackedClanCount ?? 0).toLocaleString()}
              tooltip="Nombre de clans officiellement gérés et surveillés dans l'application."
            />
            <MetricCard
              label="Clans adverses"
              value={Number(counters?.opponentClanCount ?? 0).toLocaleString()}
              tooltip="Nombre total de clans PUBG distincts rencontrés lors des matchs analysés."
            />
            <MetricCard
              label="Rencontres totales"
              value={Number(counters?.totalEncounters ?? 0).toLocaleString()}
              tooltip="Volume total de confrontations et d'interactions avec des joueurs d'autres clans."
            />
            <MetricCard
              label="Joueurs sans clan"
              value={Number(counters?.noClanPlayerCount ?? 0).toLocaleString()}
              tooltip="Nombre de joueurs croisés qui ne font partie d'aucun clan PUBG (joueurs solo / sans tag)."
            />
          </div>

          {counters?.lastComputedAt && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-right">
              Statistiques synchronisées {formatRelativeTime(counters.lastComputedAt)} (
              {new Date(counters.lastComputedAt).toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              )
            </p>
          )}
        </div>

        {error ? <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p> : null}

        {/* Tableau 1 — Clans suivis */}
        <div className="app-panel-muted p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Users className="h-4 w-4 text-indigo-500" aria-hidden />
              Vos clans suivis
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                ({trackedClans?.pagination?.total ?? 0})
              </span>
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={loadingData}
                className="ml-1 inline-flex items-center justify-center rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
                title="Rafraîchir les données de la page"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin text-indigo-500' : ''}`} aria-hidden />
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
              placeholder="Filtrer un clan suivi..."
              className="w-56 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="app-table-shell overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full table-fixed text-left text-xs text-slate-700 dark:text-slate-300">
              <thead>
                <tr className="app-table-head text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                  <SortHeader
                    label="Clan"
                    sortKey="name"
                    activeKey={clansSortBy}
                    direction={clansSortDir}
                    onSort={handleClanSort}
                    tooltip="Nom et tag officiel du clan géré."
                  />
                  <SortHeader
                    label="Effectif"
                    sortKey="members"
                    activeKey={clansSortBy}
                    direction={clansSortDir}
                    onSort={handleClanSort}
                    className="w-[100px]"
                    tooltip="Nombre de membres actifs enregistrés dans ce clan."
                  />
                  <SortHeader
                    label="Dernier match"
                    sortKey="lastMatch"
                    activeKey={clansSortBy}
                    direction={clansSortDir}
                    onSort={handleClanSort}
                    className="w-[130px]"
                    tooltip="Date du match le plus récent joué par l’un des membres de ce clan."
                  />
                  <th className="w-[150px] px-2.5 py-2.5">
                    <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Membres manquants
                      <span
                        title="Joueurs portant le tag de ce clan croisés en match mais non enregistrés dans l'effectif"
                        className="cursor-help"
                      >
                        <Info className="h-3 w-3 text-slate-400" />
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(trackedClans?.rows.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                      Aucun clan suivi ne correspond à ce filtre.
                    </td>
                  </tr>
                ) : (
                  trackedClans?.rows.map((row: any) => (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleClanExpand(row.id)}
                              className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-slate-100 hover:underline"
                            >
                              {expandedClanId === row.id ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                              )}
                              {row.name} <span className="text-slate-500 dark:text-slate-400">[{row.tag}]</span>
                            </button>
                            <Link
                              href={`/clans/${row.id}/telemetry/opponents`}
                              title="Voir la page adversaires dédiée à ce clan"
                              className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                          {row.membersCount}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {formatDateTime(row.lastMatchAt)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {row.missingMembersCount > 0 ? (
                            <span className="rounded-full border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 font-bold text-amber-800 dark:text-amber-400">
                              {row.missingMembersCount}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedClanId === row.id ? (
                        <tr>
                          <td colSpan={4} className="bg-slate-50/80 dark:bg-slate-900/60 px-4 py-3 border-t border-b border-slate-200 dark:border-slate-800">
                            <ClanDetailPanel
                              detail={clanDetails[row.id]}
                              clanId={row.id}
                              onTrack={handleTrackMember}
                              trackPending={trackPending}
                            />
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
        <div className="app-panel-muted p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-500" />
                Clans adversaires rencontrés
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  ({opponentClans?.pagination?.total ?? 0})
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Cliquez sur un en-tête pour trier les données réelles de haut en bas.
              </p>
            </div>

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
              placeholder="Rechercher par tag ou nom..."
              className="w-56 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setOpponentsFilter('all')
                setOpponentsPage(1)
              }}
              className={cx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                opponentsFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              )}
            >
              Tous les clans
            </button>
            <button
              type="button"
              onClick={() => {
                setOpponentsFilter('favorites')
                setOpponentsPage(1)
              }}
              className={cx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                opponentsFilter === 'favorites'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              )}
              title="Filtrer pour afficher uniquement vos clans favoris marqués d’une étoile"
            >
              <Star className="h-3.5 w-3.5 fill-current" />
              Favoris uniquement
            </button>
            <button
              type="button"
              onClick={() => {
                setOpponentsFilter('teammates')
                setOpponentsPage(1)
              }}
              className={cx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                opponentsFilter === 'teammates'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              )}
              title="Filtrer les clans ayant eu au moins un joueur placé dans votre équipe"
            >
              <Handshake className="h-3.5 w-3.5" />
              Avec coéquipiers (Fill)
            </button>
          </div>

          <div className="app-table-shell overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full table-fixed text-left text-xs text-slate-700 dark:text-slate-300">
              <thead>
                <tr className="app-table-head text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                  <th className="w-[45px] px-2 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => handleOpponentSort('favorite')}
                      className="text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
                      title="Trier par favoris"
                    >
                      <Star
                        className={cx(
                          'h-4 w-4 mx-auto',
                          opponentsSortBy === 'favorite' && 'fill-amber-400 text-amber-500'
                        )}
                      />
                    </button>
                  </th>
                  <SortHeader
                    label="Clan adverse"
                    sortKey="opponent"
                    activeKey={opponentsSortBy}
                    direction={opponentsSortDir}
                    onSort={handleOpponentSort}
                    className="w-[180px]"
                    tooltip="Nom et tag officiel du clan PUBG adverse."
                  />
                  <SortHeader
                    label="Total rencontres"
                    sortKey="totalEncounters"
                    activeKey={opponentsSortBy}
                    direction={opponentsSortDir}
                    onSort={handleOpponentSort}
                    className="w-[130px]"
                    tooltip="Nombre total de parties partagées avec ce clan (adversaires + coéquipiers combinés)."
                  />
                  <SortHeader
                    label="Fois adversaire"
                    sortKey="asOpponent"
                    activeKey={opponentsSortBy}
                    direction={opponentsSortDir}
                    onSort={handleOpponentSort}
                    className="w-[125px]"
                    tooltip="Nombre de confrontations directes où ce clan était dans une escouade ennemie."
                  />
                  <SortHeader
                    label="Fois coéquipier"
                    sortKey="asTeammate"
                    activeKey={opponentsSortBy}
                    direction={opponentsSortDir}
                    onSort={handleOpponentSort}
                    className="w-[125px]"
                    tooltip="Nombre de fois où des joueurs de ce clan ont été placés dans votre escouade via le matchmaking aléatoire (fill squad)."
                  />
                  <SortHeader
                    label="Dernière rencontre"
                    sortKey="lastSeen"
                    activeKey={opponentsSortBy}
                    direction={opponentsSortDir}
                    onSort={handleOpponentSort}
                    className="w-[130px]"
                    tooltip="Date du match le plus récent partagé avec ce clan."
                  />
                  <SortHeader
                    label="Membres identifiés"
                    sortKey="memberCount"
                    activeKey={opponentsSortBy}
                    direction={opponentsSortDir}
                    onSort={handleOpponentSort}
                    className="w-[120px]"
                    tooltip="Nombre total de joueurs distincts recensés dans ce clan."
                  />
                  <SortHeader
                    label="Clans nous ayant croisés"
                    sortKey="trackedClansCount"
                    activeKey={opponentsSortBy}
                    direction={opponentsSortDir}
                    onSort={handleOpponentSort}
                    tooltip="Nombre de vos clans suivis qui ont rencontré ce clan au moins une fois."
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(opponentClans?.rows.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                      Aucun clan adverse ne correspond aux filtres actifs.
                    </td>
                  </tr>
                ) : (
                  opponentClans?.rows.map((row: any) => (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-2 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleFavorite(row)}
                            disabled={favoritePending.has(row.id)}
                            className="text-amber-500 hover:text-amber-600 disabled:opacity-50 transition-transform active:scale-95"
                            title={row.isFavorite ? 'Retirer des favoris' : 'Marquer comme favori'}
                          >
                            <Star
                              className="h-4 w-4 mx-auto"
                              fill={row.isFavorite ? 'currentColor' : 'none'}
                              aria-hidden
                            />
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                          <button
                            type="button"
                            onClick={() => toggleOpponentExpand(row.id)}
                            className="inline-flex items-center gap-1.5 text-left hover:underline"
                          >
                            {expandedOpponentId === row.id ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                            )}
                            {row.tag ? (
                              <span className="text-indigo-600 dark:text-indigo-400">[{row.tag}]</span>
                            ) : null}
                            <span>{row.name ?? 'Clan inconnu'}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums font-bold text-slate-900 dark:text-slate-100">
                          {row.totalEncountersCount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                          {row.asOpponentCount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                          <span className="inline-flex items-center gap-1">
                            {row.asTeammateCount.toLocaleString()}
                            {row.asTeammateCount > row.asOpponentCount * 2 && row.asTeammateCount > 2 ? (
                              <span
                                title="Forte proportion de coéquipiers fortuits (fill squad) détectée"
                                className="cursor-help"
                              >
                                <Info className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" aria-hidden />
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {formatDateTime(row.lastSeenAt)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                          {row.memberCount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                          {row.trackedClansCount > 0 ? (
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                              {row.trackedClansCount}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedOpponentId === row.id ? (
                        <tr>
                          <td colSpan={8} className="bg-slate-50/80 dark:bg-slate-900/60 px-4 py-3 border-t border-b border-slate-200 dark:border-slate-800">
                            <OpponentDetailPanel
                              detail={opponentDetails[row.id]}
                              opponentClanId={row.id}
                              trackedClans={trackedClans?.rows || []}
                              onTrack={handleTrackMember}
                              trackPending={trackPending}
                              onToggleFavorite={handleFavoritePlayer}
                              onClanTracked={() => {
                                addNotification('Clan suivi créé avec succès !', 'success')
                                setRefreshKey((k) => k + 1)
                              }}
                            />
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

          {/* Explanatory Legend Card */}
          <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-4 text-xs text-slate-600 dark:text-slate-400 space-y-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Info className="h-4 w-4 text-indigo-500" />
              Légende détaillée des statistiques :
            </h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] leading-relaxed">
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Total rencontres :</strong> Volume global des parties partagées avec des membres de ce clan, tous modes confondus.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Fois adversaire :</strong> Nombre de fois où des joueurs de ce clan se sont retrouvés dans une escouade ennemie face à l&apos;un de vos membres suivis.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Fois coéquipier :</strong> Nombre de fois où des joueurs de ce clan ont été placés dans la même escouade que l&apos;un de vos membres suivis (via le matchmaking aléatoire de PUBG).
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Membres identifiés :</strong> Nombre de joueurs uniques distincts de ce clan que le système a croisés et recensés au fil du temps.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Clans nous ayant croisés :</strong> Nombre de vos clans suivis qui ont rencontré ce clan adverse au moins une fois.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-300">Favoris ⭐ :</strong> Permet d&apos;épingler des clans rivaux ou partenaires majeurs pour les surveiller et les filtrer en 1 clic.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Floating Notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`flex min-w-[280px] items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs font-semibold shadow-xl transition-all ${
              n.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            <span>{n.message}</span>
            <button
              onClick={() => removeNotification(n.id)}
              className="ml-2 rounded-full p-1 opacity-70 hover:bg-white/20"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ClanDetailPanel({ detail, clanId, onTrack, trackPending }: any) {
  if (!detail || detail.status === 'loading') return <p className="text-xs text-slate-500">Chargement des membres...</p>
  if (detail.status === 'error') return <p className="text-xs text-rose-700">{detail.message}</p>
  const { members, missingCandidates } = detail.data
  return (
    <div className="grid gap-4 sm:grid-cols-2 text-xs">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
          Membres enregistrés ({members.length})
        </p>
        <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {members.map((m: any) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300 py-0.5">
              <span>{m.displayName}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
          Candidats détectés ({missingCandidates.length})
        </p>
        <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {missingCandidates.length === 0 ? (
            <li className="text-slate-400 dark:text-slate-600 italic">Aucun membre manquant détecté.</li>
          ) : (
            missingCandidates.map((c: any) => (
              <li key={c.playerId} className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-slate-700 dark:text-slate-300 font-medium">{c.pubgPlayerName}</span>
                <button
                  onClick={() => onTrack(c.playerId, clanId)}
                  disabled={trackPending.has(c.playerId)}
                  className="app-btn app-btn--sm app-btn--secondary text-[11px] px-2 py-0.5"
                >
                  Ajouter à l&apos;effectif
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

function OpponentDetailPanel({
  detail,
  opponentClanId,
  trackedClans,
  onTrack,
  trackPending,
  onToggleFavorite,
  onClanTracked,
}: any) {
  const [trackClanPending, setTrackClanPending] = useState(false)
  const [trackClanSuccess, setTrackClanSuccess] = useState(false)
  const [trackClanError, setTrackClanError] = useState('')

  if (!detail || detail.status === 'loading')
    return <p className="text-xs text-slate-500 dark:text-slate-400">Chargement des joueurs de ce clan...</p>
  if (detail.status === 'error')
    return <p className="text-xs text-rose-700 dark:text-rose-400">{detail.message}</p>
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
      if (onClanTracked) onClanTracked()
    } catch (err: any) {
      setTrackClanError(err.message)
    } finally {
      setTrackClanPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Joueurs recensés ({players.length}
          {playersLimit && players.length >= playersLimit ? '+' : ''})
        </p>
        <div className="flex items-center gap-2">
          {trackClanError && (
            <span className="text-[10px] text-rose-600 font-semibold">{trackClanError}</span>
          )}
          {trackClanSuccess ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
              Clan suivi créé avec succès !
            </span>
          ) : (
            <button
              type="button"
              onClick={handleTrackClan}
              disabled={trackClanPending}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 disabled:opacity-50 transition-colors"
              title="Promouvoir ce clan adverse en clan suivi dans l'application"
            >
              <UserPlus className="h-3 w-3" aria-hidden />
              {trackClanPending ? 'Création en cours...' : 'Suivre ce clan'}
            </button>
          )}
        </div>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
        {players.map((p: any) => (
          <li
            key={p.playerId}
            className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
          >
            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 truncate">
              <button
                type="button"
                onClick={() => onToggleFavorite(p.playerId, p.isFavorite, opponentClanId)}
                title={p.isFavorite ? 'Retirer joueur des favoris' : 'Marquer joueur en favori'}
              >
                <Star
                  className={`h-3.5 w-3.5 shrink-0 ${
                    p.isFavorite ? 'fill-amber-400 text-amber-500' : 'text-slate-400'
                  }`}
                />
              </button>
              <span className="truncate font-medium">{p.pubgPlayerName}</span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              {p.trackedMember ? (
                <span className="rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:text-emerald-400">
                  {p.trackedMember.clanTag}
                </span>
              ) : (
                <button
                  onClick={() => onTrack(p.playerId)}
                  disabled={trackPending.has(p.playerId)}
                  className="app-btn app-btn--sm app-btn--secondary text-[10px] px-2 py-0.5"
                  title="Suivre ce joueur"
                >
                  <UserPlus className="h-3 w-3" />
                  Suivre
                </button>
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
  const limit = 10

  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)

  return (
    <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Lignes <strong className="text-slate-800 dark:text-slate-200">{start}–{end}</strong> sur{' '}
        <strong className="text-slate-800 dark:text-slate-200">{total.toLocaleString()}</strong>
      </span>
      <div className="app-pagination flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="app-pagination-button p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <span className="app-pagination-label text-xs font-semibold px-2 text-slate-700 dark:text-slate-300">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="app-pagination-button p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  tooltip,
}: {
  label: string
  value: string
  tooltip?: string
}) {
  return (
    <article className="app-panel-muted p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 dark:bg-slate-900/60 relative">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        {tooltip && (
          <span title={tooltip} className="cursor-help">
            <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" />
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
        {value}
      </p>
    </article>
  )
}
