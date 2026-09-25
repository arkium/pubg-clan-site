'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  History,
  Info,
  RefreshCcw,
  Search,
  SquareParking,
  Star,
} from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import AppSelectField from '@/components/ui/AppSelectField'
import PlayerNameBadge from '@/components/ui/PlayerNameBadge'
import SegmentedControl from '@/components/ui/SegmentedControl'
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
 * Annuaire transverse des joueurs — onglet « Joueurs » de l'Observatoire.
 *
 * Spécification : docs/TODO/players.md. Une ligne par joueur PUBG connu, avec son statut
 * de suivi ; l'action « Suivre » passe par `POST /api/settings/opponents/track`, qui garde
 * seul la logique de rattachement.
 */

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const STATUS_OPTIONS: Array<{ value: PlayerDirectoryStatusFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'tracked', label: 'Suivis' },
  { value: 'untracked', label: 'Non suivis' },
  { value: 'noclan', label: 'Sans clan PUBG' },
  { value: 'favorites', label: 'Favoris ⭐' },
]

const TRACKING_BADGES: Record<TrackingStatus, { label: string; className: string; description: string }> = {
  tracked: {
    label: 'Membre suivi',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    description: 'Joueur actif d’un clan suivi par le site.',
  },
  parking: {
    label: 'Parking',
    className: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    description: 'Joueur suivi sans clan officiel, rattaché au clan technique Ungrouped.',
  },
  pending: {
    label: 'Adhésion en attente',
    className:
      'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
    description: 'Demande /join pas encore validée.',
  },
  archived: {
    label: 'Archivé (inactivité)',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    description: 'Désactivé après une longue inactivité au parking.',
  },
  stopped: {
    label: 'Suivi arrêté',
    className: 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    description: 'Fiche membre désactivée pour une autre raison (départ, refus, arrêt manuel).',
  },
  untracked: {
    label: 'Non suivi',
    className: 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
    description: 'Croisé en match, sans fiche membre.',
  },
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

function formatRelativeTime(value: string) {
  const diffMin = Math.floor((Date.now() - new Date(value).getTime()) / 60000)
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

type Toast = { id: number; message: string; type: 'success' | 'error' }

/** Notifications flottantes : la plus ancienne disparaît 5 s après le dernier changement. */
function useNotifications() {
  const [notifications, setNotifications] = useState<Toast[]>([])

  useEffect(() => {
    if (notifications.length === 0) return
    const timer = window.setTimeout(() => setNotifications((current) => current.slice(1)), 5000)
    return () => window.clearTimeout(timer)
  }, [notifications])

  function notify(message: string, type: Toast['type'] = 'success') {
    setNotifications((current) => [...current, { id: (current[current.length - 1]?.id ?? 0) + 1, message, type }])
  }

  function dismiss(id: number) {
    setNotifications((current) => current.filter((notification) => notification.id !== id))
  }

  return { notifications, notify, dismiss }
}

export default function PlayersDirectoryPage() {
  // useSearchParams impose une frontière Suspense (Next.js 16) — voir CLAUDE.md, piège n° 5.
  return (
    <Suspense fallback={<p className="p-4 text-sm text-slate-600">Chargement...</p>}>
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

  const [payload, setPayload] = useState<PlayersDirectoryResult | null>(null)
  const [counters, setCounters] = useState<PlayersDirectoryCounters | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')
  // Les compteurs coûtent plus d'une seconde en production : demandés au premier chargement
  // et après une action qui les modifie, pas à chaque page ou tri.
  const needCountersRef = useRef(true)

  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
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

  async function trackPlayer(row: PlayersDirectoryRow, target: TrackableClan) {
    const trackingStatus = row.tracking.status
    // La route réactive sans confirmation un membre archivé, parti ou en attente : seul un
    // membre ACTIF d'un autre clan déclenche son 409. La confirmation est donc demandée ici.
    if (
      (trackingStatus === 'archived' || trackingStatus === 'stopped' || trackingStatus === 'pending') &&
      !window.confirm(
        `${row.pubgPlayerName} est actuellement « ${TRACKING_BADGES[trackingStatus].label} ».\n\n` +
          `Le réactiver dans ${clanLabel(target)} ?`
      )
    ) {
      return
    }

    setRowPending(row.playerId, true)
    try {
      const requestBody = { playerId: row.playerId, targetClanId: target.id }
      const post = (body: object) =>
        fetch('/api/settings/opponents/track', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })

      let response = await post(requestBody)
      let body = await response.json().catch(() => null)

      // 409 = déjà membre actif d'un autre clan suivi : le SuperUser tranche explicitement.
      if (response.status === 409 && body?.error === 'member_tracked_elsewhere') {
        if (!window.confirm(`${body.message}\n\nDéplacer ce joueur vers ${clanLabel(target)} ?`)) {
          notify('Transfert annulé.', 'error')
          return
        }
        response = await post({ ...requestBody, confirmMove: true })
        body = await response.json().catch(() => null)
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
  if (!payload && !error) return <p className="p-4 text-sm text-slate-600">Chargement...</p>

  const rows = payload?.rows ?? []
  const trackableClans = payload?.trackableClans ?? []
  const unlinkedMembers = payload?.unlinkedMembers ?? []
  const fallback = payload?.sort.fallback ?? null

  return (
    <div className="space-y-4">
      <section className="app-panel space-y-6 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Annuaire des joueurs
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Tous les joueurs PUBG croisés en match ou suivis : statut de suivi, clan PUBG et rencontres.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loadingData}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            title="Recharger la liste et les compteurs"
          >
            <RefreshCcw className={cx('h-3.5 w-3.5', loadingData && 'animate-spin text-indigo-500')} aria-hidden />
            Rafraîchir
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            label="Joueurs répertoriés"
            value={counters?.totalPlayers}
            tooltip="Comptes PUBG connus en base (table Player), tous shards."
          />
          <MetricCard
            label="Membres suivis"
            value={counters?.trackedPlayers}
            tooltip="Joueurs actifs d’un clan suivi ou du parking Ungrouped."
          />
          <MetricCard
            label="Joueurs non suivis"
            value={counters?.untrackedPlayers}
            tooltip="Joueurs croisés en match sans aucune fiche membre."
          />
          <MetricCard
            label="Joueurs solo"
            value={counters?.soloPlayers}
            tooltip="Joueurs dont le clan PUBG a été résolu : aucun. Un joueur jamais résolu n’est pas compté."
          />
        </div>

        {unlinkedMembers.length > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              <strong>{unlinkedMembers.length} membre(s) suivi(s) absent(s) de l’annuaire</strong>, faute d’identité
              PUBG enregistrée :{' '}
              {unlinkedMembers.map((member, index) => (
                <span key={member.id}>
                  {index > 0 ? ', ' : ''}
                  <Link href={`/members/${member.id}/dashboard`} className="font-semibold underline">
                    {member.displayName}
                  </Link>
                  {member.clanTag ? ` [${member.clanTag}]` : ''}
                </span>
              ))}
              . Ils apparaîtront dès qu’un match les croise ou que leur fiche est resynchronisée.
            </p>
          </div>
        ) : null}

        <div className="app-panel-muted space-y-4 rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
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

            <label className="relative block w-full min-w-0 sm:w-64" htmlFor="players-directory-search">
              <span className="sr-only">Rechercher un pseudo</span>
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                id="players-directory-search"
                type="search"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Pseudo PUBG… (* pour chercher partout)"
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <AppSelectField
              id="players-directory-seen-by"
              label="Croisés par"
              value={seenByClanId}
              onChange={(value) => {
                setSeenByClanId(value)
                setPage(1)
              }}
              options={[
                { value: '', label: 'Tous les clans suivis' },
                ...trackableClans.map((clan) => ({ value: String(clan.id), label: clanLabel(clan) })),
              ]}
              className="w-full text-xs sm:w-56"
              selectClassName="py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Recherche par début de pseudo ; commencez par <code>*</code> pour chercher n’importe où dans le pseudo.
            La casse et les accents sont ignorés.
          </p>

          {fallback ? (
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                Le tri par rencontres n’est proposé que jusqu’à {fallback.maxCandidates.toLocaleString('fr-FR')}{' '}
                résultats : au-delà, il parcourrait toutes les rencontres de la base. Affinez avec un filtre ou une
                recherche. Tri appliqué : dernière vue.
              </p>
            </div>
          ) : null}

          {error ? <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p> : null}

          <div
            className={cx(
              'app-table-shell overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800',
              loadingData && 'opacity-70 transition-opacity duration-200'
            )}
          >
            <table className="min-w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead>
                <tr className="app-table-head border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                  <SortHeader label="Joueur" sortKey="pubgPlayerName" activeKey={sortBy} direction={sortOrder} onSort={handleSort} />
                  <th className="px-2.5 py-2.5 font-semibold">Statut de suivi</th>
                  <th className="px-2.5 py-2.5 font-semibold">Clan PUBG</th>
                  <SortHeader
                    label="Rencontres"
                    sortKey="totalEncounters"
                    activeKey={sortBy}
                    direction={sortOrder}
                    onSort={handleSort}
                    tooltip="Total de toutes les rencontres avec nos clans suivis : ennemi + coéquipier (fill)."
                  />
                  <SortHeader label="Dernière vue" sortKey="lastSeenAt" activeKey={sortBy} direction={sortOrder} onSort={handleSort} />
                  <th className="px-2.5 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                      Aucun joueur ne correspond à ces critères.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <PlayerRow
                      key={row.playerId}
                      row={row}
                      trackableClans={trackableClans}
                      pending={pendingIds.has(row.playerId)}
                      onToggleFavorite={() => void toggleFavorite(row)}
                      onTrack={(target) => void trackPlayer(row, target)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationBar pagination={payload?.pagination} onPageChange={setPage} />
        </div>

        <Legend />
      </section>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            role="status"
            className={cx(
              'flex min-w-[280px] items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs font-semibold text-white shadow-xl',
              notification.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
            )}
          >
            <span>{notification.message}</span>
            <button
              type="button"
              onClick={() => dismiss(notification.id)}
              className="ml-2 rounded-full p-1 opacity-70 hover:bg-white/20"
              aria-label="Fermer la notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlayerRow({
  row,
  trackableClans,
  pending,
  onToggleFavorite,
  onTrack,
}: {
  row: PlayersDirectoryRow
  trackableClans: TrackableClan[]
  pending: boolean
  onToggleFavorite: () => void
  onTrack: (target: TrackableClan) => void
}) {
  const { tracking, encounters, pubgClan } = row
  const encountersTooltip =
    encounters.byClan.length > 0
      ? `Croisé par ${encounters.byClan.map((clan) => `[${clan.tag ?? '?'}] ${clan.total}`).join(' · ')}`
      : 'Aucune rencontre enregistrée'

  return (
    <tr className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleFavorite}
            disabled={pending}
            className="text-amber-500 transition-transform hover:text-amber-600 active:scale-95 disabled:opacity-50"
            title={row.isFavorite ? 'Retirer des favoris' : 'Marquer comme favori'}
            aria-label={row.isFavorite ? `Retirer ${row.pubgPlayerName} des favoris` : `Ajouter ${row.pubgPlayerName} aux favoris`}
            aria-pressed={row.isFavorite}
          >
            <Star className="h-4 w-4" fill={row.isFavorite ? 'currentColor' : 'none'} aria-hidden />
          </button>
          <PlayerNameBadge
            name={row.pubgPlayerName}
            memberId={tracking.member?.id}
            title={tracking.member ? `Profil interne de ${tracking.member.displayName}` : row.pubgPlayerName}
          />
        </div>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <TrackingBadge row={row} />
          {tracking.status === 'parking' ? (
            <Link
              href="/settings/clan-lifecycle?tab=ungrouped"
              className="text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-200"
              title="Voir le parking Ungrouped dans le cycle de vie des clans"
            >
              <SquareParking className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Parking Ungrouped</span>
            </Link>
          ) : null}
          {row.recentChange ? (
            <Link
              href="/settings/clan-lifecycle?tab=mutations"
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
              title={`${CHANGE_STATUS_LABELS[row.recentChange.status] ?? row.recentChange.status} le ${formatDateTime(
                row.recentChange.detectedAt
              )} — voir le journal des mutations`}
            >
              <History className="h-3 w-3" aria-hidden />
              {new Date(row.recentChange.detectedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
            </Link>
          ) : null}
        </div>
      </td>

      <td className="whitespace-nowrap px-3 py-2.5">
        {pubgClan.state === 'clan' ? (
          <span className="text-slate-800 dark:text-slate-200">
            {pubgClan.tag ? <span className="font-semibold text-indigo-600 dark:text-indigo-400">[{pubgClan.tag}]</span> : null}{' '}
            {pubgClan.name ?? 'Clan sans nom'}
          </span>
        ) : pubgClan.state === 'solo' ? (
          <span className="italic text-slate-500 dark:text-slate-400" title="Clan PUBG résolu : aucun clan">
            Solo
          </span>
        ) : (
          <span
            className="italic text-slate-400 dark:text-slate-500"
            title="Clan PUBG pas encore résolu — voir l’onglet Triage API"
          >
            Inconnu
          </span>
        )}
      </td>

      <td className="px-3 py-2.5" title={encountersTooltip}>
        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
          {encounters.total.toLocaleString('fr-FR')}
        </span>
        <span className="block text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          {encounters.asOpponent} ennemi · {encounters.asTeammate} fill
        </span>
      </td>

      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400" title={formatDateTime(row.lastSeenAt)}>
        {formatRelativeTime(row.lastSeenAt)}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <TrackSelect row={row} trackableClans={trackableClans} disabled={pending} onPick={onTrack} />
          <a
            href={row.lookupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
            title="Voir sur PUBG Lookup"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">PUBG Lookup de {row.pubgPlayerName}</span>
          </a>
        </div>
      </td>
    </tr>
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
    <span
      className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', badge.className)}
      title={details}
    >
      {label}
    </span>
  )
}

function TrackSelect({
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
  const trackedClans = options.filter((clan) => !clan.isSystem)
  const systemClans = options.filter((clan) => clan.isSystem)

  const placeholder =
    status === 'untracked'
      ? '+ Suivre dans…'
      : isActiveMember
        ? 'Déplacer vers…'
        : status === 'pending'
          ? 'Activer dans…'
          : 'Réactiver dans…'

  return (
    <select
      value=""
      disabled={disabled || options.length === 0}
      onChange={(event) => {
        const target = options.find((clan) => String(clan.id) === event.target.value)
        if (target) onPick(target)
      }}
      aria-label={`${placeholder.replace('+ ', '')} ${row.pubgPlayerName}`}
      className={cx(
        'max-w-[11rem] rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-50',
        status === 'untracked'
          ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
          : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
      )}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {trackedClans.length > 0 ? (
        <optgroup label="Clans suivis">
          {trackedClans.map((clan) => (
            <option key={clan.id} value={clan.id}>
              {clanLabel(clan)}
            </option>
          ))}
        </optgroup>
      ) : null}
      {systemClans.length > 0 ? (
        <optgroup label="Parking">
          {systemClans.map((clan) => (
            <option key={clan.id} value={clan.id}>
              {clanLabel(clan)}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  )
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  tooltip,
}: {
  label: string
  sortKey: PlayerDirectorySortKey
  activeKey: PlayerDirectorySortKey
  direction: PlayerDirectorySortOrder
  onSort: (key: PlayerDirectorySortKey) => void
  tooltip?: string
}) {
  const isActive = sortKey === activeKey
  return (
    <th className="px-2.5 py-2.5" aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1.5 text-left font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        title={tooltip ? `${label} : ${tooltip}` : `Trier par ${label.toLowerCase()}`}
      >
        <span>{label}</span>
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  )
}

function PaginationBar({
  pagination,
  onPageChange,
}: {
  pagination: PlayersDirectoryResult['pagination'] | undefined
  onPageChange: (page: number) => void
}) {
  if (!pagination || pagination.total === 0) return null

  const { page, pageSize, total, totalPages } = pagination
  const start = Math.min((page - 1) * pageSize + 1, total)
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Joueurs{' '}
        <strong className="text-slate-800 dark:text-slate-200">
          {start.toLocaleString('fr-FR')}–{end.toLocaleString('fr-FR')}
        </strong>{' '}
        sur <strong className="text-slate-800 dark:text-slate-200">{total.toLocaleString('fr-FR')}</strong>
      </span>
      <div className="app-pagination flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="app-pagination-button rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <span className="app-pagination-label px-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="app-pagination-button rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

function MetricCard({ label, value, tooltip }: { label: string; value: number | undefined; tooltip: string }) {
  return (
    <article className="app-panel-muted relative rounded-xl border border-slate-200/80 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <span title={tooltip} className="cursor-help">
          <Info className="h-3.5 w-3.5 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200" />
        </span>
      </div>
      <p className="mt-1.5 text-xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
        {value === undefined ? '—' : value.toLocaleString('fr-FR')}
      </p>
    </article>
  )
}

function Legend() {
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
      <h2 className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
        <Info className="h-4 w-4 text-indigo-500" aria-hidden />
        Statuts de suivi
      </h2>
      <ul className="grid grid-cols-1 gap-2 text-[11px] leading-relaxed md:grid-cols-2">
        {(Object.keys(TRACKING_BADGES) as TrackingStatus[]).map((status) => (
          <li key={status} className="flex items-start gap-2">
            <span
              className={cx(
                'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                TRACKING_BADGES[status].className
              )}
            >
              {TRACKING_BADGES[status].label}
            </span>
            <span>{TRACKING_BADGES[status].description}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px]">
        Les mouvements entre clans suivis, le parking et l’archivage sont gérés par le{' '}
        <Link href="/settings/clan-lifecycle" className="font-semibold text-indigo-600 underline dark:text-indigo-400">
          cycle de vie des clans
        </Link>
        .
      </p>
    </div>
  )
}
