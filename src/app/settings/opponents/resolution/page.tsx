'use client'

import { useEffect, useState } from 'react'
import { useAuthSession } from '@/hooks/useAuthSession'
import Link from 'next/link'

export default function OpponentsResolutionPage() {
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [payload, setPayload] = useState<any>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Resolution state
  const [batchSize, setBatchSize] = useState<number>(50)
  const [cronStatus, setCronStatus] = useState<'IDLE' | 'SAVING' | 'ERROR'>('IDLE')
  const [cronLoading, setCronLoading] = useState(false)
  const [resolutionError, setResolutionError] = useState('')
  const [selectedRunsPage, setSelectedRunsPage] = useState(1)

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) return

    let cancelled = false
    async function load() {
      try {
        setLoadingData(true)
        setError('')

        const searchParams = new URLSearchParams({
          runsPage: String(selectedRunsPage),
        })

        const response = await fetch(`/api/settings/encountered-player-resolution?${searchParams.toString()}`, {
          cache: 'no-store',
        })

        const nextPayload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(nextPayload?.error ?? 'Chargement impossible')
        }

        if (!cancelled) {
          setPayload({ resolution: nextPayload?.data })
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Chargement impossible')
      } finally {
        if (!cancelled) setLoadingData(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [authenticated, isSuperUser, loading, selectedRunsPage, refreshKey])

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

      setPayload((prev: any) =>
        prev
          ? {
              ...prev,
              resolution: {
                ...prev.resolution,
                config: { ...prev.resolution.config, enabled: !currentActive, batchSize },
              },
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
    if (cronStatus === 'SAVING' || !payload?.resolution?.config) return
    const currentActive = payload.resolution.config.enabled
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

      setPayload((prev: any) =>
        prev
          ? {
              ...prev,
              resolution: {
                ...prev.resolution,
                config: { ...prev.resolution.config, batchSize },
              },
            }
          : prev
      )
      setCronStatus('IDLE')
    } catch (err: any) {
      setCronStatus('ERROR')
      setResolutionError(err.message)
    }
  }

  if (loading || !authenticated || !isSuperUser) return null

  const resolutionPayload = payload?.resolution

  return (
    <div className={`space-y-4 ${loadingData ? 'opacity-50 pointer-events-none transition-opacity duration-200' : ''}`}>
      {error ? <p className="p-4 text-sm text-rose-700">{error}</p> : null}
      
      <section className="app-panel p-6 sm:p-8">
        <h2 className="text-sm font-bold text-slate-900">Résolution des clans adverses</h2>
        <p className="mt-1 text-xs text-slate-600">
          Débit du cron de résolution, backlog par statut et action manuelle ciblée. Le débit PUBG est partagé
          avec les autres traitements — voir{' '}
          <Link href="/settings/pubg-api" className="underline">
            /settings/pubg-api
          </Link>
          .
        </p>

        {resolutionError ? <p className="mt-3 text-sm text-rose-700">{resolutionError}</p> : null}

        {resolutionPayload ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <MetricCard label="Jamais tenté" value={String(resolutionPayload.backlog.neverAttempted)} />
              <MetricCard label="Nouvel essai prévu" value={String(resolutionPayload.backlog.retryPending)} />
              <MetricCard label="Échec définitif" value={String(resolutionPayload.backlog.failed)} />
              <MetricCard
                label="Résolus 24h (clan / sans clan)"
                value={`${resolutionPayload.resolutionsLast24h.withClan} / ${resolutionPayload.resolutionsLast24h.withoutClan}`}
              />
              <MetricCard
                label="Rattrapage estimé"
                value={
                  resolutionPayload.estimatedCatchUpDays === null
                    ? '-'
                    : `${resolutionPayload.estimatedCatchUpDays.toFixed(1)} j`
                }
              />
              <MetricCard
                label="Fréquence cron"
                value={resolutionPayload.cron?.expression || 'Désactivé'}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-end gap-4 rounded-lg bg-slate-50 p-4 border border-slate-200">
              <div>
                <label htmlFor="batchSize" className="block text-xs font-semibold text-slate-700">
                  Taille du lot (identités)
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="batchSize"
                    type="number"
                    min="1"
                    max="100"
                    className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    disabled={cronStatus === 'SAVING' || batchSize === resolutionPayload.config.batchSize}
                    onClick={handleSaveBatchSize}
                    className="app-btn app-btn--sm app-btn--secondary"
                  >
                    Sauvegarder
                  </button>
                </div>
              </div>

              <div className="flex-1" />

              <button
                type="button"
                disabled={cronStatus === 'SAVING'}
                onClick={() => handleToggleCron(resolutionPayload.config.enabled)}
                className={`app-btn app-btn--md ${
                  resolutionPayload.config.enabled ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {cronStatus === 'SAVING'
                  ? 'Modification...'
                  : resolutionPayload.config.enabled
                  ? 'Désactiver le cron'
                  : 'Activer le cron'}
              </button>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-bold text-slate-900">Dernières exécutions (runs)</h3>
              <div className="app-table-shell mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-xs text-slate-700">
                  <thead className="app-table-head uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">Date</th>
                      <th className="px-2 py-1.5">Statut</th>
                      <th className="px-2 py-1.5 text-right">Durée (ms)</th>
                      <th className="px-2 py-1.5 text-right">Joueurs visés</th>
                      <th className="px-2 py-1.5 text-right">Résolus</th>
                      <th className="px-2 py-1.5 text-right">Échecs</th>
                      <th className="px-2 py-1.5">Erreur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(resolutionPayload.recentRuns?.length ?? 0) === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-4 text-center text-slate-500">
                          Aucun run enregistré.
                        </td>
                      </tr>
                    ) : (
                      resolutionPayload.recentRuns.map((run: any) => (
                        <tr key={run.id} className="app-table-row">
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {new Date(run.startedAt).toLocaleString('fr-FR')}
                          </td>
                          <td className="px-2 py-1.5 font-medium">{run.status}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{run.durationMs ?? '-'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{run.uniqueCandidatesSelected ?? run.playersAttempted ?? '-'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-emerald-600">
                            {run.resolvedWithClan !== undefined ? run.resolvedWithClan + run.resolvedWithoutClan : run.playersResolved ?? '-'}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-rose-600">
                            {run.failed ?? run.playersFailed ?? '-'}
                          </td>
                          <td className="px-2 py-1.5 max-w-[200px] truncate text-rose-600" title={run.errorMessage || ''}>
                            {run.errorMessage || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {resolutionPayload.recentRuns?.pagination && resolutionPayload.recentRuns.pagination.totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
                  <p>
                    Page {resolutionPayload.recentRuns.pagination.page} / {resolutionPayload.recentRuns.pagination.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="app-btn app-btn--sm app-btn--secondary"
                      disabled={selectedRunsPage === 1}
                      onClick={() => setSelectedRunsPage((p) => Math.max(1, p - 1))}
                    >
                      Précédent
                    </button>
                    <button
                      type="button"
                      className="app-btn app-btn--sm app-btn--secondary"
                      disabled={selectedRunsPage >= resolutionPayload.recentRuns.pagination.totalPages}
                      onClick={() => setSelectedRunsPage((p) => p + 1)}
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Chargement des données de résolution...</p>
        )}
      </section>
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
