'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SectionNav from '@/components/SectionNav'
import { useSelectedClan } from '@/hooks/useSelectedClan'

type CronAction =
  | 'sync_matches'
  | 'sync_lifetime_stats'
  | 'generate_weekly_report'
  | 'generate_monthly_report'

type CronHistoryEntry = {
  id: string
  action: string
  status: 'running' | 'success' | 'partial' | 'failed'
  source: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  message: string | null
  details?: unknown
  triggeredBy: number | null
}

type CronCheck = {
  key: string
  label: string
  status: 'ok' | 'warning' | 'error'
  value: string
  hint?: string
}

type CronStatusPayload = {
  ok: boolean
  clanId: number
  actionLabels: Record<string, string>
  health: {
    successRate: number | null
    runningCount: number
    failedCount: number
    completedRecent: number
    totalRecent: number
  }
  checks: {
    total: number
    errors: number
    warnings: number
    items: CronCheck[]
  }
  runtime: {
    webWorker: {
      cronJobsEnabled: boolean
      cronBootstrapEnabled: boolean
    }
    cronWorker: {
      probeEnabled?: boolean
      available: boolean
      initialized?: boolean
      cronJobsEnabled?: boolean
      reason?: string
    }
  }
  pubgApi: {
    latestRateLimit: {
      limit: number | null
      remaining: number | null
      resetAt: string | null
      observedAt: string
    } | null
  }
  latestByAction: CronHistoryEntry[]
  history: CronHistoryEntry[]
}

type CronActionResponse = {
  ok?: boolean
  message?: string
  warning?: string
  error?: string
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDate(value: string | null) {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function statusClass(status: 'ok' | 'warning' | 'error' | 'running' | 'success' | 'partial' | 'failed') {
  if (status === 'ok' || status === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }

  if (status === 'warning' || status === 'partial' || status === 'running') {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }

  return 'border-rose-200 bg-rose-50 text-rose-800'
}

function getDurationLabel(durationMs: number | null) {
  if (durationMs === null || durationMs === undefined) {
    return '-'
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`
  }

  return `${(durationMs / 1000).toFixed(1)} s`
}

function getLatestLifetimeSyncEntry(entries: CronHistoryEntry[]) {
  const daily = entries.find((entry) => entry.action === 'daily_lifetime_stats_sync')
  if (daily) {
    return daily
  }

  return entries.find((entry) => entry.action === 'sync_lifetime_stats') ?? null
}

export default function CronSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingAction, setPendingAction] = useState<CronAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [payload, setPayload] = useState<CronStatusPayload | null>(null)

  const cronWorkerHealth = useMemo(() => {
    if (!payload) {
      return {
        label: 'Cron worker: inconnu',
        status: 'warning' as const,
      }
    }

    if (!payload.runtime.cronWorker.available) {
      if (payload.runtime.cronWorker.probeEnabled === false) {
        return {
          label: 'Cron worker: verification runtime non configuree',
          status: 'warning' as const,
        }
      }

      return {
        label: 'Cron worker: inaccessible',
        status: 'error' as const,
      }
    }

    if (!payload.runtime.cronWorker.initialized || !payload.runtime.cronWorker.cronJobsEnabled) {
      return {
        label: 'Cron worker: non initialise',
        status: 'warning' as const,
      }
    }

    return {
      label: 'Cron worker: OK',
      status: 'ok' as const,
    }
  }, [payload])

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  const loadStatus = useCallback(async (currentClanId: number) => {
    try {
      const response = await fetch(`/api/clans/${currentClanId}/cron-control`, {
        cache: 'no-store',
      })

      const data = (await response.json().catch(() => null)) as
        | CronStatusPayload
        | { error?: string }
        | null

      if (!response.ok || !data || !('ok' in data) || !data.ok) {
        if (response.status === 401) {
          router.replace(`/login?redirect=${encodeURIComponent(`/clans/${currentClanId}/settings/cron`)}`)
          return
        }

        if (response.status === 403) {
          router.replace(`/clans/${currentClanId}`)
          return
        }

        setPayload(null)
        setError(data && 'error' in data && data.error ? data.error : 'Chargement des donnees cron impossible')
        return
      }

      setPayload(data)
      setError(null)
    } catch {
      setPayload(null)
      setError('Chargement des donnees cron impossible')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [router])

  useEffect(() => {
    if (!clanId) {
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus(clanId)
  }, [clanId, loadStatus])

  async function runAction(action: CronAction) {
    if (!clanId || pendingAction) {
      return
    }

    setPendingAction(action)
    setError(null)
    setInfo(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/cron-control`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action }),
      })

      let result: CronActionResponse | null = null
      let rawResponseText = ''

      try {
        result = (await response.clone().json()) as CronActionResponse
      } catch {
        rawResponseText = (await response.text().catch(() => '')).trim()
      }

      if (!response.ok || !result?.ok) {
        if (response.status === 401) {
          router.replace(`/login?redirect=${encodeURIComponent(`/clans/${clanId}/settings/cron`)}`)
          return
        }

        if (response.status === 403) {
          router.replace(`/clans/${clanId}`)
          return
        }

        const fallback = rawResponseText
          ? `HTTP ${response.status}: ${rawResponseText.slice(0, 180)}`
          : `HTTP ${response.status}: reponse invalide du serveur`
        setError(
          result?.error ??
            result?.message ??
            `${fallback}. L action a peut-etre ete lancee; verifie l historique ci-dessous.`
        )
        setRefreshing(true)
        await loadStatus(clanId)
        return
      }

      const details = [result.message ?? 'Action lancee']
      if (result.warning) {
        details.push(result.warning)
      }

      setInfo(details.join(' '))
      setRefreshing(true)
      await loadStatus(clanId)
    } catch {
      setError('Reponse non recue. L action a peut-etre ete lancee; verifie l historique.')
      setRefreshing(true)
      await loadStatus(clanId)
    } finally {
      setPendingAction(null)
    }
  }

  if (loading) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
        <p className="text-sm text-slate-600">Chargement des operations cron...</p>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <section className="app-panel p-4">
        <SettingsPageHeader
          title="Pilotage des cron"
          subtitle="Contrôle de santé, vérification de la configuration, lancement manuel et historique des exécutions."
        />
        <SectionNav section="owner-menu" />
      </section>

      <section className="app-panel p-4">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(cronWorkerHealth.status)}`}>
          {cronWorkerHealth.label}
        </span>
      </section>

      {error ? <section className="app-panel p-4 text-sm text-rose-800">{error}</section> : null}

      {info ? <section className="app-panel p-4 text-sm text-emerald-800">{info}</section> : null}

      {payload ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Succes recent</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {payload.health.successRate === null ? '-' : `${payload.health.successRate}%`}
              </p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Executions recentes</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{payload.health.totalRecent}</p>
              <p className="mt-1 text-xs text-slate-500">{payload.health.completedRecent} terminees</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">En cours</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">{payload.health.runningCount}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Echecs recents</p>
              <p className="mt-2 text-2xl font-bold text-rose-700">{payload.health.failedCount}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Dernier sync lifetime</p>
              {(() => {
                const latestLifetimeSync = getLatestLifetimeSyncEntry(payload.latestByAction)

                if (!latestLifetimeSync) {
                  return <p className="mt-2 text-sm font-semibold text-slate-600">Aucune execution</p>
                }

                return (
                  <>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatDate(latestLifetimeSync.startedAt)}</p>
                    <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(latestLifetimeSync.status)}`}>
                      {latestLifetimeSync.status}
                    </span>
                  </>
                )
              })()}
            </article>
          </section>

          <section className="app-panel p-4">
            <h2 className="text-lg font-semibold text-slate-900">Actions manuelles</h2>
            <p className="mt-1 text-sm text-slate-600">
              Lance une action et controle le resultat immediatement dans l historique.
            </p>

            {clanId ? (
              <p className="mt-2 text-sm text-slate-600">
                <Link
                  href={`/clans/${clanId}/telemetry/recoveries`}
                  className="font-semibold text-emerald-700 underline-offset-2 hover:text-emerald-800 hover:underline"
                >
                  Ouvrir la console recoveries telemetry
                </Link>
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => void runAction('sync_matches')}
                disabled={pendingAction !== null}
                className="app-btn app-btn--md app-btn--secondary"
              >
                {pendingAction === 'sync_matches' ? 'Execution...' : 'Sync matchs'}
              </button>
              <button
                type="button"
                onClick={() => void runAction('sync_lifetime_stats')}
                disabled={pendingAction !== null}
                className="app-btn app-btn--md app-btn--secondary"
              >
                {pendingAction === 'sync_lifetime_stats' ? 'Execution...' : 'Sync stats lifetime'}
              </button>
              <button
                type="button"
                onClick={() => void runAction('generate_weekly_report')}
                disabled={pendingAction !== null}
                className="app-btn app-btn--md app-btn--secondary"
              >
                {pendingAction === 'generate_weekly_report' ? 'Execution...' : 'Rapport hebdo'}
              </button>
              <button
                type="button"
                onClick={() => void runAction('generate_monthly_report')}
                disabled={pendingAction !== null}
                className="app-btn app-btn--md app-btn--secondary"
              >
                {pendingAction === 'generate_monthly_report' ? 'Execution...' : 'Rapport mensuel'}
              </button>
            </div>
          </section>

          <section className="app-panel p-4">
            <h2 className="text-lg font-semibold text-slate-900">Verification configuration</h2>
            <p className="mt-1 text-sm text-slate-600">
              Controle des variables critiques, expressions cron et points de configuration sensibles.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <article className="app-panel-muted p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contexte web worker</p>
                <p className="mt-2 text-sm text-slate-700">
                  ENABLE_CRON_JOBS: <strong>{payload.runtime.webWorker.cronJobsEnabled ? 'true' : 'false'}</strong>
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  ENABLE_CRON_BOOTSTRAP:{' '}
                  <strong>{payload.runtime.webWorker.cronBootstrapEnabled ? 'true' : 'false'}</strong>
                </p>
              </article>

              <article className="app-panel-muted p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Etat cron worker (runtime)</p>
                {payload.runtime.cronWorker.available ? (
                  <>
                    <p className="mt-2 text-sm text-slate-700">
                      initialized: <strong>{payload.runtime.cronWorker.initialized ? 'true' : 'false'}</strong>
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      ENABLE_CRON_JOBS:{' '}
                      <strong>{payload.runtime.cronWorker.cronJobsEnabled ? 'true' : 'false'}</strong>
                    </p>
                  </>
                ) : (
                  <p
                    className={`mt-2 text-sm ${
                      payload.runtime.cronWorker.probeEnabled === false
                        ? 'text-slate-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {payload.runtime.cronWorker.probeEnabled === false
                      ? `Non configure: ${payload.runtime.cronWorker.reason ?? 'verification runtime non configuree'}`
                      : `Indisponible: ${payload.runtime.cronWorker.reason ?? 'etat inconnu'}`}
                  </p>
                )}
              </article>

              <article className="app-panel-muted p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rate limit PUBG API (snapshot)</p>
                <p className="mt-2 text-sm text-slate-700">
                  Limite: <strong>{payload.pubgApi.latestRateLimit?.limit ?? '-'}</strong>
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Restant: <strong>{payload.pubgApi.latestRateLimit?.remaining ?? '-'}</strong>
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Reset: <strong>{formatDate(payload.pubgApi.latestRateLimit?.resetAt ?? null)}</strong>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Observe: {formatDate(payload.pubgApi.latestRateLimit?.observedAt ?? null)}
                </p>
              </article>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(payload.checks.errors > 0 ? 'error' : 'ok')}`}>
                Erreurs: {payload.checks.errors}
              </span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(payload.checks.warnings > 0 ? 'warning' : 'ok')}`}>
                Warnings: {payload.checks.warnings}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Total checks: {payload.checks.total}
              </span>
            </div>

            <div className="app-table-shell mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Check</th>
                    <th className="px-2 py-2">Etat</th>
                    <th className="px-2 py-2">Valeur</th>
                    <th className="px-2 py-2">Aide</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.checks.items.map((item) => (
                    <tr key={item.key} className="app-table-row align-top">
                      <td className="px-2 py-2 font-medium text-slate-900">{item.label}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-slate-700">{item.value}</td>
                      <td className="px-2 py-2 text-slate-600">{item.hint ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="app-panel p-4">
            <h2 className="text-lg font-semibold text-slate-900">Historique des cron</h2>
            <p className="mt-1 text-sm text-slate-600">
              Dernieres executions enregistrees, avec statut, duree et message.
            </p>

            <div className="app-table-shell mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Action</th>
                    <th className="px-2 py-2">Statut</th>
                    <th className="px-2 py-2">Debut</th>
                    <th className="px-2 py-2">Duree</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.history.length === 0 ? (
                    <tr>
                      <td className="px-2 py-3 text-slate-500" colSpan={6}>
                        Aucun historique disponible pour ce clan.
                      </td>
                    </tr>
                  ) : (
                    payload.history.map((item) => (
                      <tr key={item.id} className="app-table-row align-top">
                        <td className="px-2 py-2 font-medium text-slate-900">
                          {payload.actionLabels[item.action] ?? item.action}
                        </td>
                        <td className="px-2 py-2">
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-slate-700">{formatDate(item.startedAt)}</td>
                        <td className="px-2 py-2 text-slate-700">{getDurationLabel(item.durationMs)}</td>
                        <td className="px-2 py-2 text-slate-700">{item.source}</td>
                        <td className="px-2 py-2 text-slate-600">{item.message ?? '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="app-panel-muted p-4 text-sm text-slate-700">
            <h2 className="text-base font-semibold">Points importants supplementaires</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Executer les cron automatiques sur un seul worker avec ENABLE_CRON_JOBS=true.</li>
              <li>Garder INTERNAL_APP_URL en local (127.0.0.1) pour eviter les soucis de proxy.</li>
              <li>Surveiller les erreurs recurrentes et traiter les causes (API PUBG, permissions, DB).</li>
              <li>Verifier regulierement les delais d execution pour detecter une degradation.</li>
              <li>Format cron: minute heure jour-du-mois mois jour-semaine (exemple: 0 2,17 * * * = tous les jours a 02h00 et 17h00).</li>
            </ul>
          </section>
        </>
      ) : null}
    </main>
  )
}
