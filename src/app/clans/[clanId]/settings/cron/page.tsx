'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { useSelectedClan } from '@/hooks/useSelectedClan'

type CronAction =
  | 'sync_matches'
  | 'sync_stats'
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
  latestByAction: CronHistoryEntry[]
  history: CronHistoryEntry[]
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

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  async function loadStatus(currentClanId: number, silent = false) {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const response = await fetch(`/api/clans/${currentClanId}/cron-control`, {
        cache: 'no-store',
      })

      const data = (await response.json().catch(() => null)) as
        | CronStatusPayload
        | { error?: string }
        | null

      if (!response.ok || !data || !('ok' in data) || !data.ok) {
        if (response.status === 401 || response.status === 403) {
          router.replace(`/login?redirect=${encodeURIComponent(`/clans/${currentClanId}/settings/cron`)}`)
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
  }

  useEffect(() => {
    if (!clanId) {
      return
    }

    void loadStatus(clanId)
  }, [clanId])

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

      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; warning?: string; error?: string }
        | null

      if (!response.ok || !result?.ok) {
        setError(result?.error ?? result?.message ?? 'Action cron impossible')
        return
      }

      const details = [result.message ?? 'Action lancee']
      if (result.warning) {
        details.push(result.warning)
      }

      setInfo(details.join(' '))
      await loadStatus(clanId, true)
    } catch {
      setError('Action cron impossible')
    } finally {
      setPendingAction(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <p className="text-sm text-slate-600">Chargement des operations cron...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Owner Ops</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Pilotage des cron</h1>
        <p className="mt-2 text-sm text-slate-600">
          Controle de sante, verification de la configuration, lancement manuel et historique des executions.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => clanId && void loadStatus(clanId, true)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            disabled={refreshing}
          >
            {refreshing ? 'Actualisation...' : 'Actualiser'}
          </button>
          <Link
            href={clanId ? `/clans/${clanId}/reports` : '/clans'}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Voir les rapports
          </Link>
        </div>
      </header>

      {error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</section>
      ) : null}

      {info ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{info}</section>
      ) : null}

      {payload ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Succes recent</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {payload.health.successRate === null ? '-' : `${payload.health.successRate}%`}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Executions recentes</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{payload.health.totalRecent}</p>
              <p className="mt-1 text-xs text-slate-500">{payload.health.completedRecent} terminees</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">En cours</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">{payload.health.runningCount}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Echecs recents</p>
              <p className="mt-2 text-2xl font-bold text-rose-700">{payload.health.failedCount}</p>
            </article>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Actions manuelles</h2>
            <p className="mt-1 text-sm text-slate-600">
              Lance une action et controle le resultat immediatement dans l'historique.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => void runAction('sync_matches')}
                disabled={pendingAction !== null}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === 'sync_matches' ? 'Execution...' : 'Sync matchs'}
              </button>
              <button
                type="button"
                onClick={() => void runAction('sync_stats')}
                disabled={pendingAction !== null}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === 'sync_stats' ? 'Execution...' : 'Sync stats'}
              </button>
              <button
                type="button"
                onClick={() => void runAction('generate_weekly_report')}
                disabled={pendingAction !== null}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === 'generate_weekly_report' ? 'Execution...' : 'Rapport hebdo'}
              </button>
              <button
                type="button"
                onClick={() => void runAction('generate_monthly_report')}
                disabled={pendingAction !== null}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === 'generate_monthly_report' ? 'Execution...' : 'Rapport mensuel'}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Verification configuration</h2>
            <p className="mt-1 text-sm text-slate-600">
              Controle des variables critiques, expressions cron et points de configuration sensibles.
            </p>

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

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Check</th>
                    <th className="px-2 py-2">Etat</th>
                    <th className="px-2 py-2">Valeur</th>
                    <th className="px-2 py-2">Aide</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.checks.items.map((item) => (
                    <tr key={item.key} className="border-t border-slate-100 align-top">
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

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Historique des cron</h2>
            <p className="mt-1 text-sm text-slate-600">
              Dernieres executions enregistrees, avec statut, duree et message.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
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
                      <tr key={item.id} className="border-t border-slate-100 align-top">
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

          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 text-sm text-indigo-900">
            <h2 className="text-base font-semibold">Points importants supplementaires</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Executer les cron automatiques sur un seul worker avec ENABLE_CRON_JOBS=true.</li>
              <li>Garder INTERNAL_APP_URL en local (127.0.0.1) pour eviter les soucis de proxy.</li>
              <li>Surveiller les erreurs recurrentes et traiter les causes (API PUBG, permissions, DB).</li>
              <li>Verifier regulierement les delais d'execution pour detecter une degradation.</li>
            </ul>
          </section>
        </>
      ) : null}
    </div>
  )
}
