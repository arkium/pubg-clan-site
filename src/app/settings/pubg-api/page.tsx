'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'

type ApiCallRow = {
  id: string
  source: string
  method: string
  endpoint: string
  shard: string | null
  statusCode: number | null
  success: boolean
  retryCount: number
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  clanId: number | null
  memberId: number | null
  errorMessage: string | null
}

type MinutePoint = {
  minute: string
  total: number
  success: number
  rateLimited: number
  errors: number
}

type CallsPayload = {
  rpm: number
  bounds: {
    min: number
    max: number
    defaultValue: number
  }
  windowMinutes: number
  totals: {
    total: number
    success: number
    rateLimited: number
    errors: number
    avgDurationMs: number | null
  }
  series: MinutePoint[]
  history: ApiCallRow[]
}

const WINDOW_OPTIONS = [15, 60, 180] as const

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('fr-FR')
}

export default function PubgApiSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, permissions } = useAuthSession()

  const [windowMinutes, setWindowMinutes] = useState<(typeof WINDOW_OPTIONS)[number]>(60)
  const [reloadToken, setReloadToken] = useState(0)
  const [payload, setPayload] = useState<CallsPayload | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')

  const [rpmInput, setRpmInput] = useState('')
  const [savingRpm, setSavingRpm] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const canReadSettings =
    permissions.includes('*') || permissions.includes('manage_settings') || permissions.includes('manage_members')
  const canWriteSettings = permissions.includes('*') || permissions.includes('manage_settings')

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/pubg-api')
    }
  }, [authenticated, loading, router])

  useEffect(() => {
    if (loading || !authenticated || !canReadSettings) {
      return
    }

    let cancelled = false

    async function load() {
      try {
        setLoadingData(true)
        setError('')

        const response = await fetch(
          `/api/settings/pubg-api-calls?windowMinutes=${windowMinutes}&historyLimit=150`,
          {
            cache: 'no-store',
          }
        )

        const nextPayload = (await response.json().catch(() => null)) as CallsPayload | { error?: string } | null

        if (!response.ok) {
          throw new Error((nextPayload as { error?: string } | null)?.error ?? 'Chargement impossible')
        }

        if (!cancelled) {
          setPayload(nextPayload as CallsPayload)
          setRpmInput(String((nextPayload as CallsPayload).rpm))
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Chargement impossible')
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [authenticated, canReadSettings, loading, reloadToken, windowMinutes])

  const chartMax = useMemo(() => {
    const values = payload?.series.map((item) => item.total) ?? []
    const max = Math.max(0, ...values)
    return max > 0 ? max : 1
  }, [payload?.series])

  async function handleSaveRpm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canWriteSettings) {
      return
    }

    try {
      setSavingRpm(true)
      setSaveMessage('')
      setError('')

      const rpm = Number(rpmInput)
      const response = await fetch('/api/settings/pubg-api-rate-limit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ rpm }),
      })

      const body = (await response.json().catch(() => null)) as
        | { error?: string; rpm?: number }
        | null

      if (!response.ok) {
        throw new Error(body?.error ?? 'Impossible de mettre a jour le RPM')
      }

      setRpmInput(String(body?.rpm ?? rpm))
      setSaveMessage('Limite RPM mise a jour.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible de mettre a jour le RPM')
    } finally {
      setSavingRpm(false)
    }
  }

  if (loading || loadingData) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-12">
        <p className="text-sm text-slate-600">Chargement du monitoring PUBG API...</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!canReadSettings) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-bold text-amber-900">Acces restreint</h1>
          <p className="mt-2 text-sm text-amber-800">
            Cette page est reservee aux administrateurs disposant des droits adequats.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
          >
            Retour a l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Observabilite</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">Monitoring PUBG API</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Suivi en temps reel des appels API, des erreurs 429 et de la latence moyenne.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="Appels fenetre" value={String(payload?.totals.total ?? 0)} />
          <MetricCard label="Succes" value={String(payload?.totals.success ?? 0)} tone="emerald" />
          <MetricCard label="429" value={String(payload?.totals.rateLimited ?? 0)} tone="amber" />
          <MetricCard label="Erreurs" value={String(payload?.totals.errors ?? 0)} tone="rose" />
          <MetricCard
            label="Latence moyenne"
            value={payload?.totals.avgDurationMs != null ? `${payload.totals.avgDurationMs} ms` : '-'}
          />
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setWindowMinutes(option)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  windowMinutes === option
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {option} min
              </button>
            ))}
            <button
              type="button"
              onClick={() => setReloadToken((current) => current + 1)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Actualiser
            </button>
          </div>

          <div className="mt-6 overflow-x-auto">
            <div className="flex min-w-[720px] items-end gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {(payload?.series ?? []).map((point) => {
                const barHeight = Math.max(8, Math.round((point.total / chartMax) * 160))
                return (
                  <div key={point.minute} className="flex min-w-[10px] flex-1 flex-col items-center gap-1">
                    <div
                      title={`${new Date(point.minute).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} • ${point.total} appels`}
                      className="w-full rounded-t bg-slate-900"
                      style={{ height: `${barHeight}px` }}
                    />
                    <span className="text-[10px] text-slate-500">
                      {new Date(point.minute).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">Configuration du rate limit</h2>
          <p className="mt-1 text-xs text-slate-600">
            Valeur actuelle: {payload?.rpm ?? '-'} RPM (min {payload?.bounds.min ?? '-'} / max{' '}
            {payload?.bounds.max ?? '-'})
          </p>

          <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={handleSaveRpm}>
            <label className="text-sm font-medium text-slate-700">
              RPM
              <input
                type="number"
                min={payload?.bounds.min ?? 1}
                max={payload?.bounds.max ?? 300}
                step={1}
                value={rpmInput}
                onChange={(event) => setRpmInput(event.target.value)}
                disabled={!canWriteSettings || savingRpm}
                className="mt-1 block w-32 rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={!canWriteSettings || savingRpm}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingRpm ? 'Enregistrement...' : 'Mettre a jour'}
            </button>
          </form>

          {saveMessage ? <p className="mt-3 text-sm text-emerald-700">{saveMessage}</p> : null}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">Historique recent</h2>
          {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Endpoint</th>
                  <th className="px-2 py-2">Statut</th>
                  <th className="px-2 py-2">Duree</th>
                  <th className="px-2 py-2">Retries</th>
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2">Erreur</th>
                </tr>
              </thead>
              <tbody>
                {(payload?.history ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(row.startedAt)}</td>
                    <td className="px-2 py-2">
                      <p className="font-semibold text-slate-900">{row.method} {row.endpoint}</p>
                      {row.shard ? <p className="text-[11px] text-slate-500">Shard: {row.shard}</p> : null}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                          row.success ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {row.statusCode ?? 'n/a'}
                      </span>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.durationMs ?? '-'} ms</td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.retryCount}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.source}</td>
                    <td className="px-2 py-2 text-rose-700">{row.errorMessage ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}

function MetricCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: string
  tone?: 'slate' | 'emerald' | 'amber' | 'rose'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : tone === 'rose'
          ? 'border-rose-200 bg-rose-50 text-rose-900'
          : 'border-slate-200 bg-slate-50 text-slate-900'

  return (
    <article className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </article>
  )
}
