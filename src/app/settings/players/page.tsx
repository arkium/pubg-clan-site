'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ExternalLink,
  History,
  Info,
  RotateCw,
  Search,
  SquareParking,
  Star,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react'

import { KpiGrid, type Kpi } from '@/components/matches/MatchesUi'
import { FormFeedback } from '@/components/settings/AdminPageStates'
import { Callout, ChoiceMenu, ConfirmDialog, EmptyState, ListSkeleton, Tag, ToastStack, type Toast, type Tone } from '@/components/ui/CharteKit'
import Pagination from '@/components/ui/Pagination'
import PlayerNameBadge from '@/components/ui/PlayerNameBadge'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SortableTh from '@/components/ui/SortableTh'
import { useAuthSession } from '@/hooks/useAuthSession'
import type {
  PlayerDirectorySortKey,
  PlayerDirectorySortOrder,
  PlayerDirectoryStatusFilter,
  PlayersDirectoryCounters,
  PlayersDirectoryResult,
  PlayersDirectoryRow,
  TrackableClan,
  TrackingStatus,
} from '@/lib/players-directory'

/**
 * Annuaire transverse des joueurs — onglet « Joueurs » de Plateforme › Joueurs.
 *
 * Spécification : docs/TODO/players.md. Une ligne par joueur PUBG connu, avec son statut
 * de suivi ; l'action « Suivre » passe par `POST /api/settings/opponents/track`, qui garde
 * seul la logique de rattachement. Selon la charte UI (docs/ui/index.html) : indicateurs, tableau trié par ses
 * en-têtes (cartes sous `md`), statut en pastille, menus de la charte, confirmations dans la page.
 */

const STATUS_OPTIONS: Array<{ value: PlayerDirectoryStatusFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'tracked', label: 'Suivis' },
  { value: 'untracked', label: 'Non suivis' },
  { value: 'noclan', label: 'Sans clan PUBG' },
  { value: 'favorites', label: 'Favoris' },
]

const TRACKING_BADGES: Record<TrackingStatus, { label: string; tone: Tone; description: string }> = {
  tracked: { label: 'Membre suivi', tone: 'pos', description: 'Joueur actif d’un clan suivi par le site.' },
  parking: { label: 'Parking', tone: 'sky', description: 'Joueur suivi sans clan officiel, rattaché au clan technique Ungrouped.' },
  pending: { label: 'Adhésion en attente', tone: 'warn', description: 'Demande /join pas encore validée.' },
  archived: { label: 'Archivé (inactivité)', tone: 'neutral', description: 'Désactivé après une longue inactivité au parking.' },
  stopped: {
    label: 'Suivi arrêté',
    tone: 'neutral',
    description: 'Fiche membre désactivée pour une autre raison (départ, refus, arrêt manuel).',
  },
  untracked: { label: 'Non suivi', tone: 'neutral', description: 'Croisé en match, sans fiche membre.' },
}

const STOP_REASONS: Record<string, string> = {
  left: 'a quitté son clan',
  rejected: 'demande refusée',
  deactivated: 'désactivé manuellement',
  clan_inactive: 'son clan n’est plus actif',
  no_clan: 'aucun clan rattaché',
  tracked: 'ancienne fiche « watchlist », hors statistiques et synchronisations',
  clan_unfollowed: 'son clan n’est plus suivi (fiche désactivée à l’archivage du clan)',
}

const CHANGE_STATUS_LABELS: Record<string, string> = {
  applied: 'Mutation appliquée',
  observed: 'Écart observé',
  pending: 'Mutation en attente',
  reverted: 'Mutation annulée',
  ignored: 'Mutation écartée',
}

function formatRelativeTime(value: string, now: number) {
  const diffMin = Math.floor((now - new Date(value).getTime()) / 60000)
  if (diffMin < 1) return 'à l’instant'
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `il y a ${diffHours} h`
  return `il y a ${Math.floor(diffHours / 24)} j`
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function clanLabel(clan: { tag: string; name: string }) {
  return `[${clan.tag}] ${clan.name}`
}

function parseStatus(value: string | null): PlayerDirectoryStatusFilter {
  return STATUS_OPTIONS.find((option) => option.value === value)?.value ?? 'all'
}

/** Notifications flottantes : la plus ancienne disparaît 5 s après le dernier changement. */
function useNotifications() {
  const [notifications, setNotifications] = useState<Toast[]>([])

  useEffect(() => {
    if (notifications.length === 0) return
    const timer = window.setTimeout(() => setNotifications((current) => current.slice(1)), 5000)
    return () => window.clearTimeout(timer)
  }, [notifications])

  function notify(text: string, tone: Toast['tone'] = 'success') {
    setNotifications((current) => [...current, { id: (current[current.length - 1]?.id ?? 0) + 1, text, tone }])
  }

  function dismiss(id: number) {
    setNotifications((current) => current.filter((notification) => notification.id !== id))
  }

  return { notifications, notify, dismiss }
}

/** Confirmation en attente : réactiver un membre archivé, parti ou en attente, ou déplacer un membre actif ailleurs. */
type PendingConfirm =
  | { kind: 'reactivate'; row: PlayersDirectoryRow; target: TrackableClan }
  | { kind: 'move'; row: PlayersDirectoryRow; target: TrackableClan; message: string }

export default function PlayersDirectoryPage() {
  // useSearchParams impose une frontière Suspense (Next.js 16) — voir CLAUDE.md, piège n° 5.
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <PlayersDirectory />
    </Suspense>
  )
}

function PlayersDirectory() {
  const { loading, authenticated, isSuperUser } = useAuthSession()
  const searchParams = useSearchParams()

  // Lien profond ou marque-page : `?q=`, `?status=`, `?seenByClanId=`.
  const [status, setStatus] = useState<PlayerDirectoryStatusFilter>(() => parseStatus(searchParams.get('status')))
  const [queryInput, setQueryInput] = useState(() => searchParams.get('q') ?? '')
  const [query, setQuery] = useState(() => (searchParams.get('q') ?? '').trim())
  const [seenByClanId, setSeenByClanId] = useState(() => searchParams.get('seenByClanId') ?? '')
  const [sortBy, setSortBy] = useState<PlayerDirectorySortKey>('lastSeenAt')
  const [sortOrder, setSortOrder] = useState<PlayerDirectorySortOrder>('desc')
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [now] = useState(() => Date.now())

  const [payload, setPayload] = useState<PlayersDirectoryResult | null>(null)
  const [counters, setCounters] = useState<PlayersDirectoryCounters | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')
  // Les compteurs coûtent plus d'une seconde en production : demandés au premier chargement
  // et après une action qui les modifie, pas à chaque page ou tri.
  const needCountersRef = useRef(true)

  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null)
  const { notifications, notify, dismiss } = useNotifications()

  // Recherche réactive : la saisie part 300 ms après la dernière frappe.
  useEffect(() => {
    const next = queryInput.trim()
    if (next === query) return
    const timer = window.setTimeout(() => {
      setQuery(next)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [queryInput, query])

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) return

    const controller = new AbortController()
    const withCounters = needCountersRef.current

    async function load() {
      try {
        setLoadingData(true)
        setError('')

        const params = new URLSearchParams({ status, page: String(page), sortBy, sortOrder })
        if (query) params.set('q', query)
        if (seenByClanId) params.set('seenByClanId', seenByClanId)
        if (withCounters) params.set('counters', '1')

        const response = await fetch(`/api/settings/players?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error ?? 'Chargement impossible')

        const result = body as PlayersDirectoryResult
        setPayload(result)
        if (withCounters && result.counters) {
          setCounters(result.counters)
          needCountersRef.current = false
        }
      } catch (loadError) {
        if ((loadError as Error).name === 'AbortError') return
        setError(loadError instanceof Error ? loadError.message : 'Chargement impossible')
      } finally {
        if (!controller.signal.aborted) setLoadingData(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [authenticated, isSuperUser, loading, status, query, seenByClanId, sortBy, sortOrder, page, refreshKey])

  /** Recharge la liste ET les compteurs : après une action, ou sur demande. */
  function refresh() {
    needCountersRef.current = true
    setRefreshKey((key) => key + 1)
  }

  function handleSort(key: PlayerDirectorySortKey) {
    setPage(1)
    if (key === sortBy) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortOrder(key === 'pubgPlayerName' ? 'asc' : 'desc')
    }
  }

  function setRowPending(playerId: string, pending: boolean) {
    setPendingIds((current) => {
      const next = new Set(current)
      if (pending) next.add(playerId)
      else next.delete(playerId)
      return next
    })
  }

  async function toggleFavorite(row: PlayersDirectoryRow) {
    if (pendingIds.has(row.playerId)) return
    const nextValue = !row.isFavorite
    const patchRow = (value: boolean) =>
      setPayload((current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((item) => (item.playerId === row.playerId ? { ...item, isFavorite: value } : item)),
            }
          : current
      )

    setRowPending(row.playerId, true)
    patchRow(nextValue)
    try {
      const response = await fetch(`/api/settings/players/${row.playerId}/favorite`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isFavorite: nextValue }),
      })
      if (!response.ok) throw new Error('Mise à jour du favori impossible')
    } catch (favoriteError) {
      patchRow(row.isFavorite)
      notify(favoriteError instanceof Error ? favoriteError.message : 'Erreur inconnue', 'error')
    } finally {
      setRowPending(row.playerId, false)
    }
  }

  /**
   * La route réactive sans confirmation un membre archivé, parti ou en attente : seul un membre ACTIF d'un autre clan
   * déclenche son 409. La confirmation de réactivation est donc demandée ici, avant l'appel.
   */
  function requestTrack(row: PlayersDirectoryRow, target: TrackableClan) {
    const trackingStatus = row.tracking.status
    if (trackingStatus === 'archived' || trackingStatus === 'stopped' || trackingStatus === 'pending') {
      setConfirm({ kind: 'reactivate', row, target })
      return
    }
    void trackPlayer(row, target, false)
  }

  async function trackPlayer(row: PlayersDirectoryRow, target: TrackableClan, confirmMove: boolean) {
    setRowPending(row.playerId, true)
    try {
      const response = await fetch('/api/settings/opponents/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: row.playerId, targetClanId: target.id, ...(confirmMove ? { confirmMove: true } : {}) }),
      })
      const body = await response.json().catch(() => null)

      // 409 = déjà membre actif d'un autre clan suivi : le SuperUser tranche explicitement.
      if (response.status === 409 && body?.error === 'member_tracked_elsewhere' && !confirmMove) {
        setConfirm({ kind: 'move', row, target, message: body.message ?? 'Ce joueur est déjà membre actif d’un autre clan suivi.' })
        return
      }

      if (!response.ok) throw new Error(body?.message ?? body?.error ?? 'Erreur lors du suivi')
      notify(`${row.pubgPlayerName} est désormais suivi dans ${clanLabel(target)}.`)
      refresh()
    } catch (trackError) {
      notify(trackError instanceof Error ? trackError.message : 'Erreur inconnue', 'error')
    } finally {
      setRowPending(row.playerId, false)
    }
  }

  if (loading || !authenticated || !isSuperUser) return null
  if (!payload && !error) return <ListSkeleton rows={5} />

  const rows = payload?.rows ?? []
  const trackableClans = payload?.trackableClans ?? []
  const unlinkedMembers = payload?.unlinkedMembers ?? []
  const fallback = payload?.sort.fallback ?? null
  const pagination = payload?.pagination

  const kpis: Kpi[] = [
    {
      label: 'Joueurs répertoriés',
      value: counters ? counters.totalPlayers.toLocaleString('fr-FR') : '—',
      detail: 'comptes PUBG connus, toutes plateformes',
      icon: Users,
      color: 'var(--game-sky)',
    },
    {
      label: 'Membres suivis',
      value: counters ? counters.trackedPlayers.toLocaleString('fr-FR') : '—',
      detail: 'clans suivis et parking',
      icon: UserCheck,
      color: 'var(--game-pos)',
    },
    {
      label: 'Non suivis',
      value: counters ? counters.untrackedPlayers.toLocaleString('fr-FR') : '—',
      detail: 'croisés en match, sans fiche membre',
      icon: UserPlus,
      color: 'var(--game-warn)',
    },
    {
      label: 'Joueurs solo',
      value: counters ? counters.soloPlayers.toLocaleString('fr-FR') : '—',
      detail: 'clan PUBG résolu : aucun',
      icon: UserX,
      color: 'var(--theme-ui-text-muted)',
    },
  ]
  const sortDir = sortOrder === 'asc' ? 'asc' : 'desc'

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5" aria-labelledby="players-directory-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="players-directory-title" className="t-section-title m-0">
            Annuaire des joueurs
          </h2>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loadingData}
            className="app-btn app-btn--sm app-btn--secondary gap-1.5"
            title="Recharger la liste et les compteurs"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualiser
          </button>
        </div>
        <p className="t-meta m-0">Tous les joueurs PUBG croisés en match ou suivis : statut de suivi, clan PUBG et rencontres.</p>
        <KpiGrid items={kpis} className="grid-cols-2 lg:grid-cols-4" />
      </section>

      {unlinkedMembers.length > 0 ? (
        <Callout tone="warn" icon={AlertTriangle} title={`${unlinkedMembers.length} membre(s) suivi(s) absent(s) de l’annuaire`}>
          Faute d’identité PUBG enregistrée :{' '}
          {unlinkedMembers.map((member, index) => (
            <span key={member.id}>
              {index > 0 ? ', ' : ''}
              <Link href={`/members/${member.id}/dashboard`} className="app-link font-semibold">
                {member.displayName}
              </Link>
              {member.clanTag ? ` [${member.clanTag}]` : ''}
            </span>
          ))}
          . Ils apparaîtront dès qu’un match les croise ou que leur fiche est resynchronisée.
        </Callout>
      ) : null}

      <section className="app-panel flex flex-col gap-4 p-4 sm:p-5" aria-label="Liste des joueurs">
        <div className="flex flex-col gap-3">
          <SegmentedControl
            options={STATUS_OPTIONS}
            value={status}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
            size="sm"
            wrap
            fullWidthOnMobile
          />
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <label className="relative block" htmlFor="players-directory-search">
              <span className="sr-only">Rechercher un pseudo</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <input
                id="players-directory-search"
                type="search"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Pseudo PUBG… (* pour chercher partout)"
                className="app-input pl-9"
              />
            </label>
            <ChoiceMenu<string>
              label="Croisés par"
              value={seenByClanId}
              onChange={(value) => {
                setSeenByClanId(value)
                setPage(1)
              }}
              options={[
                { value: '', label: 'Croisés par tous les clans suivis' },
                ...trackableClans.map((clan) => ({ value: String(clan.id), label: `Croisés par ${clanLabel(clan)}` })),
              ]}
            />
          </div>
          <p className="t-meta m-0">
            Recherche par début de pseudo ; commencer par <code className="font-mono">*</code> pour chercher n’importe où dans le
            pseudo. La casse et les accents sont ignorés.
          </p>
        </div>

        {fallback ? (
          <Callout tone="sky" icon={Info} title="Tri par rencontres indisponible">
            Il n’est proposé que jusqu’à {fallback.maxCandidates.toLocaleString('fr-FR')} résultats : au-delà, il parcourrait toutes
            les rencontres de la base. Affiner avec un filtre ou une recherche. Tri appliqué : dernière vue.
          </Callout>
        ) : null}

        <FormFeedback error={error} />

        {rows.length === 0 ? (
          <EmptyState icon={Users} title="Aucun joueur ne correspond à ces critères" />
        ) : (
          <div className={`flex flex-col gap-2 ${loadingData ? 'opacity-60 transition-opacity duration-200' : ''}`} aria-busy={loadingData}>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
              {rows.map((row) => (
                <li key={row.playerId} className="app-panel-muted flex flex-col gap-2 px-3 py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <PlayerIdentity row={row} pending={pendingIds.has(row.playerId)} onToggleFavorite={() => void toggleFavorite(row)} />
                    <LookupLink row={row} />
                  </span>
                  <TrackingCell row={row} />
                  <span className="t-meta">
                    <PubgClanText row={row} /> · {row.encounters.total.toLocaleString('fr-FR')} rencontre(s) · vu{' '}
                    {formatRelativeTime(row.lastSeenAt, now)}
                  </span>
                  <TrackMenu row={row} trackableClans={trackableClans} disabled={pendingIds.has(row.playerId)} onPick={(target) => requestTrack(row, target)} />
                </li>
              ))}
            </ul>
            <div className="app-table-shell hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <SortableTh<PlayerDirectorySortKey> column="pubgPlayerName" sortKey={sortBy} sortDir={sortDir} onSort={handleSort} align="left">
                      Joueur
                    </SortableTh>
                    <SortableTh align="left">Statut de suivi</SortableTh>
                    <SortableTh align="left">Clan PUBG</SortableTh>
                    <SortableTh<PlayerDirectorySortKey>
                      column="totalEncounters"
                      sortKey={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      title="Toutes les rencontres avec les clans suivis : ennemi et coéquipier (fill)"
                    >
                      Rencontres
                    </SortableTh>
                    <SortableTh<PlayerDirectorySortKey> column="lastSeenAt" sortKey={sortBy} sortDir={sortDir} onSort={handleSort} align="left">
                      Dernière vue
                    </SortableTh>
                    <SortableTh align="left">Actions</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.playerId} className="app-table-row align-top">
                      <td className="px-[9px] py-2">
                        <PlayerIdentity row={row} pending={pendingIds.has(row.playerId)} onToggleFavorite={() => void toggleFavorite(row)} />
                      </td>
                      <td className="px-[9px] py-2">
                        <TrackingCell row={row} />
                      </td>
                      <td className="whitespace-nowrap px-[9px] py-2 text-gray-700">
                        <PubgClanText row={row} />
                      </td>
                      <td
                        className="t-num px-[9px] py-2 text-right"
                        title={
                          row.encounters.byClan.length > 0
                            ? `Croisé par ${row.encounters.byClan.map((clan) => `[${clan.tag ?? '?'}] ${clan.total}`).join(' · ')}`
                            : 'Aucune rencontre enregistrée'
                        }
                      >
                        <span className="font-bold text-gray-900">{row.encounters.total.toLocaleString('fr-FR')}</span>
                        <span className="t-meta block">
                          {row.encounters.asOpponent} ennemi · {row.encounters.asTeammate} fill
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-[9px] py-2 text-gray-700" title={formatDateTime(row.lastSeenAt)}>
                        {formatRelativeTime(row.lastSeenAt, now)}
                      </td>
                      <td className="px-[9px] py-2">
                        <span className="flex items-center gap-2">
                          <TrackMenu
                            row={row}
                            trackableClans={trackableClans}
                            disabled={pendingIds.has(row.playerId)}
                            onPick={(target) => requestTrack(row, target)}
                          />
                          <LookupLink row={row} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pagination && pagination.total > 0 ? (
          <Pagination
            page={pagination.page}
            pageCount={pagination.totalPages}
            total={pagination.total}
            pageSize={pagination.pageSize}
            onPageChange={setPage}
            ariaLabel="Pages de l’annuaire des joueurs"
            itemLabel="Joueurs"
          />
        ) : null}
      </section>

      <Legend />

      {confirm ? (
        <ConfirmDialog
          icon={confirm.kind === 'move' ? UserPlus : History}
          title={confirm.kind === 'move' ? 'Déplacer ce joueur ?' : 'Réactiver ce joueur ?'}
          confirmLabel={confirm.kind === 'move' ? 'Déplacer' : 'Réactiver'}
          tone={confirm.kind === 'move' ? 'danger' : 'primary'}
          busy={pendingIds.has(confirm.row.playerId)}
          onCancel={() => {
            if (confirm.kind === 'move') notify('Transfert annulé.', 'error')
            setConfirm(null)
          }}
          onConfirm={() => {
            const { row, target, kind } = confirm
            setConfirm(null)
            void trackPlayer(row, target, kind === 'move')
          }}
        >
          {confirm.kind === 'move' ? (
            <>
              {confirm.message} Le déplacer vers {clanLabel(confirm.target)} ?
            </>
          ) : (
            <>
              {confirm.row.pubgPlayerName} est actuellement « {TRACKING_BADGES[confirm.row.tracking.status].label} ». Le réactiver dans{' '}
              {clanLabel(confirm.target)} ?
            </>
          )}
        </ConfirmDialog>
      ) : null}

      <ToastStack toasts={notifications} onDismiss={dismiss} />
    </div>
  )
}

function PlayerIdentity({ row, pending, onToggleFavorite }: { row: PlayersDirectoryRow; pending: boolean; onToggleFavorite: () => void }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={onToggleFavorite}
        disabled={pending}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] hover:bg-gray-100 disabled:opacity-45"
        title={row.isFavorite ? 'Retirer des favoris' : 'Marquer comme favori'}
        aria-label={row.isFavorite ? `Retirer ${row.pubgPlayerName} des favoris` : `Ajouter ${row.pubgPlayerName} aux favoris`}
        aria-pressed={row.isFavorite}
      >
        <Star
          className="h-4 w-4"
          style={{ color: row.isFavorite ? 'var(--game-gold)' : 'var(--theme-ui-text-muted)' }}
          fill={row.isFavorite ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      </button>
      <PlayerNameBadge
        name={row.pubgPlayerName}
        memberId={row.tracking.member?.id}
        title={row.tracking.member ? `Profil interne de ${row.tracking.member.displayName}` : row.pubgPlayerName}
      />
    </span>
  )
}

function LookupLink({ row }: { row: PlayersDirectoryRow }) {
  return (
    <a
      href={row.lookupUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-gray-500 hover:bg-gray-100 hover:text-gray-900"
      title="Voir sur PUBG Lookup"
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">PUBG Lookup de {row.pubgPlayerName}</span>
    </a>
  )
}

function PubgClanText({ row }: { row: PlayersDirectoryRow }) {
  const { pubgClan } = row
  if (pubgClan.state === 'clan') {
    return (
      <span>
        {pubgClan.tag ? <span className="font-mono font-bold text-gray-900">[{pubgClan.tag}]</span> : null} {pubgClan.name ?? 'Clan sans nom'}
      </span>
    )
  }
  if (pubgClan.state === 'solo') {
    return (
      <span className="italic text-gray-500" title="Clan PUBG résolu : aucun clan">
        Solo
      </span>
    )
  }
  return (
    <span className="italic text-gray-500" title="Clan PUBG pas encore résolu — voir l’onglet Triage API">
      Inconnu
    </span>
  )
}

function TrackingCell({ row }: { row: PlayersDirectoryRow }) {
  const { tracking } = row
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <TrackingBadge row={row} />
      {tracking.status === 'parking' ? (
        <Link
          href="/settings/clans/lifecycle?tab=ungrouped"
          className="grid h-6 w-6 place-items-center rounded-md hover:bg-gray-100"
          style={{ color: 'var(--game-sky)' }}
          title="Voir le parking Ungrouped dans le cycle de vie des clans"
        >
          <SquareParking className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Parking Ungrouped</span>
        </Link>
      ) : null}
      {row.recentChange ? (
        <Link
          href="/settings/clans/lifecycle?tab=mutations"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold"
          style={{ backgroundColor: 'var(--game-sky-soft)', color: 'var(--game-sky)' }}
          title={`${CHANGE_STATUS_LABELS[row.recentChange.status] ?? row.recentChange.status} le ${formatDateTime(
            row.recentChange.detectedAt
          )} — voir le journal des mutations`}
        >
          <History className="h-3 w-3" aria-hidden="true" />
          {new Date(row.recentChange.detectedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
        </Link>
      ) : null}
    </span>
  )
}

function TrackingBadge({ row }: { row: PlayersDirectoryRow }) {
  const { status, reason, member } = row.tracking
  const badge = TRACKING_BADGES[status]
  const clan = member?.clan

  const label =
    status === 'tracked' && clan ? clanLabel(clan) : status === 'parking' && clan ? `[${clan.tag}] Parking` : badge.label
  const details = [
    badge.description,
    status === 'stopped' && reason ? `Motif : ${STOP_REASONS[reason] ?? reason}.` : null,
    status !== 'tracked' && status !== 'parking' && clan ? `Dernier clan : ${clanLabel(clan)}.` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span title={details}>
      <Tag tone={badge.tone}>{label}</Tag>
    </span>
  )
}

/** « Suivre dans… », « Déplacer vers… » : menu de la charte, les clans du même shard que le compte. */
function TrackMenu({
  row,
  trackableClans,
  disabled,
  onPick,
}: {
  row: PlayersDirectoryRow
  trackableClans: TrackableClan[]
  disabled: boolean
  onPick: (target: TrackableClan) => void
}) {
  const { status, member } = row.tracking
  const isActiveMember = status === 'tracked' || status === 'parking'
  // Un clan d'un autre shard ne peut pas accueillir ce compte ; son clan actuel non plus.
  const options = trackableClans.filter(
    (clan) => clan.platformShard === row.platformShard && !(isActiveMember && clan.id === member?.clan?.id)
  )
  const placeholder =
    status === 'untracked' ? 'Suivre dans…' : isActiveMember ? 'Déplacer vers…' : status === 'pending' ? 'Activer dans…' : 'Réactiver dans…'

  if (options.length === 0) return <span className="t-meta">Aucun clan disponible</span>

  return (
    <div className={`w-full md:w-44 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <ChoiceMenu<string>
        label={`${placeholder.replace('…', '')} ${row.pubgPlayerName}`}
        value=""
        onChange={(value) => {
          const target = options.find((clan) => String(clan.id) === value)
          if (target) onPick(target)
        }}
        options={[
          { value: '', label: placeholder },
          ...options.map((clan) => ({ value: String(clan.id), label: clan.isSystem ? `Parking · ${clanLabel(clan)}` : clanLabel(clan) })),
        ]}
      />
    </div>
  )
}

function Legend() {
  return (
    <div className="app-panel-muted flex flex-col gap-2 px-3.5 py-3">
      <p className="t-body m-0 flex items-center gap-2 font-semibold text-gray-900">
        <Info className="h-4 w-4 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
        Statuts de suivi
      </p>
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
        {(Object.keys(TRACKING_BADGES) as TrackingStatus[]).map((status) => (
          <li key={status} className="t-meta flex items-start gap-2">
            <span className="shrink-0">
              <Tag tone={TRACKING_BADGES[status].tone}>{TRACKING_BADGES[status].label}</Tag>
            </span>
            <span>{TRACKING_BADGES[status].description}</span>
          </li>
        ))}
      </ul>
      <p className="t-meta m-0">
        Les mouvements entre clans suivis, le parking et l’archivage sont gérés par le{' '}
        <Link href="/settings/clans/lifecycle" className="app-link font-semibold">
          cycle de vie des clans
        </Link>
        .
      </p>
    </div>
  )
}
