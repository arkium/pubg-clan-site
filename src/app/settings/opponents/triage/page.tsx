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
    label: 'Jamais tenté',
    tooltip: 'Joueur croisé au moins 2 fois mais encore jamais interrogé auprès de l’API PUBG.',
    badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
  },
  retry_pending: {
    label: 'Nouvel essai prévu',
    tooltip: 'Tentative précédente échouée (ex: rate limit ou timeout temporaire). Sera retenté automatiquement.',
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  },
  failed: {
    label: 'Échec définitif',
    tooltip: 'Nombre maximal de tentatives (5) dépassé. Compte souvent inexistant ou introuvable.',
    badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-800',
  },
  below_threshold: {
    label: 'Sous le seuil (<2)',
    tooltip: 'Croisé une seule fois. Nécessite 2 rencontres pour être qualifié au traitement automatique.',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
  resolved_with_clan: {
    label: 'Avec clan',
    tooltip: 'Clan PUBG identifié avec succès.',
    badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  },
  resolved_without_clan: {
    label: 'Sans clan',
    tooltip: 'Joueur solo vérifié sans aucun clan affilié.',
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
        for (const s of selectedStatuses) {
          params.append('status', s)
        }

        const res = await fetch(`/api/settings/encountered-players?${params.toString()}`, {
          cache: 'no-store',
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Chargement du triage impossible')

        if (!cancelled) {
          setTriageRows(data.rows || [])
          setTotalCount(data.total || 0)
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
  }, [authenticated, isSuperUser, loading, page, selectedStatuses, searchQuery, refreshKey])

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

        {/* Filter Bar & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Status Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
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

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1)
                  setSearchQuery(searchInput.trim())
                }
              }}
              onBlur={() => {
                setPage(1)
                setSearchQuery(searchInput.trim())
              }}
              placeholder="Rechercher par pseudo..."
              className="w-56 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        {/* Triage Table */}
        <div className="app-table-shell overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="app-table-head uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5">Joueur PUBG</th>
                <th className="px-3 py-2.5">Statut de résolution</th>
                <th className="px-3 py-2.5">Clan croisé</th>
                <th className="px-3 py-2.5 text-center">Rencontres</th>
                <th className="px-3 py-2.5 text-center">Tentatives</th>
                <th className="px-3 py-2.5">Dernière vue</th>
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

                      {/* Clan that encountered them */}
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium">
                        {row.clan ? `${row.clan.name} [${row.clan.tag}]` : '—'}
                      </td>

                      {/* Encounter count */}
                      <td className="px-3 py-2.5 text-center tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {row.encounterCount}
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
