'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Loader2, RotateCcw, RotateCw, Search, Shield, Sparkles, X } from 'lucide-react'

import { FormFeedback } from '@/components/settings/AdminPageStates'
import { Callout, EmptyState, ListSkeleton, Tag, type Tone } from '@/components/ui/CharteKit'
import Pagination from '@/components/ui/Pagination'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SortableTh from '@/components/ui/SortableTh'
import { useAuthSession } from '@/hooks/useAuthSession'

/**
 * Triage des joueurs croisés dont le clan PUBG reste à découvrir — onglet « Triage API » de Plateforme › Joueurs.
 * Selon la charte UI (docs/ui/index.html) : statuts en puces à l'accent (choix multiple), tableau trié par ses en-têtes
 * côté serveur (cartes sous `md`), résolution unitaire et pagination numérotée.
 */

type TriageStatus = 'never_attempted' | 'retry_pending' | 'failed' | 'below_threshold' | 'resolved_with_clan' | 'resolved_without_clan'

type SortColumn = 'pubgPlayerName' | 'status' | 'distinctClanCount' | 'totalEncounterCount' | 'resolveAttempts' | 'lastSeenAt'

type TriageClan = { clanTag?: string | null; clanName?: string | null; encounterCount?: number }

type TriageRow = {
  id: string
  pubgPlayerName: string
  status?: TriageStatus
  pubgClanTag?: string | null
  pubgClanName?: string | null
  clanResolvedAt?: string | null
  clans?: TriageClan[]
  clanTag?: string | null
  clanName?: string | null
  clan?: { tag?: string | null; name?: string | null } | null
  encounterCount?: number
  totalEncounterCount?: number
  distinctClanCount?: number
  resolveAttempts?: number
  lastSeenAt?: string | null
}

const PAGE_SIZE = 20
const QUEUE_STATUSES: TriageStatus[] = ['never_attempted', 'retry_pending', 'failed']
const ALL_STATUSES: TriageStatus[] = ['never_attempted', 'retry_pending', 'failed', 'below_threshold', 'resolved_with_clan', 'resolved_without_clan']

const STATUS_CONFIG: Record<TriageStatus, { label: string; tooltip: string; tone: Tone }> = {
  never_attempted: {
    label: 'Jamais tenté',
    tooltip: 'Pseudo déjà connu dès le match. Clan PUBG pas encore demandé à l’API.',
    tone: 'sky',
  },
  retry_pending: {
    label: 'À relancer',
    tooltip: 'Tentative précédente échouée (limite de débit, délai dépassé). Retentée automatiquement par le cron.',
    tone: 'warn',
  },
  failed: {
    label: 'Sans réponse (5 essais)',
    tooltip: 'Nombre maximal de tentatives (5) dépassé. Compte souvent inexistant, supprimé ou robot.',
    tone: 'neg',
  },
  below_threshold: {
    label: 'Sous le seuil (1 rencontre)',
    tooltip: 'Croisé une seule fois. Il faut deux rencontres pour entrer dans le traitement automatique.',
    tone: 'neutral',
  },
  resolved_with_clan: { label: 'Avec clan', tooltip: 'Clan PUBG identifié auprès de l’API.', tone: 'pos' },
  resolved_without_clan: { label: 'Sans clan (solo)', tooltip: 'Joueur vérifié, sans clan PUBG.', tone: 'pos' },
}

function sameSet(selected: Set<TriageStatus>, list: TriageStatus[]) {
  return selected.size === list.length && list.every((status) => selected.has(status))
}

function rowClans(row: TriageRow): TriageClan[] {
  if (row.clans && row.clans.length > 0) return row.clans
  return [{ clanTag: row.clanTag || row.clan?.tag, encounterCount: row.encounterCount, clanName: row.clanName || row.clan?.name }]
}

export default function OpponentsTriagePage() {
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [triageRows, setTriageRows] = useState<TriageRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loadingData, setLoadingData] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [selectedStatuses, setSelectedStatuses] = useState<Set<TriageStatus>>(new Set(QUEUE_STATUSES))
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)

  // Tri côté serveur ; `default` = ordre de la file proposé par la route.
  const [sortBy, setSortBy] = useState<SortColumn | 'default'>('default')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set())
  const [resolutionFeedback, setResolutionFeedback] = useState<Record<string, { success: boolean; message: string }>>({})

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) return

    let cancelled = false
    async function loadTriage() {
      try {
        setLoadingData(true)
        setError('')

        const params = new URLSearchParams()
        params.set('page', String(page))
        if (searchQuery) params.set('q', searchQuery)
        if (sortBy !== 'default') {
          params.set('sortBy', sortBy)
          params.set('sortOrder', sortOrder)
        }
        for (const status of selectedStatuses) {
          params.append('status', status)
        }

        const res = await fetch(`/api/settings/encountered-players?${params.toString()}`, { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Chargement du triage impossible')

        if (!cancelled) {
          const players = (data?.rows ?? data?.players ?? data?.data?.players ?? data?.data?.rows ?? []) as TriageRow[]
          const total = Number(data?.total ?? data?.data?.total ?? 0)
          setTriageRows(players)
          setTotalCount(total)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement du triage impossible')
      } finally {
        if (!cancelled) {
          setLoadingData(false)
          setLoaded(true)
        }
      }
    }

    void loadTriage()
    return () => {
      cancelled = true
    }
  }, [authenticated, isSuperUser, loading, page, selectedStatuses, searchQuery, refreshKey, sortBy, sortOrder])

  function handleSort(column: SortColumn) {
    setPage(1)
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortOrder(column === 'pubgPlayerName' ? 'asc' : 'desc')
    }
  }

  function toggleStatus(status: TriageStatus) {
    setPage(1)
    setSelectedStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(status)) {
        if (next.size > 1) next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

  function applyPreset(list: TriageStatus[]) {
    setSelectedStatuses(new Set(list))
    setPage(1)
  }

  function clearSearch() {
    setSearchInput('')
    setSearchQuery('')
    setPage(1)
  }

  async function handleResolveOne(player: TriageRow, forceRetry = false) {
    try {
      setResolvingIds((prev) => new Set(prev).add(player.id))
      setResolutionFeedback((prev) => ({ ...prev, [player.id]: { success: false, message: 'Résolution en cours…' } }))

      const url = `/api/settings/encountered-players/${player.id}/resolve${forceRetry ? '?force=retry' : ''}`
      const res = await fetch(url, { method: 'POST' })
      const data = await res.json().catch(() => null)

      if (!res.ok) throw new Error(data?.error || 'Échec de la résolution')

      const outcome = data.result?.outcome
      let message = 'Résolu.'
      if (outcome === 'resolved_with_clan') {
        message = `Clan trouvé : [${data.result.pubgClanTag || 'TAG'}] ${data.result.pubgClanName || ''}`
      } else if (outcome === 'resolved_without_clan') {
        message = 'Joueur sans clan confirmé'
      } else if (outcome === 'cache_hit') {
        message = 'Résolu depuis le cache'
      }

      setResolutionFeedback((prev) => ({ ...prev, [player.id]: { success: true, message } }))

      // Mise à jour optimiste de la ligne
      setTriageRows((prev) =>
        prev.map((row) =>
          row.id === player.id
            ? {
                ...row,
                pubgClanTag: data.result?.pubgClanTag ?? row.pubgClanTag,
                pubgClanName: data.result?.pubgClanName ?? row.pubgClanName,
                clanResolvedAt: new Date().toISOString(),
                status: outcome === 'resolved_with_clan' ? 'resolved_with_clan' : 'resolved_without_clan',
              }
            : row
        )
      )
    } catch (err) {
      setResolutionFeedback((prev) => ({
        ...prev,
        [player.id]: { success: false, message: err instanceof Error ? err.message : 'Échec de la résolution' },
      }))
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev)
        next.delete(player.id)
        return next
      })
    }
  }

  if (loading || !authenticated || !isSuperUser) return null

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const preset = sameSet(selectedStatuses, QUEUE_STATUSES) ? 'queue' : sameSet(selectedStatuses, ALL_STATUSES) ? 'all' : 'custom'
  const activeSort = sortBy === 'default' ? undefined : sortBy

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5" aria-labelledby="triage-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="triage-title" className="t-section-title m-0 flex items-center gap-2">
            <Shield className="h-5 w-5 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
            Triage des joueurs rencontrés
          </h2>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loadingData}
            className="app-btn app-btn--sm app-btn--secondary gap-1.5"
            title="Recharger la liste"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualiser
          </button>
        </div>
        <p className="t-meta m-0">Joueurs croisés en match dont le clan PUBG reste à identifier.</p>
      </section>

      <Callout tone="sky" icon={Info} title="Seul le clan reste à découvrir">
        Pseudo et identifiant sont connus dès la fin de chaque partie ; les données de match n’indiquent pas le clan. Le cron et
        cet écran le demandent à l’API PUBG, joueur par joueur. Un joueur n’entre dans le traitement automatique qu’après deux
        rencontres, pour ménager les quotas.
      </Callout>

      <section className="app-panel flex flex-col gap-4 p-4 sm:p-5" aria-label="Joueurs à trier">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<'queue' | 'all' | 'custom'>
              size="sm"
              value={preset}
              onChange={(value) => {
                if (value === 'queue') applyPreset(QUEUE_STATUSES)
                if (value === 'all') applyPreset(ALL_STATUSES)
              }}
              options={[
                { value: 'queue', label: 'File à traiter' },
                { value: 'all', label: 'Tous les statuts' },
                ...(preset === 'custom' ? [{ value: 'custom' as const, label: 'Sélection' }] : []),
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Statuts affichés">
            {ALL_STATUSES.map((status) => {
              const config = STATUS_CONFIG[status]
              const selected = selectedStatuses.has(status)
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleStatus(status)}
                  title={config.tooltip}
                  className="inline-flex items-center rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  style={
                    selected
                      ? {
                          borderColor: 'var(--theme-ui-accent-ring)',
                          backgroundColor: 'var(--theme-ui-accent-soft)',
                          color: 'var(--theme-ui-accent-text)',
                        }
                      : undefined
                  }
                >
                  {config.label}
                </button>
              )
            })}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setPage(1)
              setSearchQuery(searchInput.trim())
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Rechercher un pseudo</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Pseudo PUBG…"
                className="app-input pl-9 pr-9"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </label>
            <button type="submit" className="app-btn app-btn--md app-btn--secondary">
              Rechercher
            </button>
          </form>
        </div>

        {searchQuery ? (
          <Callout tone="sky" icon={Search} title={`Recherche « ${searchQuery} » : ${totalCount.toLocaleString('fr-FR')} résultat(s)`}>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {!sameSet(selectedStatuses, ALL_STATUSES) ? (
                <button type="button" onClick={() => applyPreset(ALL_STATUSES)} className="app-link text-xs font-semibold">
                  Élargir à tous les statuts, résolus compris
                </button>
              ) : null}
              <button type="button" onClick={clearSearch} className="app-link text-xs font-semibold">
                Effacer la recherche
              </button>
            </span>
          </Callout>
        ) : null}

        <FormFeedback error={error} />

        {!loaded ? (
          <ListSkeleton rows={4} />
        ) : triageRows.length === 0 ? (
          <EmptyState icon={Shield} title="Aucun joueur pour ces statuts" />
        ) : (
          <div className={`flex flex-col gap-2 ${loadingData ? 'opacity-60 transition-opacity duration-200' : ''}`} aria-busy={loadingData}>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
              {triageRows.map((row) => (
                <li key={row.id} className="app-panel-muted flex flex-col gap-2 px-3 py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <PlayerName row={row} />
                    <StatusTag row={row} />
                  </span>
                  <ClansCell row={row} />
                  <span className="t-meta t-num">
                    {row.totalEncounterCount ?? row.encounterCount ?? 1} rencontre(s) · {row.resolveAttempts ?? 0} / 5 essais · vu le{' '}
                    {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleDateString('fr-FR') : '—'}
                  </span>
                  <ResolveAction
                    row={row}
                    resolving={resolvingIds.has(row.id)}
                    feedback={resolutionFeedback[row.id]}
                    onResolve={() => void handleResolveOne(row, row.status === 'failed')}
                  />
                </li>
              ))}
            </ul>
            <div className="app-table-shell hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <SortableTh<SortColumn> column="pubgPlayerName" sortKey={activeSort} sortDir={sortOrder} onSort={handleSort} align="left">
                      Joueur
                    </SortableTh>
                    <SortableTh<SortColumn> column="status" sortKey={activeSort} sortDir={sortOrder} onSort={handleSort} align="left">
                      Statut
                    </SortableTh>
                    <SortableTh<SortColumn> column="distinctClanCount" sortKey={activeSort} sortDir={sortOrder} onSort={handleSort} align="left">
                      Clans suivis croisés
                    </SortableTh>
                    <SortableTh<SortColumn> column="totalEncounterCount" sortKey={activeSort} sortDir={sortOrder} onSort={handleSort}>
                      Rencontres
                    </SortableTh>
                    <SortableTh<SortColumn> column="resolveAttempts" sortKey={activeSort} sortDir={sortOrder} onSort={handleSort}>
                      Essais
                    </SortableTh>
                    <SortableTh<SortColumn> column="lastSeenAt" sortKey={activeSort} sortDir={sortOrder} onSort={handleSort} align="left">
                      Dernière vue
                    </SortableTh>
                    <SortableTh>Action</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {triageRows.map((row) => (
                    <tr key={row.id} className="app-table-row align-top">
                      <td className="px-[9px] py-2">
                        <PlayerName row={row} />
                      </td>
                      <td className="px-[9px] py-2">
                        <StatusTag row={row} />
                      </td>
                      <td className="px-[9px] py-2">
                        <ClansCell row={row} />
                      </td>
                      <td className="t-num px-[9px] py-2 text-right font-bold text-gray-900">{row.totalEncounterCount ?? row.encounterCount ?? 1}</td>
                      <td className="t-num px-[9px] py-2 text-right text-gray-700">{row.resolveAttempts ?? 0} / 5</td>
                      <td className="whitespace-nowrap px-[9px] py-2 text-gray-700">
                        {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="px-[9px] py-2">
                        <span className="flex justify-end">
                          <ResolveAction
                            row={row}
                            resolving={resolvingIds.has(row.id)}
                            feedback={resolutionFeedback[row.id]}
                            onResolve={() => void handleResolveOne(row, row.status === 'failed')}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {totalCount > 0 ? (
          <Pagination
            page={page}
            pageCount={totalPages}
            total={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            ariaLabel="Pages du triage"
            itemLabel="Joueurs"
          />
        ) : null}
      </section>
    </div>
  )
}

function PlayerName({ row }: { row: TriageRow }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate font-semibold text-gray-900">{row.pubgPlayerName}</span>
      <a
        href={`https://pubglookup.com/players/steam/${encodeURIComponent(row.pubgPlayerName)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        title="Voir sur PUBG Lookup"
      >
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">PUBG Lookup de {row.pubgPlayerName}</span>
      </a>
    </span>
  )
}

function StatusTag({ row }: { row: TriageRow }) {
  const config = STATUS_CONFIG[row.status ?? 'never_attempted'] ?? STATUS_CONFIG.never_attempted
  return (
    <span title={config.tooltip} className="shrink-0">
      <Tag tone={config.tone}>
        {row.pubgClanTag ? `[${row.pubgClanTag}] ` : ''}
        {config.label}
      </Tag>
    </span>
  )
}

function ClansCell({ row }: { row: TriageRow }) {
  const clans = rowClans(row)
  const distinct = row.distinctClanCount ?? clans.length
  return (
    <span className="flex flex-col gap-1">
      <span className="t-meta font-semibold text-gray-700">
        {distinct} {distinct > 1 ? 'clans suivis' : 'clan suivi'}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {clans.map((clan, index) => (
          <span
            key={index}
            title={`${clan.clanName || clan.clanTag || 'Clan'} : ${clan.encounterCount ?? 0} rencontre(s)`}
            className="app-panel-muted inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px]"
          >
            <span className="font-mono font-bold text-gray-900">{clan.clanTag ? `[${clan.clanTag}]` : clan.clanName || 'Clan'}</span>
            <span className="t-num text-gray-500">{clan.encounterCount ?? 0}</span>
          </span>
        ))}
      </span>
    </span>
  )
}

function ResolveAction({
  row,
  resolving,
  feedback,
  onResolve,
}: {
  row: TriageRow
  resolving: boolean
  feedback: { success: boolean; message: string } | undefined
  onResolve: () => void
}) {
  const failed = row.status === 'failed'
  return (
    <span className="flex flex-wrap items-center gap-2">
      {feedback && !resolving ? (
        <span className={`flex items-center gap-1 text-xs font-semibold ${feedback.success ? 't-pos' : 't-neg'}`}>
          {feedback.success ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
          {feedback.message}
        </span>
      ) : null}
      <button
        type="button"
        disabled={resolving}
        onClick={onResolve}
        className="app-btn app-btn--xs app-btn--secondary gap-1"
        title="Demander tout de suite le clan de ce joueur à l’API PUBG"
      >
        {resolving ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : failed ? (
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Sparkles className="h-3 w-3" aria-hidden="true" />
        )}
        {resolving ? 'Appel PUBG…' : failed ? 'Forcer un essai' : 'Résoudre'}
      </button>
    </span>
  )
}
