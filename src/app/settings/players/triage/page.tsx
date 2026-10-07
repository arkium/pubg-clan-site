'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Info,
  RefreshCcw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Shield,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  X,
} from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type TriageStatus =
  | 'never_attempted'
  | 'retry_pending'
  | 'failed'
  | 'below_threshold'
  | 'resolved_with_clan'
  | 'resolved_without_clan'

const STATUS_CONFIG: Record<
  TriageStatus,
  { label: string; tooltip: string; badgeClass: string }
> = {
  never_attempted: {
    label: 'Jamais tenté (clan inconnu)',
    tooltip: 'Pseudo déjà connu dès le match. Clan PUBG non encore interrogé auprès de l’API.',
    badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
  },
  retry_pending: {
    label: 'Nouvel essai (relance)',
    tooltip: 'Tentative précédente échouée (ex: rate limit ou timeout). Sera retenté automatiquement par le cron.',
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  },
  failed: {
    label: 'Échec définitif (sans réponse 5x)',
    tooltip: 'Nombre maximal de tentatives (5) dépassé. Compte souvent inexistant, supprimé ou bot.',
    badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-800',
  },
  below_threshold: {
    label: 'Sous le seuil (<2 matchs)',
    tooltip: 'Croisé 1 seule fois. Nécessite 2 rencontres pour être qualifié au traitement automatique par cron.',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
  resolved_with_clan: {
    label: 'Avec clan (identifié)',
    tooltip: 'Clan PUBG identifié avec succès auprès de l’API.',
    badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  },
  resolved_without_clan: {
    label: 'Sans clan (confirmé solo)',
    tooltip: 'Joueur solo vérifié sans aucun clan PUBG affilié.',
    badgeClass: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
  },
}

export default function OpponentsTriagePage() {
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [triageRows, setTriageRows] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Filters
  const [selectedStatuses, setSelectedStatuses] = useState<Set<TriageStatus>>(
    new Set(['never_attempted', 'retry_pending', 'failed'])
  )
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)

  // Server-side sorting
  type SortColumn = 'pubgPlayerName' | 'status' | 'distinctClanCount' | 'totalEncounterCount' | 'resolveAttempts' | 'lastSeenAt'
  const [sortBy, setSortBy] = useState<SortColumn | 'default'>('default')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Individual resolution state
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
        for (const s of selectedStatuses) {
          params.append('status', s)
        }

        const res = await fetch(`/api/settings/encountered-players?${params.toString()}`, {
          cache: 'no-store',
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Chargement du triage impossible')

        if (!cancelled) {
          const players = data?.rows ?? data?.players ?? data?.data?.players ?? data?.data?.rows ?? []
          const total = data?.total ?? data?.data?.total ?? 0
          setTriageRows(players)
          setTotalCount(total)
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoadingData(false)
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

  function renderSortIcon(column: SortColumn) {
    if (sortBy !== column) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity" />
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
    )
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

  async function handleResolveOne(player: any, forceRetry = false) {
    try {
      setResolvingIds((prev) => new Set(prev).add(player.id))
      setResolutionFeedback((prev) => ({
        ...prev,
        [player.id]: { success: false, message: 'Résolution en cours...' },
      }))

      const url = `/api/settings/encountered-players/${player.id}/resolve${forceRetry ? '?force=retry' : ''}`
      const res = await fetch(url, { method: 'POST' })
      const data = await res.json().catch(() => null)

      if (!res.ok) throw new Error(data?.error || 'Échec de la résolution')

      const outcome = data.result?.outcome
      let message = 'Résolu avec succès !'
      if (outcome === 'resolved_with_clan') {
        message = `Clan trouvé : [${data.result.pubgClanTag || 'TAG'}] ${data.result.pubgClanName || ''}`
      } else if (outcome === 'resolved_without_clan') {
        message = 'Joueur sans clan confirmé'
      } else if (outcome === 'cache_hit') {
        message = 'Résolu depuis le cache'
      }

      setResolutionFeedback((prev) => ({
        ...prev,
        [player.id]: { success: true, message },
      }))

      // Optimistically update player row
      setTriageRows((prev) =>
        prev.map((r) =>
          r.id === player.id
            ? {
                ...r,
                pubgClanTag: data.result?.pubgClanTag ?? r.pubgClanTag,
                pubgClanName: data.result?.pubgClanName ?? r.pubgClanName,
                clanResolvedAt: new Date().toISOString(),
                status: outcome === 'resolved_with_clan' ? 'resolved_with_clan' : 'resolved_without_clan',
              }
            : r
        )
      )
    } catch (err: any) {
      setResolutionFeedback((prev) => ({
        ...prev,
        [player.id]: { success: false, message: err.message },
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

  const totalPages = Math.max(1, Math.ceil(totalCount / 20))

  return (
    <div className="space-y-6">
      {error ? <p className="p-4 text-sm text-rose-700 dark:text-rose-400">{error}</p> : null}

      <section className="app-panel p-5 sm:p-7 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-500" />
              Triage des joueurs rencontrés
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              File d’attente des joueurs croisés en match nécessitant une identification de clan PUBG.
              <span
                title="Règle d’éligibilité : le joueur doit avoir été croisé au moins 2 fois pour être éligible au cron automatique afin d'économiser les quotas PUBG."
                className="cursor-help inline-flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <Info className="h-3.5 w-3.5" />
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loadingData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-xs"
            title="Rafraîchir les joueurs de triage"
          >
            <RefreshCcw className={cx('h-3.5 w-3.5', loadingData && 'animate-spin text-indigo-500')} />
            Rafraîchir
          </button>
        </div>

        {/* Educational Callout Banner */}
        <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/60 p-3.5 sm:p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20 text-xs text-indigo-950 dark:text-indigo-200 flex items-start gap-3">
          <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1 leading-relaxed">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              💡 Comment fonctionne la découverte des joueurs et des clans ?
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              • <strong>Le pseudo et l&apos;ID du joueur sont déjà connus à 100%</strong> dès la fin de chaque match (l&apos;API PUBG fournit systématiquement le nom en jeu).
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              • <strong>Seul le clan PUBG reste à découvrir :</strong> Les données de match n&apos;incluent pas l&apos;affiliation au clan. Le cron et cet écran interrogent PUBG pour identifier le clan adverse de chaque joueur croisé.
            </p>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Presets & Status Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold mr-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatuses(new Set(['never_attempted', 'retry_pending', 'failed']))
                    setPage(1)
                  }}
                  className={cx(
                    'px-2.5 py-1 rounded-md transition-all',
                    selectedStatuses.size === 3 &&
                      selectedStatuses.has('never_attempted') &&
                      selectedStatuses.has('retry_pending') &&
                      selectedStatuses.has('failed')
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  )}
                  title="Afficher uniquement les 3 statuts de la file d'attente à résoudre"
                >
                  File à traiter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatuses(
                      new Set([
                        'never_attempted',
                        'retry_pending',
                        'failed',
                        'below_threshold',
                        'resolved_with_clan',
                        'resolved_without_clan',
                      ])
                    )
                    setPage(1)
                  }}
                  className={cx(
                    'px-2.5 py-1 rounded-md transition-all',
                    selectedStatuses.size === 6
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  )}
                  title="Sélectionner tous les statuts pour voir tous les joueurs"
                >
                  Tous les statuts
                </button>
              </div>

              {(Object.keys(STATUS_CONFIG) as TriageStatus[]).map((statusKey) => {
                const config = STATUS_CONFIG[statusKey]
                const isSelected = selectedStatuses.has(statusKey)
                return (
                  <button
                    key={statusKey}
                    type="button"
                    onClick={() => toggleStatus(statusKey)}
                    className={cx(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:border-slate-400'
                    )}
                    title={config.tooltip}
                  >
                    <span>{config.label}</span>
                    <span
                      title={config.tooltip}
                      className="cursor-help"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Info className={cx('h-3 w-3', isSelected ? 'text-indigo-200' : 'text-slate-400')} />
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Search Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setPage(1)
                setSearchQuery(searchInput.trim())
              }}
              className="flex items-center gap-1.5"
            >
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Rechercher par pseudo (ex: Lord)..."
                  className="w-56 sm:w-64 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-7 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('')
                      setSearchQuery('')
                      setPage(1)
                    }}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Effacer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold shadow-xs transition-colors"
              >
                Rechercher
              </button>
            </form>
          </div>

          {/* Active Search & Filter Indicators */}
          {searchQuery && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/40 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  Recherche de pseudo active pour « {searchQuery} » ({totalCount.toLocaleString()} résultat{totalCount > 1 ? 's' : ''})
                </span>
                {selectedStatuses.size < 6 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStatuses(
                        new Set([
                          'never_attempted',
                          'retry_pending',
                          'failed',
                          'below_threshold',
                          'resolved_with_clan',
                          'resolved_without_clan',
                        ])
                      )
                      setPage(1)
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-800 font-medium transition-colors border border-indigo-300 dark:border-indigo-700"
                    title="Élargir aux joueurs déjà résolus ou avec/sans clan"
                  >
                    <Search className="h-3 w-3" />
                    Élargir à tous les statuts (y compris déjà résolus)
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchInput('')
                  setSearchQuery('')
                  setPage(1)
                }}
                className="inline-flex items-center gap-0.5 text-indigo-800 dark:text-indigo-200 hover:underline font-bold"
              >
                <X className="h-3 w-3" />
                Effacer le filtre de recherche
              </button>
            </div>
          )}
        </div>

        {/* Triage Table */}
        <div className="app-table-shell overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="app-table-head uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => handleSort('pubgPlayerName')}
                    className="group inline-flex items-center gap-1.5 font-bold hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none transition-colors"
                  >
                    <span>Joueur PUBG</span>
                    {renderSortIcon('pubgPlayerName')}
                  </button>
                </th>
                <th className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => handleSort('status')}
                    className="group inline-flex items-center gap-1.5 font-bold hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none transition-colors"
                  >
                    <span>Statut de résolution</span>
                    {renderSortIcon('status')}
                  </button>
                </th>
                <th className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => handleSort('distinctClanCount')}
                    className="group inline-flex items-center gap-1.5 font-bold hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none transition-colors"
                  >
                    <span>Clans suivis croisés</span>
                    {renderSortIcon('distinctClanCount')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => handleSort('totalEncounterCount')}
                    className="group inline-flex items-center gap-1.5 font-bold hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none transition-colors"
                  >
                    <span>Rencontres totales</span>
                    {renderSortIcon('totalEncounterCount')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => handleSort('resolveAttempts')}
                    className="group inline-flex items-center gap-1.5 font-bold hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none transition-colors"
                  >
                    <span>Tentatives</span>
                    {renderSortIcon('resolveAttempts')}
                  </button>
                </th>
                <th className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => handleSort('lastSeenAt')}
                    className="group inline-flex items-center gap-1.5 font-bold hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none transition-colors"
                  >
                    <span>Dernière vue</span>
                    {renderSortIcon('lastSeenAt')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-right">Action unitaire</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loadingData ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                    Chargement des joueurs en cours...
                  </td>
                </tr>
              ) : triageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                    Aucun joueur trouvé pour ces filtres de statut.
                  </td>
                </tr>
              ) : (
                triageRows.map((row) => {
                  const statusKey = (row.status as TriageStatus) || 'never_attempted'
                  const config = STATUS_CONFIG[statusKey] || STATUS_CONFIG.never_attempted
                  const feedback = resolutionFeedback[row.id]
                  const isResolving = resolvingIds.has(row.id)

                  const clanList =
                    row.clans && row.clans.length > 0
                      ? row.clans
                      : [
                          {
                            clanTag: row.clanTag || row.clan?.tag,
                            encounterCount: row.encounterCount,
                            clanName: row.clanName || row.clan?.name,
                          },
                        ]

                  const totalEncounters = row.totalEncounterCount ?? row.encounterCount ?? 1
                  const distinctClans = row.distinctClanCount ?? clanList.length

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      {/* Player Name with PUBG Tracker Link */}
                      <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span>{row.pubgPlayerName}</span>
                          <a
                            href={`https://pubglookup.com/players/steam/${encodeURIComponent(row.pubgPlayerName)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                            title="Voir sur PUBG Lookup"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="px-3 py-2.5">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                            config.badgeClass
                          )}
                          title={config.tooltip}
                        >
                          {row.pubgClanTag ? `[${row.pubgClanTag}] ` : ''}
                          {config.label}
                        </span>
                      </td>

                      {/* Clans suivis croisés avec badges détaillés */}
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              {distinctClans} {distinctClans > 1 ? 'clans suivis' : 'clan suivi'}
                            </span>
                          </div>
                          {/* Badges de chaque clan avec compteur au survol */}
                          <div className="flex flex-wrap items-center gap-1">
                            {clanList.map((c: any, idx: number) => (
                              <span
                                key={idx}
                                title={`${c.clanName || c.clanTag || 'Clan'} : ${c.encounterCount} rencontre${c.encounterCount > 1 ? 's' : ''}`}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-help hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                              >
                                <span className="font-semibold">{c.clanTag ? `[${c.clanTag}]` : (c.clanName || 'Clan')}</span>
                                <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">({c.encounterCount})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* Rencontres totales */}
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-2xs">
                          {totalEncounters}
                        </span>
                      </td>

                      {/* Resolve attempts */}
                      <td className="px-3 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-400">
                        {row.resolveAttempts ?? 0} / 5
                      </td>

                      {/* Last Seen */}
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleDateString('fr-FR') : '—'}
                      </td>

                      {/* Action */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {feedback ? (
                            <span
                              className={cx(
                                'text-[11px] font-semibold flex items-center gap-1',
                                feedback.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              )}
                            >
                              {feedback.success ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                              {feedback.message}
                            </span>
                          ) : null}

                          <button
                            type="button"
                            disabled={isResolving}
                            onClick={() => handleResolveOne(row, row.status === 'failed')}
                            className={cx(
                              'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shadow-xs',
                              row.status === 'failed'
                                ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 hover:bg-amber-200'
                                : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100'
                            )}
                            title="Lancer une résolution unitaire immédiate auprès de l'API PUBG"
                          >
                            {isResolving ? (
                              <RefreshCcw className="h-3 w-3 animate-spin" />
                            ) : row.status === 'failed' ? (
                              <RotateCcw className="h-3 w-3" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            {isResolving
                              ? 'Appel PUBG...'
                              : row.status === 'failed'
                              ? 'Forcer réessai'
                              : 'Résoudre'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Lignes <strong className="text-slate-800 dark:text-slate-200">{(page - 1) * 20 + 1}–{Math.min(page * 20, totalCount)}</strong> sur{' '}
              <strong className="text-slate-800 dark:text-slate-200">{totalCount.toLocaleString()}</strong> joueurs
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold px-2 text-slate-700 dark:text-slate-300">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
