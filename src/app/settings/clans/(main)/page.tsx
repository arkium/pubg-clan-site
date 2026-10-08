'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Fragment, Suspense, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronRight,
  Flame,
  Handshake,
  Info,
  RefreshCcw,
  RotateCw,
  Search,
  Star,
  UserPlus,
  Users,
} from 'lucide-react'

import ClanArchiveDialog from '@/components/clan/ClanArchiveDialog'
import { KpiGrid, type Kpi } from '@/components/matches/MatchesUi'
import {
  Callout,
  ClanLabel,
  ConfirmDialog,
  EmptyState,
  ListSkeleton,
  SectionCard,
  Tag,
  ToastStack,
  type Toast,
} from '@/components/ui/CharteKit'
import Pagination from '@/components/ui/Pagination'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SortableTh from '@/components/ui/SortableTh'
import { useAuthSession } from '@/hooks/useAuthSession'

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

type PageInfo = { page: number; pageSize: number; total: number; totalPages: number }
// Formes renvoyées par GET /api/settings/opponents et ses routes de détail.
type TrackedClanRow = {
  id: number
  name: string
  tag: string
  /** Clan technique (Ungrouped) : jamais archivable. */
  isSystem: boolean
  membersCount: number
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
  totalEncountersCount: number
  lastSeenAt: string | null
  memberCount: number
  trackedClansCount: number
}
type OpponentsPayload = {
  counters: {
    trackedClanCount: number
    opponentClanCount: number
    totalEncounters: number
    noClanPlayerCount: number
    lastComputedAt: string | null
  }
  trackedClans: { rows: TrackedClanRow[]; pagination: PageInfo }
  opponentClans: { rows: OpponentClanRow[]; pagination: PageInfo }
}
type DetailState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }
type ClanDetail = {
  members: Array<{ id: number; displayName: string }>
  missingCandidates: Array<{ playerId: string; pubgPlayerName: string; trackedElsewhere: { clanTag: string | null } | null }>
}
type OpponentPlayer = { playerId: string; pubgPlayerName: string; isFavorite: boolean; trackedMember: { clanTag: string | null } | null }
type OpponentClanDetail = { players: OpponentPlayer[]; playersLimit: number }
type TrackMember = (playerId: string, targetClanId?: number) => void

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatRelativeTime(dateStr: string | null) {
  if (!dateStr) return '—'
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

/**
 * Clans suivis et clans adverses rencontrés, selon la charte UI (docs/ui/index.html) : indicateurs, tableaux triables
 * par leurs en-têtes (`SortableTh`), cartes sous `md` au lieu d'un défilement horizontal, confirmations dans la page.
 */
export default function OpponentsExplorerPage() {
  // `?opponentsQ=` : lien « Confrontations » des clans en attente de `/settings/clans/lifecycle`.
  // useSearchParams impose une frontière Suspense (CLAUDE.md, piège n° 5).
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <OpponentsExplorer />
    </Suspense>
  )
}

function OpponentsExplorer() {
  const { loading, authenticated, isSuperUser } = useAuthSession()
  const searchParams = useSearchParams()

  const [payload, setPayload] = useState<OpponentsPayload | null>(null)
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
  const [opponentsQueryInput, setOpponentsQueryInput] = useState(() => searchParams.get('opponentsQ') ?? '')
  const [opponentsQuery, setOpponentsQuery] = useState(() => (searchParams.get('opponentsQ') ?? '').trim())
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
  // Arrêt de suivi d'un clan (docs/TODO/clan-archive.md) : clan dont la boîte est ouverte.
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; name: string; tag: string } | null>(null)
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false)
  // Joueur déjà membre actif d'un autre clan suivi (409) : le SuperUser confirme le déplacement dans la page.
  const [moveConfirm, setMoveConfirm] = useState<{ playerId: string; targetClanId?: number; message: string } | null>(null)
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
    } catch (err) {
      setRecalcError(err instanceof Error && err.message ? err.message : 'Échec du recalcul des statistiques')
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
      if (!response.ok) throw new Error('Échec de la mise à jour')
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

  async function handleTrackMember(playerId: string, targetClanId?: number, confirmMove = false) {
    try {
      setTrackPending((prev) => new Set(prev).add(playerId))
      const bodyPayload: { playerId: string; targetClanId?: number; confirmMove?: boolean } = { playerId }
      if (targetClanId) bodyPayload.targetClanId = targetClanId
      if (confirmMove) bodyPayload.confirmMove = true

      const res = await fetch('/api/settings/opponents/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      })
      const body = await res.json()

      // 409 = le joueur est déjà membre actif d'un autre clan suivi. L'API refuse
      // de le déplacer en silence : le SuperUser tranche explicitement.
      if (res.status === 409 && body?.error === 'member_tracked_elsewhere' && !confirmMove) {
        setMoveConfirm({ playerId, targetClanId, message: body.message })
        return
      }

      if (!res.ok) throw new Error(body.message || body.error || 'Erreur lors du suivi')
      addNotification('Joueur suivi avec succès !', 'success')

      setExpandedClanId(null)
      setExpandedOpponentId(null)
      setClanDetails({})
      setOpponentDetails({})
      setRefreshKey((k) => k + 1)
    } catch (err) {
      addNotification(err instanceof Error && err.message ? err.message : 'Erreur inconnue', 'error')
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
        const entry = prev[opponentClanId]
        if (entry?.status !== 'ready') return prev
        const players = entry.data.players.map((p) => (p.playerId === playerId ? { ...p, isFavorite: !current } : p))
        return { ...prev, [opponentClanId]: { status: 'ready', data: { ...entry.data, players } } }
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
  if (loadingData && !payload) return <ListSkeleton rows={4} />

  const trackedClans = payload?.trackedClans
  const opponentClans = payload?.opponentClans
  const counters = payload?.counters
  const toasts: Toast[] = notifications.map((n) => ({ id: n.id, text: n.message, tone: n.type }))

  const kpis: Kpi[] = [
    {
      label: 'Clans suivis',
      value: Number(counters?.trackedClanCount ?? 0).toLocaleString('fr-FR'),
      detail: 'gérés par la plateforme',
      icon: Users,
      color: 'var(--game-pos)',
    },
    {
      label: 'Clans adverses',
      value: Number(counters?.opponentClanCount ?? 0).toLocaleString('fr-FR'),
      detail: 'clans PUBG croisés en match',
      icon: Flame,
      color: 'var(--game-warn)',
    },
    {
      label: 'Rencontres',
      value: Number(counters?.totalEncounters ?? 0).toLocaleString('fr-FR'),
      detail: 'face à face ou coéquipiers',
      icon: Handshake,
      color: 'var(--game-sky)',
    },
    {
      label: 'Joueurs sans clan',
      value: Number(counters?.noClanPlayerCount ?? 0).toLocaleString('fr-FR'),
      detail: 'croisés sans tag de clan',
      icon: UserPlus,
      color: 'var(--game-gold)',
    },
  ]

  return (
    <div
      aria-busy={loadingData}
      className={`flex flex-col gap-5 ${loadingData ? 'pointer-events-none opacity-60 transition-opacity duration-200' : ''}`}
    >
      <section className="flex flex-col gap-2.5" aria-labelledby="clans-overview-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="clans-overview-title" className="t-section-title m-0">
            Clans et adversaires
          </h2>
          <div className="flex flex-wrap items-center gap-2">
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
                { value: 'all', label: 'Tous' },
              ]}
            />
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loadingData}
              className="app-btn app-btn--sm app-btn--secondary"
              aria-label="Actualiser les données de la page"
              title="Actualiser les données de la page"
            >
              <RotateCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setRecalcConfirmOpen(true)}
              disabled={isRecalculating || loadingData}
              className="app-btn app-btn--sm app-btn--secondary gap-1.5"
              aria-label="Recalculer les statistiques d’adversaires"
              title="Recalculer les statistiques d’adversaires et le cache"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${isRecalculating ? 'animate-spin' : ''}`} aria-hidden="true" />
              {/* Libellé masqué sous 640 px : la période, l'actualisation et le recalcul tiennent sur une ligne. */}
              <span className="hidden sm:inline">{isRecalculating ? 'Calcul en cours…' : 'Recalculer'}</span>
            </button>
          </div>
        </div>
        {recalcSuccess ? (
          <p className="t-body t-pos m-0 flex items-center gap-2" role="status">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {recalcSuccess}
          </p>
        ) : null}
        {recalcError ? (
          <p className="t-body t-neg m-0 flex items-center gap-2" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {recalcError}
          </p>
        ) : null}
        <KpiGrid items={kpis} className="grid-cols-2 lg:grid-cols-4" />
        {counters?.lastComputedAt ? (
          <p className="t-meta m-0 text-right">
            Statistiques calculées {formatRelativeTime(counters.lastComputedAt)} (
            {new Date(counters.lastComputedAt).toLocaleString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
            )
          </p>
        ) : null}
        {error ? <p className="t-body t-neg m-0">{error}</p> : null}
      </section>

      <SectionCard
        id="tracked-clans-title"
        icon={Users}
        title={`Clans suivis (${trackedClans?.pagination?.total ?? 0})`}
        meta="Clans gérés par la plateforme. Ouvrir une ligne pour voir l’effectif et les membres manquants."
      >
        <SearchField
          label="Filtrer un clan suivi"
          value={clansQueryInput}
          onChange={setClansQueryInput}
          onCommit={() => {
            setClansPage(1)
            setClansQuery(clansQueryInput.trim())
          }}
        />
        {(trackedClans?.rows.length ?? 0) === 0 ? (
          <EmptyState icon={Users} title="Aucun clan suivi ne correspond à ce filtre" />
        ) : (
          <>
            <div className="app-table-shell hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <SortableTh<ClanSortKey> column="name" sortKey={clansSortBy} sortDir={clansSortDir} onSort={handleClanSort} align="left">
                      Clan
                    </SortableTh>
                    <SortableTh<ClanSortKey>
                      column="members"
                      sortKey={clansSortBy}
                      sortDir={clansSortDir}
                      onSort={handleClanSort}
                      align="right"
                      title="Membres actifs enregistrés dans le clan"
                    >
                      Effectif
                    </SortableTh>
                    <SortableTh<ClanSortKey>
                      column="lastMatch"
                      sortKey={clansSortBy}
                      sortDir={clansSortDir}
                      onSort={handleClanSort}
                      align="left"
                      title="Partie la plus récente d’un membre du clan"
                    >
                      Dernier match
                    </SortableTh>
                    <SortableTh align="left" title="Joueurs portant le tag du clan croisés en match mais absents de l’effectif">
                      Manquants
                    </SortableTh>
                    <SortableTh align="left">Suivi</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {trackedClans?.rows.map((row) => (
                    <Fragment key={row.id}>
                      <tr className="app-table-row">
                        <td className="px-3 py-2">
                          <ClanNameButton
                            expanded={expandedClanId === row.id}
                            onToggle={() => toggleClanExpand(row.id)}
                            tag={row.tag}
                            name={row.name}
                          />
                        </td>
                        <td className="t-num px-[9px] py-2 text-right text-gray-900">{row.membersCount}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-700">{formatDateTime(row.lastMatchAt)}</td>
                        <td className="px-3 py-2">
                          {row.missingMembersCount > 0 ? <Tag tone="warn">{row.missingMembersCount}</Tag> : <span className="t-meta">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <TrackedClanActions row={row} onArchive={() => setArchiveTarget({ id: row.id, name: row.name, tag: row.tag })} />
                        </td>
                      </tr>
                      {expandedClanId === row.id ? (
                        <tr>
                          <td colSpan={5} className="border-t border-gray-200 px-3.5 py-3">
                            <ClanDetailPanel detail={clanDetails[row.id]} clanId={row.id} onTrack={handleTrackMember} trackPending={trackPending} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
              {trackedClans?.rows.map((row) => (
                <li key={row.id} className="app-panel-muted flex flex-col gap-2 px-3 py-2.5">
                  <ClanNameButton expanded={expandedClanId === row.id} onToggle={() => toggleClanExpand(row.id)} tag={row.tag} name={row.name} />
                  <span className="t-meta">
                    {row.membersCount} membre(s) · dernier match {formatDateTime(row.lastMatchAt)}
                    {row.missingMembersCount > 0 ? ` · ${row.missingMembersCount} manquant(s)` : ''}
                  </span>
                  <TrackedClanActions row={row} onArchive={() => setArchiveTarget({ id: row.id, name: row.name, tag: row.tag })} />
                  {expandedClanId === row.id ? (
                    <ClanDetailPanel detail={clanDetails[row.id]} clanId={row.id} onTrack={handleTrackMember} trackPending={trackPending} />
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
        <PaginationBar pagination={trackedClans?.pagination} onPageChange={setClansPage} label="Pages des clans suivis" />
      </SectionCard>

      <SectionCard
        id="opponent-clans-title"
        icon={Flame}
        title={`Clans adverses rencontrés (${opponentClans?.pagination?.total ?? 0})`}
        meta="Clans PUBG croisés par les membres suivis. Tri par les en-têtes du tableau ; une ligne ouverte montre ses joueurs."
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <SegmentedControl
            size="sm"
            value={opponentsFilter}
            onChange={(value) => {
              setOpponentsFilter(value as 'all' | 'favorites' | 'teammates')
              setOpponentsPage(1)
            }}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'favorites', label: 'Favoris' },
              { value: 'teammates', label: 'Avec coéquipiers' },
            ]}
          />
          <SearchField
            label="Rechercher un clan adverse"
            value={opponentsQueryInput}
            onChange={setOpponentsQueryInput}
            onCommit={() => {
              setOpponentsPage(1)
              setOpponentsQuery(opponentsQueryInput.trim())
            }}
          />
        </div>

        {(opponentClans?.rows.length ?? 0) === 0 ? (
          <EmptyState icon={Flame} title="Aucun clan adverse ne correspond aux filtres" />
        ) : (
          <>
            <div className="app-table-shell hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <SortableTh<OpponentSortKey>
                      column="favorite"
                      sortKey={opponentsSortBy}
                      sortDir={opponentsSortDir}
                      onSort={handleOpponentSort}
                      align="center"
                      title="Trier par favoris"
                    >
                      <Star className="h-3.5 w-3.5" aria-label="Favori" />
                    </SortableTh>
                    <SortableTh<OpponentSortKey> column="opponent" sortKey={opponentsSortBy} sortDir={opponentsSortDir} onSort={handleOpponentSort} align="left">
                      Clan adverse
                    </SortableTh>
                    <SortableTh<OpponentSortKey>
                      column="totalEncounters"
                      sortKey={opponentsSortBy}
                      sortDir={opponentsSortDir}
                      onSort={handleOpponentSort}
                      align="right"
                      title="Parties partagées avec ce clan, adversaires et coéquipiers confondus"
                    >
                      Rencontres
                    </SortableTh>
                    <SortableTh<OpponentSortKey>
                      column="asOpponent"
                      sortKey={opponentsSortBy}
                      sortDir={opponentsSortDir}
                      onSort={handleOpponentSort}
                      align="right"
                      title="Fois où ce clan était dans une escouade ennemie"
                    >
                      Adversaire
                    </SortableTh>
                    <SortableTh<OpponentSortKey>
                      column="asTeammate"
                      sortKey={opponentsSortBy}
                      sortDir={opponentsSortDir}
                      onSort={handleOpponentSort}
                      align="right"
                      title="Fois où ses joueurs étaient dans l’escouade d’un membre suivi (fill)"
                    >
                      Coéquipier
                    </SortableTh>
                    <SortableTh<OpponentSortKey>
                      column="lastSeen"
                      sortKey={opponentsSortBy}
                      sortDir={opponentsSortDir}
                      onSort={handleOpponentSort}
                      align="left"
                      title="Dernière partie partagée avec ce clan"
                    >
                      Dernière
                    </SortableTh>
                    <SortableTh<OpponentSortKey>
                      column="memberCount"
                      sortKey={opponentsSortBy}
                      sortDir={opponentsSortDir}
                      onSort={handleOpponentSort}
                      align="right"
                      title="Joueurs distincts recensés dans ce clan"
                    >
                      Joueurs
                    </SortableTh>
                    <SortableTh<OpponentSortKey>
                      column="trackedClansCount"
                      sortKey={opponentsSortBy}
                      sortDir={opponentsSortDir}
                      onSort={handleOpponentSort}
                      align="right"
                      title="Clans suivis qui ont rencontré ce clan"
                    >
                      Clans suivis
                    </SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {opponentClans?.rows.map((row) => (
                    <Fragment key={row.id}>
                      <tr className="app-table-row">
                        <td className="px-2 py-2 text-center">
                          <FavoriteButton active={row.isFavorite} pending={favoritePending.has(row.id)} onToggle={() => toggleFavorite(row)} />
                        </td>
                        <td className="px-3 py-2">
                          <ClanNameButton
                            expanded={expandedOpponentId === row.id}
                            onToggle={() => toggleOpponentExpand(row.id)}
                            tag={row.tag}
                            name={row.name ?? 'Clan inconnu'}
                          />
                        </td>
                        <td className="t-num px-[9px] py-2 text-right font-bold text-gray-900">{row.totalEncountersCount.toLocaleString('fr-FR')}</td>
                        <td className="t-num px-[9px] py-2 text-right text-gray-700">{row.asOpponentCount.toLocaleString('fr-FR')}</td>
                        <td className="t-num px-[9px] py-2 text-right text-gray-700">
                          <span className="inline-flex items-center gap-1">
                            {row.asTeammateCount.toLocaleString('fr-FR')}
                            {row.asTeammateCount > row.asOpponentCount * 2 && row.asTeammateCount > 2 ? (
                              <Info className="h-3.5 w-3.5" style={{ color: 'var(--game-sky)' }} aria-label="Surtout des coéquipiers de fill" />
                            ) : null}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-700">{formatDateTime(row.lastSeenAt)}</td>
                        <td className="t-num px-[9px] py-2 text-right text-gray-700">{row.memberCount.toLocaleString('fr-FR')}</td>
                        <td className="t-num px-[9px] py-2 text-right">
                          {row.trackedClansCount > 0 ? (
                            <span className="font-semibold text-[var(--theme-ui-accent-text)]">{row.trackedClansCount}</span>
                          ) : (
                            <span className="t-meta">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedOpponentId === row.id ? (
                        <tr>
                          <td colSpan={8} className="border-t border-gray-200 px-3.5 py-3">
                            <OpponentDetailPanel
                              detail={opponentDetails[row.id]}
                              opponentClanId={row.id}
                              onTrack={handleTrackMember}
                              trackPending={trackPending}
                              onToggleFavorite={handleFavoritePlayer}
                              onClanTracked={(message?: string) => {
                                addNotification(message ?? 'Clan suivi créé.', 'success')
                                setRefreshKey((k) => k + 1)
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
              {opponentClans?.rows.map((row) => (
                <li key={row.id} className="app-panel-muted flex flex-col gap-1.5 px-3 py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <ClanNameButton
                      expanded={expandedOpponentId === row.id}
                      onToggle={() => toggleOpponentExpand(row.id)}
                      tag={row.tag}
                      name={row.name ?? 'Clan inconnu'}
                    />
                    <FavoriteButton active={row.isFavorite} pending={favoritePending.has(row.id)} onToggle={() => toggleFavorite(row)} />
                  </span>
                  <span className="t-meta">
                    {row.totalEncountersCount.toLocaleString('fr-FR')} rencontre(s) · {row.asOpponentCount} en adversaire ·{' '}
                    {row.asTeammateCount} en coéquipier · dernière le {formatDateTime(row.lastSeenAt)}
                  </span>
                  {expandedOpponentId === row.id ? (
                    <OpponentDetailPanel
                      detail={opponentDetails[row.id]}
                      opponentClanId={row.id}
                      onTrack={handleTrackMember}
                      trackPending={trackPending}
                      onToggleFavorite={handleFavoritePlayer}
                      onClanTracked={(message?: string) => {
                        addNotification(message ?? 'Clan suivi créé.', 'success')
                        setRefreshKey((k) => k + 1)
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
        <PaginationBar pagination={opponentClans?.pagination} onPageChange={setOpponentsPage} label="Pages des clans adverses" />

        <div className="app-panel-muted flex flex-col gap-2 px-3.5 py-3">
          <p className="t-body m-0 flex items-center gap-2 font-semibold text-gray-900">
            <Info className="h-4 w-4 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
            Lire le tableau
          </p>
          <dl className="t-meta m-0 grid gap-x-4 gap-y-1.5 md:grid-cols-2">
            {LEGEND.map(([term, text]) => (
              <div key={term}>
                <dt className="inline font-semibold text-gray-900">{term} : </dt>
                <dd className="m-0 inline">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </SectionCard>

      {archiveTarget ? (
        <ClanArchiveDialog
          clan={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onArchived={(message) => {
            setArchiveTarget(null)
            addNotification(message, 'success')
            setExpandedClanId(null)
            setClanDetails({})
            setRefreshKey((k) => k + 1)
          }}
        />
      ) : null}

      {recalcConfirmOpen ? (
        <ConfirmDialog
          icon={RefreshCcw}
          title="Recalculer les statistiques ?"
          confirmLabel="Recalculer"
          tone="primary"
          busy={isRecalculating}
          onCancel={() => setRecalcConfirmOpen(false)}
          onConfirm={() => {
            setRecalcConfirmOpen(false)
            void handleRecalculateStats()
          }}
        >
          Les compteurs et classements de tous les clans adverses seront recalculés pour la période «{' '}
          {PERIOD_LABELS[period]} ».
        </ConfirmDialog>
      ) : null}

      {moveConfirm ? (
        <ConfirmDialog
          icon={UserPlus}
          title="Déplacer ce joueur ?"
          confirmLabel="Déplacer"
          tone="danger"
          busy={trackPending.has(moveConfirm.playerId)}
          onCancel={() => {
            setMoveConfirm(null)
            addNotification('Transfert annulé.', 'error')
          }}
          onConfirm={() => {
            const { playerId, targetClanId } = moveConfirm
            setMoveConfirm(null)
            void handleTrackMember(playerId, targetClanId, true)
          }}
        >
          {moveConfirm.message}
        </ConfirmDialog>
      ) : null}

      <ToastStack toasts={toasts} onDismiss={removeNotification} />
    </div>
  )
}

const PERIOD_LABELS: Record<Period, string> = { week: '7 jours', month: '30 jours', all: 'Tous les matchs' }

const LEGEND: Array<[string, string]> = [
  ['Rencontres', 'parties partagées avec des membres de ce clan, tous modes confondus'],
  ['Adversaire', 'fois où des joueurs de ce clan étaient dans une escouade ennemie face à un membre suivi'],
  ['Coéquipier', 'fois où ils étaient dans l’escouade d’un membre suivi, par le matchmaking aléatoire de PUBG'],
  ['Joueurs', 'joueurs distincts de ce clan croisés et recensés au fil du temps'],
  ['Clans suivis', 'clans suivis qui ont rencontré ce clan au moins une fois'],
  ['Favoris', 'clans rivaux ou partenaires épinglés pour les retrouver d’un clic'],
]

function SearchField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onCommit: () => void
}) {
  return (
    <label className="relative w-full sm:w-60">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit()
        }}
        onBlur={onCommit}
        placeholder={`${label}…`}
        className="app-input pl-9"
      />
    </label>
  )
}

function ClanNameButton({ expanded, onToggle, tag, name }: { expanded: boolean; onToggle: () => void; tag: string | null; name: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={expanded} className="inline-flex min-w-0 items-center gap-1.5 text-left hover:underline">
      <ChevronRight
        className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        aria-hidden="true"
      />
      <ClanLabel tag={tag} name={name} />
    </button>
  )
}

function TrackedClanActions({ row, onArchive }: { row: TrackedClanRow; onArchive: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link href={`/clans/${row.id}/stats/opponents`} className="app-link text-xs font-semibold" title="Adversaires rencontrés par ce clan">
        Adversaires
      </Link>
      {row.isSystem ? (
        <span className="t-meta" title="Clan technique du site : son suivi ne peut pas être arrêté.">
          Clan technique
        </span>
      ) : (
        <button
          type="button"
          onClick={onArchive}
          className="app-btn app-btn--xs app-btn--danger gap-1"
          title="Arrêter le suivi : synchronisation coupée, historique conservé"
        >
          <Archive className="h-3 w-3" aria-hidden="true" />
          Ne plus suivre
        </button>
      )}
    </span>
  )
}

function FavoriteButton({ active, pending, onToggle }: { active: boolean; pending: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={active}
      className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] hover:bg-gray-100 disabled:opacity-45"
      title={active ? 'Retirer des favoris' : 'Marquer comme favori'}
    >
      <Star
        className="h-4 w-4"
        style={{ color: active ? 'var(--game-gold)' : 'var(--theme-ui-text-muted)' }}
        fill={active ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
    </button>
  )
}

function ClanDetailPanel({
  detail,
  clanId,
  onTrack,
  trackPending,
}: {
  detail: DetailState<ClanDetail> | undefined
  clanId: number
  onTrack: TrackMember
  trackPending: Set<string>
}) {
  if (!detail || detail.status === 'loading') return <ListSkeleton rows={2} />
  if (detail.status === 'error') return <p className="t-body t-neg m-0">{detail.message}</p>
  const { members, missingCandidates } = detail.data
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="app-panel-muted flex flex-col gap-1.5 p-3">
        <span className="t-label">Membres enregistrés ({members.length})</span>
        <ul className="m-0 flex max-h-48 list-none flex-col gap-0.5 overflow-y-auto p-0">
          {members.map((m) => (
            <li key={m.id} className="t-body text-gray-900">
              {m.displayName}
            </li>
          ))}
        </ul>
      </div>
      <div className="app-panel-muted flex flex-col gap-1.5 p-3">
        <span className="t-label">Candidats détectés ({missingCandidates.length})</span>
        <ul className="m-0 flex max-h-48 list-none flex-col gap-1.5 overflow-y-auto p-0">
          {missingCandidates.length === 0 ? (
            <li className="t-meta">Aucun membre manquant détecté.</li>
          ) : (
            missingCandidates.map((c) => (
              <li key={c.playerId} className="flex items-center justify-between gap-2">
                <span className="t-body font-semibold text-gray-900">{c.pubgPlayerName}</span>
                {c.trackedElsewhere ? (
                  // Déjà rattaché ailleurs : on montre où, au lieu d'un bouton qui le déplacerait sans que le
                  // SuperUser voie le conflit.
                  <span title="Déjà membre actif d’un autre clan suivi : son clan PUBG sera réaligné au prochain passage de résolution.">
                    <Tag tone="warn">Membre de {c.trackedElsewhere.clanTag ? `[${c.trackedElsewhere.clanTag}]` : 'un autre clan'}</Tag>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onTrack(c.playerId, clanId)}
                    disabled={trackPending.has(c.playerId)}
                    className="app-btn app-btn--xs app-btn--secondary"
                  >
                    Ajouter à l’effectif
                  </button>
                )}
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
  onTrack,
  trackPending,
  onToggleFavorite,
  onClanTracked,
}: {
  detail: DetailState<OpponentClanDetail> | undefined
  opponentClanId: string
  onTrack: TrackMember
  trackPending: Set<string>
  onToggleFavorite: (playerId: string, current: boolean, opponentClanId: string) => void
  onClanTracked?: (message?: string) => void
}) {
  const [trackClanPending, setTrackClanPending] = useState(false)
  const [trackClanSuccess, setTrackClanSuccess] = useState(false)
  const [trackClanError, setTrackClanError] = useState('')
  // Clan archivé : l'API ne le remet pas en service d'elle-même (docs/TODO/clan-archive.md) — confirmation dans la page.
  const [archivedClan, setArchivedClan] = useState<{ id: number; message: string } | null>(null)

  if (!detail || detail.status === 'loading') return <ListSkeleton rows={2} />
  if (detail.status === 'error') return <p className="t-body t-neg m-0">{detail.message}</p>
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
      if (response.status === 409 && body?.code === 'clan_archived' && body?.clan?.id) {
        setArchivedClan({ id: body.clan.id, message: body.error })
        return
      }
      if (!response.ok) throw new Error(body?.error || 'Erreur lors de la création du clan')
      // Le clan existait déjà en attente de validation : rien n'est suivi tant qu'il n'est pas validé.
      if (body?.state === 'pending') {
        setTrackClanError('Ce clan attend déjà sa validation : validez-le depuis le cycle de vie des clans.')
        return
      }
      setTrackClanSuccess(true)
      if (onClanTracked) onClanTracked()
    } catch (err) {
      setTrackClanError(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setTrackClanPending(false)
    }
  }

  async function reactivateArchivedClan() {
    if (!archivedClan) return
    try {
      setTrackClanPending(true)
      setTrackClanError('')
      const reactivation = await fetch(`/api/settings/clans/${archivedClan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reactivate' }),
      })
      const reactivationBody = await reactivation.json().catch(() => null)
      if (!reactivation.ok) throw new Error(reactivationBody?.error || 'Réactivation impossible')
      setArchivedClan(null)
      setTrackClanSuccess(true)
      if (onClanTracked) onClanTracked(reactivationBody?.message)
    } catch (err) {
      setTrackClanError(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setTrackClanPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="t-label">
          Joueurs recensés ({players.length}
          {playersLimit && players.length >= playersLimit ? '+' : ''})
        </span>
        {trackClanSuccess ? (
          <Tag tone="pos">Clan suivi</Tag>
        ) : (
          <button
            type="button"
            onClick={handleTrackClan}
            disabled={trackClanPending}
            className="app-btn app-btn--xs app-btn--secondary gap-1"
            title="Faire de ce clan adverse un clan suivi"
          >
            <UserPlus className="h-3 w-3" aria-hidden="true" />
            {trackClanPending ? 'Création…' : 'Suivre ce clan'}
          </button>
        )}
      </div>
      {trackClanError ? <p className="t-body t-neg m-0">{trackClanError}</p> : null}
      {archivedClan ? (
        <Callout tone="warn" icon={AlertTriangle} title="Clan archivé">
          {archivedClan.message}{' '}
          <span className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void reactivateArchivedClan()} disabled={trackClanPending} className="app-btn app-btn--xs app-btn--primary">
              Réactiver le suivi
            </button>
            <button type="button" onClick={() => setArchivedClan(null)} disabled={trackClanPending} className="app-btn app-btn--xs app-btn--secondary">
              Annuler
            </button>
          </span>
        </Callout>
      ) : null}
      <ul className="m-0 grid max-h-56 list-none grid-cols-1 gap-2 overflow-y-auto p-0 sm:grid-cols-2 lg:grid-cols-3">
        {players.map((p) => (
          <li key={p.playerId} className="app-panel-muted flex items-center justify-between gap-2 px-2.5 py-1.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <FavoriteButton active={p.isFavorite} pending={false} onToggle={() => onToggleFavorite(p.playerId, p.isFavorite, opponentClanId)} />
              <span className="t-body truncate font-semibold text-gray-900">{p.pubgPlayerName}</span>
            </span>
            {p.trackedMember ? (
              <Tag tone="pos">{p.trackedMember.clanTag}</Tag>
            ) : (
              <button
                type="button"
                onClick={() => onTrack(p.playerId)}
                disabled={trackPending.has(p.playerId)}
                className="app-btn app-btn--xs app-btn--secondary gap-1"
                title="Suivre ce joueur"
              >
                <UserPlus className="h-3 w-3" aria-hidden="true" />
                Suivre
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Pagination numérotée de la charte, d'après la pagination renvoyée par l'API (10 lignes par page). */
function PaginationBar({ pagination, onPageChange, label }: { pagination?: PageInfo; onPageChange: (page: number) => void; label: string }) {
  if (!pagination || pagination.total === 0) return null
  return (
    <Pagination
      page={pagination.page ?? 1}
      pageCount={pagination.totalPages ?? 1}
      total={pagination.total}
      pageSize={pagination.pageSize ?? 10}
      onPageChange={onPageChange}
      ariaLabel={label}
      itemLabel="Clans"
    />
  )
}
