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
  actorLabel: string
  rateLimitLimit?: number | null
  rateLimitRemaining?: number | null
  rateLimitResetAt?: string | null
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
  latestRateLimit: {
    limit: number | null
    remaining: number | null
    resetAt: string | null
    observedAt: string
  } | null
  historyPagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    errorsOnly: boolean
  }
  series: MinutePoint[]
  history: ApiCallRow[]
}

const WINDOW_OPTIONS = [15, 60, 180] as const
const HISTORY_PAGE_SIZE_OPTIONS = [10, 25, 50] as const

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
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState<(typeof HISTORY_PAGE_SIZE_OPTIONS)[number]>(25)

  const isOwner = permissions.includes('*')
  const canWriteSettings = isOwner

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/pubg-api')
    }
  }, [authenticated, loading, router])

  useEffect(() => {
    if (loading || !authenticated || !isOwner) {
      return
    }

    let cancelled = false

    async function load() {
      try {
        setLoadingData(true)
        setError('')

        const response = await fetch(
          `/api/settings/pubg-api-calls?windowMinutes=${windowMinutes}&page=${historyPage}&pageSize=${historyPageSize}&errorsOnly=${errorsOnly ? 1 : 0}`,
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
  }, [authenticated, errorsOnly, historyPage, historyPageSize, isOwner, loading, reloadToken, windowMinutes])

  const chartMax = useMemo(() => {
    const values = payload?.series.map((item) => item.total) ?? []
    const max = Math.max(0, ...values)
    return max > 0 ? max : 1
  }, [payload?.series])

  async function handleSaveRpm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isOwner) {
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

  if (!isOwner) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-bold text-amber-900">Acces restreint</h1>
          <p className="mt-2 text-sm text-amber-800">
            Cette page est reservee au Owner.
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

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-5">
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
            <div className="min-w-[720px] rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(payload?.series.length ?? 0, 30) || 15}, minmax(0, 1fr))`,
                }}
              >
                {(payload?.series ?? []).map((point) => {
                  const level = getIntensityLevel(point.total, chartMax)
                  const hasError = point.errors > 0
                  const hasRateLimit = point.rateLimited > 0
                  const cellTone = hasError
                    ? ERROR_LEVEL_CLASSES[level]
                    : hasRateLimit
                      ? RATE_LIMIT_LEVEL_CLASSES[level]
                      : SUCCESS_LEVEL_CLASSES[level]

                  return (
                    <div
                      key={point.minute}
                      title={`${new Date(point.minute).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} • ${point.total} appels • ${point.errors} erreurs • ${point.rateLimited} x 429`}
                      className={`group relative aspect-square rounded-md border ${cellTone}`}
                    >
                      {hasError ? (
                        <span className="absolute right-0.5 top-0.5 text-[10px] leading-none text-rose-700">!</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                <LegendPill label="Normal" className="border-emerald-200 bg-emerald-200" />
                <LegendPill label="429" className="border-amber-200 bg-amber-200" />
                <LegendPill label="Erreur" className="border-rose-200 bg-rose-200" />
                <span className="text-slate-500">Plus la couleur est soutenue, plus le volume est eleve.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">Configuration du rate limit</h2>
          <p className="mt-1 text-xs text-slate-600">
            Valeur actuelle: {payload?.rpm ?? '-'} RPM (min {payload?.bounds.min ?? '-'} / max{' '}
            {payload?.bounds.max ?? '-'})
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Reference officielle:{' '}
            <a
              href="https://documentation.pubg.com/en/rate-limits.html"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-800"
            >
              PUBG API Rate Limits
            </a>
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">X-RateLimit-Limit</p>
              <p className="mt-1 text-lg font-black text-slate-900">{payload?.latestRateLimit?.limit ?? '-'}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">X-RateLimit-Remaining</p>
              <p className="mt-1 text-lg font-black text-slate-900">{payload?.latestRateLimit?.remaining ?? '-'}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">X-RateLimit-Reset</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {payload?.latestRateLimit?.resetAt ? formatDateTime(payload.latestRateLimit.resetAt) : '-'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Observe: {payload?.latestRateLimit?.observedAt ? formatDateTime(payload.latestRateLimit.observedAt) : '-'}
              </p>
            </article>
          </div>

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">Historique recent</h2>
            <button
              type="button"
              onClick={() => {
                setHistoryPage(1)
                setErrorsOnly((current) => !current)
              }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                errorsOnly
                  ? 'border-rose-300 bg-rose-100 text-rose-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {errorsOnly ? 'Afficher tout l historique' : 'Voir uniquement les erreurs'}
            </button>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Lignes
              <select
                value={historyPageSize}
                onChange={(event) => {
                  const nextValue = Number(event.target.value) as (typeof HISTORY_PAGE_SIZE_OPTIONS)[number]
                  setHistoryPage(1)
                  setHistoryPageSize(nextValue)
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
              >
                {HISTORY_PAGE_SIZE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Page {payload?.historyPagination.page ?? 1} / {payload?.historyPagination.totalPages ?? 1} •{' '}
            {payload?.historyPagination.total ?? 0} ligne(s) au total
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Astuce: survole ACTEUR pour voir l endpoint et survole STATUT pour le detail erreur.
          </p>
          {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}

          <div className="mt-4 space-y-2 md:hidden">
            {(payload?.history.length ?? 0) === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                Aucune ligne pour ce filtre.
              </p>
            ) : (
              (payload?.history ?? []).map((row) => (
                <article key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <div className="flex items-start justify-between gap-2">
                    <p className="break-all font-semibold text-slate-900">{row.actorLabel}</p>
                    <span
                      title={row.errorMessage ?? 'Aucune erreur'}
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        row.success ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {row.statusCode ?? 'n/a'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(row.startedAt)}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <p>Duree: {row.durationMs ?? '-'} ms</p>
                    <p>Retries: {row.retryCount}</p>
                    <p>Requetes dispo: {row.rateLimitRemaining ?? '-'}</p>
                    <p>
                      Cron:{' '}
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${getCronBadgeMeta(row).className}`}
                      >
                        {getCronBadgeMeta(row).label}
                      </span>
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">Endpoint: {row.method} {row.endpoint}</p>
                </article>
              ))
            )}
          </div>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="min-w-full table-fixed text-left text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="w-[145px] px-2 py-2">Date</th>
                  <th className="w-[90px] px-2 py-2">Statut</th>
                  <th className="w-[85px] px-2 py-2">Duree</th>
                  <th className="w-[75px] px-2 py-2">Retries</th>
                  <th className="w-[110px] px-2 py-2">Dispo API</th>
                  <th className="px-2 py-2">Cron</th>
                </tr>
              </thead>
              <tbody>
                {(payload?.history ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(row.startedAt)}</td>
                    <td className="px-2 py-2">
                      <span
                        title={row.errorMessage ?? 'Aucune erreur'}
                        className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                          row.success ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {row.statusCode ?? 'n/a'}
                      </span>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.durationMs ?? '-'} ms</td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.retryCount}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.rateLimitRemaining ?? '-'}</td>
                    <td
                      title={`${row.method} ${row.endpoint}${row.shard ? ` | Shard: ${row.shard}` : ''}`}
                      className="px-2 py-2 break-words text-slate-700"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${getCronBadgeMeta(row).className}`}
                        >
                          {getCronBadgeMeta(row).label}
                        </span>
                        <span className="text-[11px] text-slate-500">{row.actorLabel}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {(payload?.history.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-slate-500">
                      Aucune ligne pour ce filtre.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="text-slate-500">
              Page {payload?.historyPagination.page ?? 1} sur {payload?.historyPagination.totalPages ?? 1}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={(payload?.historyPagination.page ?? 1) <= 1}
                onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Precedent
              </button>
              <button
                type="button"
                disabled={(payload?.historyPagination.page ?? 1) >= (payload?.historyPagination.totalPages ?? 1)}
                onClick={() =>
                  setHistoryPage((current) =>
                    Math.min(payload?.historyPagination.totalPages ?? 1, current + 1)
                  )
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Suivant
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function getCronBadgeMeta(row: ApiCallRow) {
  const signature = `${row.source} ${row.endpoint}`.toLowerCase()

  if (signature.includes('sync-matches') || signature.includes('daily_sync')) {
    return {
      label: 'Sync Matchs',
      className: 'bg-cyan-100 text-cyan-800',
    }
  }

  if (signature.includes('sync_stats') || signature.includes('stats')) {
    return {
      label: 'Sync Stats',
      className: 'bg-indigo-100 text-indigo-800',
    }
  }

  if (signature.includes('lifetime')) {
    return {
      label: 'Lifetime',
      className: 'bg-violet-100 text-violet-800',
    }
  }

  if (signature.includes('weekly') || signature.includes('monthly') || signature.includes('report')) {
    return {
      label: 'Reports',
      className: 'bg-amber-100 text-amber-800',
    }
  }

  if (signature.includes('challenge')) {
    return {
      label: 'Challenge',
      className: 'bg-pink-100 text-pink-800',
    }
  }

  return {
    label: 'Autre',
    className: 'bg-slate-100 text-slate-700',
  }
}

function getIntensityLevel(value: number, max: number) {
  if (value <= 0 || max <= 0) {
    return 0
  }

  const ratio = value / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

const SUCCESS_LEVEL_CLASSES = [
  'border-slate-200 bg-slate-100',
  'border-emerald-200 bg-emerald-100',
  'border-emerald-300 bg-emerald-200',
  'border-emerald-400 bg-emerald-300',
  'border-emerald-600 bg-emerald-500',
]

const RATE_LIMIT_LEVEL_CLASSES = [
  'border-slate-200 bg-slate-100',
  'border-amber-200 bg-amber-100',
  'border-amber-300 bg-amber-200',
  'border-amber-400 bg-amber-300',
  'border-amber-600 bg-amber-500',
]

const ERROR_LEVEL_CLASSES = [
  'border-slate-200 bg-slate-100',
  'border-rose-200 bg-rose-100',
  'border-rose-300 bg-rose-200',
  'border-rose-400 bg-rose-300',
  'border-rose-600 bg-rose-500',
]

function LegendPill({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded-sm border ${className}`} />
      {label}
    </span>
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
