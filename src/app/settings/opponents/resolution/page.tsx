'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Play,
  RefreshCcw,
  Info,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Activity,
  Calendar,
  ExternalLink,
} from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export default function OpponentsResolutionPage() {
  const { loading, authenticated, isSuperUser } = useAuthSession()

  // Quick data (config, cron, worker, runs) — loads in ~25ms
  const [quickData, setQuickData] = useState<any>(null)
  const [loadingQuick, setLoadingQuick] = useState(false)

  // Backlog data (counts, 24h, estimated days) — loads in ~1s
  const [backlogData, setBacklogData] = useState<any>(null)
  const [loadingBacklog, setLoadingBacklog] = useState(false)

  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Configuration state
  const [batchSize, setBatchSize] = useState<number>(50)
  const [cronStatus, setCronStatus] = useState<'IDLE' | 'SAVING' | 'ERROR'>('IDLE')
  const [resolutionError, setResolutionError] = useState('')

  // Manual run state
  const [isRunningManual, setIsRunningManual] = useState(false)
  const [manualRunSummary, setManualRunSummary] = useState<any>(null)
  const [manualRunError, setManualRunError] = useState('')

  // 1. Initial fast fetch for configuration & recent runs
  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) return

    let cancelled = false
    async function loadQuick() {
      try {
        setLoadingQuick(true)
        setError('')
        const res = await fetch('/api/settings/encountered-player-resolution?mode=quick', {
          cache: 'no-store',
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Chargement rapide impossible')

        if (!cancelled && data?.data) {
          setQuickData(data.data)
          if (data.data.config?.batchSize) {
            setBatchSize(data.data.config.batchSize)
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoadingQuick(false)
      }
    }

    void loadQuick()
    return () => {
      cancelled = true
    }
  }, [authenticated, isSuperUser, loading, refreshKey])

  // 2. Fetch backlog metrics in background (progressive loading)
  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) return

    let cancelled = false
    async function loadBacklog() {
      try {
        setLoadingBacklog(true)
        const res = await fetch('/api/settings/encountered-player-resolution?mode=backlog', {
          cache: 'no-store',
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Chargement du backlog impossible')

        if (!cancelled && data?.data) {
          setBacklogData(data.data)
        }
      } catch (err: any) {
        console.warn('Erreur chargement backlog:', err)
      } finally {
        if (!cancelled) setLoadingBacklog(false)
      }
    }

    void loadBacklog()
    return () => {
      cancelled = true
    }
  }, [authenticated, isSuperUser, loading, refreshKey])

  async function handleToggleCron(currentActive: boolean) {
    if (cronStatus === 'SAVING') return
    try {
      setCronStatus('SAVING')
      setResolutionError('')
      const response = await fetch('/api/settings/encountered-player-resolution', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !currentActive, batchSize }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? 'Erreur inattendue')

      setQuickData((prev: any) =>
        prev
          ? {
              ...prev,
              config: { ...prev.config, enabled: !currentActive, batchSize },
            }
          : prev
      )
      setCronStatus('IDLE')
    } catch (err: any) {
      setCronStatus('ERROR')
      setResolutionError(err.message)
    }
  }

  async function handleSaveBatchSize() {
    if (cronStatus === 'SAVING' || !quickData?.config) return
    const currentActive = quickData.config.enabled
    try {
      setCronStatus('SAVING')
      setResolutionError('')
      const response = await fetch('/api/settings/encountered-player-resolution', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: currentActive, batchSize }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? 'Erreur inattendue')

      setQuickData((prev: any) =>
        prev
          ? {
              ...prev,
              config: { ...prev.config, batchSize },
            }
          : prev
      )
      setCronStatus('IDLE')
    } catch (err: any) {
      setCronStatus('ERROR')
      setResolutionError(err.message)
    }
  }

  async function handleTriggerManualRun() {
    try {
      setIsRunningManual(true)
      setManualRunSummary(null)
      setManualRunError('')

      const res = await fetch('/api/settings/encountered-player-resolution/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Erreur serveur HTTP ${res.status}`)
      }

      setManualRunSummary(data.summary)
      setRefreshKey((k) => k + 1)
    } catch (err: any) {
      setManualRunError(err.message || 'Échec de l’exécution manuelle')
    } finally {
      setIsRunningManual(false)
    }
  }

  if (loading || !authenticated || !isSuperUser) return null

  return (
    <div className="space-y-6">
      {error ? <p className="p-4 text-sm text-rose-700 dark:text-rose-400">{error}</p> : null}

      <section className="app-panel p-5 sm:p-7 space-y-6">
        {/* Header Title */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Zap className="h-5 w-5 text-indigo-500" />
              Résolution automatique des clans adverses
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Débit du cron de résolution, backlog des joueurs à qualifier et déclenchement manuel ciblé. Le débit PUBG
              est partagé avec les autres traitements — voir{' '}
              <Link
                href="/settings/pubg-api"
                className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
              >
                /settings/pubg-api <ExternalLink className="h-3 w-3" />
              </Link>
              .
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loadingQuick || loadingBacklog}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-xs"
              title="Rafraîchir les données de l'onglet"
            >
              <RefreshCcw className={cx('h-3.5 w-3.5', (loadingQuick || loadingBacklog) && 'animate-spin text-indigo-500')} />
              Rafraîchir
            </button>
          </div>
        </div>

        {resolutionError ? <p className="text-sm text-rose-700 dark:text-rose-400">{resolutionError}</p> : null}

        {/* Feedback for manual run */}
        {manualRunSummary && (
          <div className="flex items-center gap-2 p-3 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Lot traité avec succès : {manualRunSummary.uniqueCandidatesSelected} joueurs visés,{' '}
              {manualRunSummary.resolvedWithClan} résolus avec clan, {manualRunSummary.resolvedWithoutClan} sans clan,{' '}
              {manualRunSummary.resolvedFromCache} depuis le cache, {manualRunSummary.failed} échecs.
            </span>
          </div>
        )}

        {manualRunError && (
          <div className="flex items-center gap-2 p-3 text-xs font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400 rounded-xl border border-rose-200 dark:border-rose-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{manualRunError}</span>
          </div>
        )}

        {/* Metric Cards Grid (Progressive Loading) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            label="Jamais tenté"
            value={
              loadingBacklog && !backlogData
                ? '...'
                : Number(backlogData?.backlog?.neverAttempted ?? 0).toLocaleString()
            }
            tooltip="Joueurs croisés en match pour lesquels aucune tentative de résolution PUBG n'a encore été effectuée."
          />
          <MetricCard
            label="Nouvel essai prévu"
            value={
              loadingBacklog && !backlogData
                ? '...'
                : Number(backlogData?.backlog?.retryPending ?? 0).toLocaleString()
            }
            tooltip="Joueurs dont la précédente tentative a échoué (ex: rate limit temporaire ou timeout) et qui seront retentés automatiquement."
          />
          <MetricCard
            label="Échec définitif"
            value={
              loadingBacklog && !backlogData
                ? '...'
                : Number(backlogData?.backlog?.failed ?? 0).toLocaleString()
            }
            tooltip="Joueurs ayant dépassé le quota maximal de 5 tentatives (compte introuvable, supprimé ou erreur PUBG permanente)."
          />
          <MetricCard
            label="Résolus 24h (clan / sans)"
            value={
              loadingBacklog && !backlogData
                ? '...'
                : `${backlogData?.resolutionsLast24h?.withClan ?? 0} / ${backlogData?.resolutionsLast24h?.withoutClan ?? 0}`
            }
            tooltip="Joueurs dont le statut a été résolu au cours des 24 dernières heures (premier chiffre = clan trouvé, second = sans clan)."
          />
          <MetricCard
            label="Rattrapage estimé"
            value={
              loadingBacklog && !backlogData
                ? '...'
                : backlogData?.estimatedCatchUpDays === null || backlogData?.estimatedCatchUpDays === undefined
                ? '—'
                : `${backlogData.estimatedCatchUpDays.toFixed(1)} j`
            }
            tooltip="Délai prévisionnel en jours pour écluser la totalité du backlog selon le rythme du cron et la taille de lot configurée."
          />
          <MetricCard
            label="Cadence cron"
            value={quickData?.cron?.expression || (loadingQuick ? '...' : 'Désactivé')}
            tooltip={quickData?.cron?.description || 'Expression cron planifiée pour le traitement automatique.'}
          />
        </div>

        {/* Controls & Manual Trigger Panel */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label htmlFor="batchSize" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Taille du lot (identités par cycle)
                <span
                  title="Nombre maximum de joueurs distincts traités à chaque passage du cron"
                  className="inline-block ml-1 cursor-help"
                >
                  <Info className="h-3 w-3 text-slate-400 inline" />
                </span>
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="batchSize"
                  type="number"
                  min="1"
                  max="100"
                  className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                />
                <button
                  type="button"
                  disabled={cronStatus === 'SAVING' || batchSize === quickData?.config?.batchSize}
                  onClick={handleSaveBatchSize}
                  className="app-btn app-btn--sm app-btn--secondary text-xs px-3 py-1.5"
                >
                  Sauvegarder
                </button>
              </div>
            </div>

            <div className="hidden sm:block h-10 w-px bg-slate-200 dark:bg-slate-800" />

            <div className="space-y-1">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Statut du cron
              </span>
              <button
                type="button"
                disabled={cronStatus === 'SAVING' || !quickData}
                onClick={() => handleToggleCron(quickData?.config?.enabled)}
                className={cx(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  quickData?.config?.enabled
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300'
                )}
              >
                <Activity className="h-3.5 w-3.5" />
                {cronStatus === 'SAVING'
                  ? 'Modification...'
                  : quickData?.config?.enabled
                  ? 'Cron actif (activé)'
                  : 'Cron inactif (désactivé)'}
              </button>
            </div>
          </div>

          {/* Manual Run Action */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isRunningManual}
              onClick={handleTriggerManualRun}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 active:scale-98 disabled:opacity-50 transition-all shadow-sm"
              title="Lancer immédiatement une passe de résolution sans attendre le déclencheur cron"
            >
              <Play className={cx('h-3.5 w-3.5 fill-current', isRunningManual && 'animate-spin')} />
              {isRunningManual ? 'Résolution du lot en cours...' : 'Résoudre un lot maintenant'}
            </button>
          </div>
        </div>

        {/* Recent Runs Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-indigo-500" />
              Historique des dernières exécutions (Runs)
            </h3>
            {quickData?.recentRuns?.length > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {quickData.recentRuns.length} passages récents
              </span>
            )}
          </div>

          <div className="app-table-shell overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="app-table-head uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-2.5">Date & Heure</th>
                  <th className="px-3 py-2.5">Source / Statut</th>
                  <th className="px-3 py-2.5 text-right">Durée</th>
                  <th className="px-3 py-2.5 text-right">Joueurs visés</th>
                  <th className="px-3 py-2.5 text-right">Résolus</th>
                  <th className="px-3 py-2.5 text-right">Échecs</th>
                  <th className="px-3 py-2.5">Détail / Erreur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loadingQuick && !quickData ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                      Chargement des exécutions...
                    </td>
                  </tr>
                ) : (quickData?.recentRuns?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                      Aucune exécution enregistrée pour le moment.
                    </td>
                  </tr>
                ) : (
                  quickData?.recentRuns.map((run: any) => (
                    <tr key={run.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-900 dark:text-slate-100">
                        {new Date(run.startedAt).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cx(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold',
                            run.status === 'success'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                          )}
                        >
                          {run.source === 'manual' ? 'Manuel' : 'Cron'} • {run.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {run.uniqueCandidatesSelected ?? run.candidatesSelected ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                        {run.resolvedWithClan !== undefined
                          ? run.resolvedWithClan + run.resolvedWithoutClan
                          : run.playersResolved ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {run.failed ?? '—'}
                      </td>
                      <td
                        className="px-3 py-2.5 max-w-[240px] truncate text-slate-500 dark:text-slate-400"
                        title={run.errorMessage || ''}
                      >
                        {run.errorMessage || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
          {label}
        </p>
        {tooltip && (
          <span title={tooltip} className="cursor-help shrink-0">
            <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" />
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
        {value}
      </p>
    </article>
  )
}
