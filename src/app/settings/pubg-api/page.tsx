'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  type LucideIcon,
  RefreshCw,
  RotateCcw,
  Timer,
  Trash2,
  XCircle,
} from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SegmentedControl from '@/components/ui/SegmentedControl'
import {
  categorizePubgApiCall,
  PUBG_API_CALL_CATEGORY_LABELS,
  type PubgApiCallCategory,
} from '@/lib/pubg-api-call-category'

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

type DayPoint = {
  date: string
  total: number
  success: number
  rateLimited: number
  errors: number
}

type CategoryStat = {
  category: PubgApiCallCategory
  label: string
  count: number
  success: number
  errors: number
  rateLimited: number
  avgDurationMs: number | null
}

type TopError = {
  message: string
  count: number
}

type ClanStat = {
  clanId: number | null
  label: string
  count: number
  success: number
  errors: number
  rateLimited: number
  avgDurationMs: number | null
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
    retriesTotal: number
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
    query: string | null
    clanId: number | null
  }
  series: MinutePoint[]
  dailySeries: DayPoint[]
  byCategory: CategoryStat[]
  byClan: ClanStat[]
  topErrors: TopError[]
  history: ApiCallRow[]
}

const HISTORY_PAGE_SIZE_OPTIONS = [15, 25, 50] as const

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('fr-FR')
}

export default function PubgApiSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [reloadToken, setReloadToken] = useState(0)
  const [payload, setPayload] = useState<CallsPayload | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')

  const [rpmInput, setRpmInput] = useState('')
  const [savingRpm, setSavingRpm] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [purgingHistory, setPurgingHistory] = useState(false)
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false)
  const [historyActionMessage, setHistoryActionMessage] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState<(typeof HISTORY_PAGE_SIZE_OPTIONS)[number]>(15)
  const [historyQueryInput, setHistoryQueryInput] = useState('')
  const [historyClanIdInput, setHistoryClanIdInput] = useState('')
  const [appliedHistoryQuery, setAppliedHistoryQuery] = useState('')
  const [appliedHistoryClanId, setAppliedHistoryClanId] = useState('')

  const canWriteSettings = isSuperUser

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/pubg-api')
    }
  }, [authenticated, loading, router])

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) {
      return
    }

    let cancelled = false

    async function load() {
      try {
        setLoadingData(true)
        setError('')

        const searchParams = new URLSearchParams({
          page: String(historyPage),
          pageSize: String(historyPageSize),
          errorsOnly: errorsOnly ? '1' : '0',
        })
        if (appliedHistoryQuery) searchParams.set('q', appliedHistoryQuery)
        if (appliedHistoryClanId) searchParams.set('clanId', appliedHistoryClanId)

        const response = await fetch(`/api/settings/pubg-api-calls?${searchParams.toString()}`, {
          cache: 'no-store',
        })

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
  }, [
    authenticated,
    errorsOnly,
    historyPage,
    historyPageSize,
    isSuperUser,
    loading,
    reloadToken,
    appliedHistoryQuery,
    appliedHistoryClanId,
  ])

  function handleApplyHistoryFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHistoryPage(1)
    setAppliedHistoryQuery(historyQueryInput.trim())
    setAppliedHistoryClanId(historyClanIdInput.trim())
  }

  function handleClearHistoryFilters() {
    setHistoryQueryInput('')
    setHistoryClanIdInput('')
    setAppliedHistoryQuery('')
    setAppliedHistoryClanId('')
    setHistoryPage(1)
  }

  const chartMax = useMemo(() => {
    const values = payload?.series.map((item) => item.total) ?? []
    const max = Math.max(0, ...values)
    return max > 0 ? max : 1
  }, [payload?.series])

  async function handleSaveRpm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isSuperUser) {
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

  async function handlePurgeHistory() {
    if (!isSuperUser || purgingHistory) {
      return
    }

    try {
      setPurgingHistory(true)
      setError('')
      setHistoryActionMessage('')

      const response = await fetch('/api/settings/pubg-api-calls', {
        method: 'DELETE',
      })

      const body = (await response.json().catch(() => null)) as
        | { error?: string; deletedCount?: number }
        | null

      if (!response.ok) {
        throw new Error(body?.error ?? 'Purge impossible')
      }

      const deletedCount = body?.deletedCount ?? 0
      setHistoryPage(1)
      setReloadToken((current) => current + 1)
      setHistoryActionMessage(`${deletedCount} ligne(s) supprimee(s) de l historique.`)
      setPurgeDialogOpen(false)
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : 'Purge impossible')
    } finally {
      setPurgingHistory(false)
    }
  }

  if (loading || loadingData) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-600">Chargement du monitoring PUBG API...</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!isSuperUser) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Monitoring PUBG API"
        currentHref="/settings/pubg-api"
        fallbackParent={{ href: '/settings/owner', label: 'Propri�taire' }}
      />
        <section className="app-panel p-6">
          <h1 className="text-xl font-bold text-amber-900">Acces restreint</h1>
          <p className="mt-2 text-sm text-amber-800">
            Cette page est reservee au SuperUser.
          </p>
          <Link
            href="/"
            className="mt-5 app-btn app-btn--md app-btn--secondary"
          >
            Retour a l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Monitoring PUBG API"
        currentHref="/settings/pubg-api"
        fallbackParent={{ href: '/settings/owner', label: 'Propri�taire' }}
      />
      <section className="app-panel mb-4 p-4">
        <SettingsPageHeader
          title="Monitoring PUBG API"
          subtitle="Suivi en temps réel des appels API, des erreurs 429 et de la latence moyenne."
        />
      </section>
      <section className="app-panel p-6 sm:p-8">

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard icon={Activity} label="Appels fenetre" value={String(payload?.totals.total ?? 0)} />
          <MetricCard
            icon={CheckCircle2}
            label="Succes"
            value={String(payload?.totals.success ?? 0)}
            tone="emerald"
          />
          <MetricCard
            icon={AlertTriangle}
            label="429"
            value={String(payload?.totals.rateLimited ?? 0)}
            tone="amber"
          />
          <MetricCard icon={XCircle} label="Erreurs" value={String(payload?.totals.errors ?? 0)} tone="rose" />
          <MetricCard icon={RotateCcw} label="Retries" value={String(payload?.totals.retriesTotal ?? 0)} />
          <MetricCard
            icon={Timer}
            label="Latence moyenne"
            value={payload?.totals.avgDurationMs != null ? `${payload.totals.avgDurationMs} ms` : '-'}
          />
        </div>

        <div className="app-panel-muted mt-8 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Activite du jour</h2>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Aujourd&apos;hui (24 h)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReloadToken((current) => current + 1)}
              className="app-btn app-btn--sm app-btn--secondary gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Actualiser
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Vue de la journee en cours (00:00-23:59), en tranches de 30 minutes. A minuit, la grille repart a zero.
          </p>

          <div className="mt-6">
            <div className="app-panel-muted space-y-2 p-3">
              <div className="hidden items-stretch gap-3 md:flex lg:hidden">
                <div className="grid w-16 shrink-0 self-stretch grid-rows-3 gap-1 text-[10px] font-semibold text-slate-500">
                  <span className="flex h-full items-center rounded-md border border-slate-700/40 px-2">00h-08h</span>
                  <span className="flex h-full items-center rounded-md border border-slate-700/40 px-2">08h-16h</span>
                  <span className="flex h-full items-center rounded-md border border-slate-700/40 px-2">16h-24h</span>
                </div>

                <div
                  className="grid flex-1 gap-1"
                  style={{
                    gridTemplateColumns: 'repeat(16, minmax(0, 1fr))',
                  }}
                >
                  {(payload?.series ?? []).map((point) => {
                    const level = getIntensityLevel(point.total, chartMax)
                    const hasError = point.errors > 0
                    const hasRateLimit = point.rateLimited > 0
                    const status = hasError ? 'error' : hasRateLimit ? 'rateLimit' : 'normal'
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
                        className={`group relative aspect-square rounded-md border transition-transform duration-150 hover:z-10 hover:scale-110 ${cellTone}`}
                      >
                        {status === 'error' ? (
                          <span className="absolute -right-1 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-rose-300 bg-rose-600 px-0.5 text-[8px] font-bold leading-none text-white shadow-sm">
                            !
                          </span>
                        ) : status === 'rateLimit' ? (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-amber-200 bg-amber-400 shadow-sm" />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="hidden items-stretch gap-3 lg:flex">
                <div className="grid w-16 shrink-0 self-stretch grid-rows-2 gap-1 text-[10px] font-semibold text-slate-500">
                  <span className="flex h-full items-center rounded-md border border-slate-700/40 px-2">00h-12h</span>
                  <span className="flex h-full items-center rounded-md border border-slate-700/40 px-2">12h-24h</span>
                </div>

                <div
                  className="grid flex-1 gap-1"
                  style={{
                    gridTemplateColumns: 'repeat(24, minmax(0, 1fr))',
                  }}
                >
                  {(payload?.series ?? []).map((point) => {
                    const level = getIntensityLevel(point.total, chartMax)
                    const hasError = point.errors > 0
                    const hasRateLimit = point.rateLimited > 0
                    const status = hasError ? 'error' : hasRateLimit ? 'rateLimit' : 'normal'
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
                        className={`group relative aspect-square rounded-md border transition-transform duration-150 hover:z-10 hover:scale-110 ${cellTone}`}
                      >
                        {status === 'error' ? (
                          <span className="absolute -right-1 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-rose-300 bg-rose-600 px-0.5 text-[8px] font-bold leading-none text-white shadow-sm">
                            !
                          </span>
                        ) : status === 'rateLimit' ? (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-amber-200 bg-amber-400 shadow-sm" />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2 md:hidden">
                <div className="grid grid-cols-8 gap-1 sm:grid-cols-12">
                  {(payload?.series ?? []).map((point) => {
                    const level = getIntensityLevel(point.total, chartMax)
                    const hasError = point.errors > 0
                    const hasRateLimit = point.rateLimited > 0
                    const status = hasError ? 'error' : hasRateLimit ? 'rateLimit' : 'normal'
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
                        {status === 'error' ? (
                          <span className="absolute -right-1 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-rose-300 bg-rose-600 px-0.5 text-[8px] font-bold leading-none text-white shadow-sm">
                            !
                          </span>
                        ) : status === 'rateLimit' ? (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-amber-200 bg-amber-400 shadow-sm" />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                <p className="text-[11px] text-slate-500">Mobile: 8 colonnes (12 colonnes sur grands telephones).</p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                <LegendPill label="Normal" className="border-emerald-200 bg-emerald-200" />
                <LegendPill label="429" className="border-amber-200 bg-amber-200" />
                <LegendPill label="Erreur" className="border-rose-200 bg-rose-200" />
                <span className="text-slate-500">Pastille ambre: 429 • Badge rouge: erreur</span>
                <span className="text-slate-500">Plus la couleur est soutenue, plus le volume est eleve.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="app-panel-muted mt-8 p-5">
          <h2 className="text-sm font-bold text-slate-900">Tendance 14 jours</h2>
          <p className="mt-1 text-xs text-slate-500">
            Volume d&apos;appels par jour, hauteur proportionnelle au maximum de la periode.
          </p>
          <div className="mt-4 flex items-end gap-1" style={{ height: 96 }}>
            {(payload?.dailySeries ?? []).map((point) => {
              const max = Math.max(1, ...(payload?.dailySeries ?? []).map((item) => item.total))
              const heightPct = point.total > 0 ? Math.max(6, Math.round((point.total / max) * 100)) : 2
              const hasError = point.errors > 0
              const hasRateLimit = point.rateLimited > 0
              const barTone = hasError
                ? 'bg-rose-500'
                : hasRateLimit
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'

              return (
                <div key={point.date} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <div
                    title={`${new Date(point.date).toLocaleDateString('fr-FR')} • ${point.total} appels • ${point.errors} erreurs • ${point.rateLimited} x 429`}
                    className={`w-full rounded-t ${barTone}`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[9px] text-slate-500">
                    {new Date(point.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <div className="app-panel p-5">
            <h2 className="text-sm font-bold text-slate-900">Repartition par type d&apos;appel</h2>
            <p className="mt-1 text-xs text-slate-500">
              Aujourd&apos;hui (24 h), par ressource PUBG appelee (joueur, clan, saison, arme, match).
            </p>
            <div className="mt-3 space-y-2">
              {(payload?.byCategory.length ?? 0) === 0 ? (
                <p className="app-panel-muted p-3 text-xs text-slate-600">Aucun appel aujourd&apos;hui.</p>
              ) : (
                (payload?.byCategory ?? []).map((entry) => {
                  // `errors` (success === false) inclut deja les 429 : on isole les erreurs
                  // non-429 pour que les trois segments totalisent bien 100 %.
                  const otherErrors = Math.max(0, entry.errors - entry.rateLimited)
                  const successPct = entry.count > 0 ? (entry.success / entry.count) * 100 : 0
                  const rateLimitedPct = entry.count > 0 ? (entry.rateLimited / entry.count) * 100 : 0
                  const errorPct = entry.count > 0 ? (otherErrors / entry.count) * 100 : 0

                  return (
                    <div key={entry.category} className="app-panel-muted p-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-900">{entry.label}</p>
                        <div className="flex items-center gap-1.5">
                          {entry.errors > 0 ? (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">
                              {entry.errors} err.
                            </span>
                          ) : null}
                          {entry.rateLimited > 0 ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                              {entry.rateLimited} x 429
                            </span>
                          ) : null}
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                            {entry.success} ok
                          </span>
                        </div>
                      </div>
                      <p className="mt-0.5 text-slate-500">
                        {entry.count} appel(s) • {entry.avgDurationMs ?? '-'} ms moy.
                      </p>
                      <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full bg-emerald-400" style={{ width: `${successPct}%` }} />
                        <div className="h-full bg-amber-400" style={{ width: `${rateLimitedPct}%` }} />
                        <div className="h-full bg-rose-500" style={{ width: `${errorPct}%` }} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="app-panel p-5">
            <h2 className="text-sm font-bold text-slate-900">Top erreurs</h2>
            <p className="mt-1 text-xs text-slate-500">Aujourd&apos;hui (24 h), messages regroupes par occurrence.</p>
            <div className="mt-3 space-y-2">
              {(payload?.topErrors.length ?? 0) === 0 ? (
                <p className="app-panel-muted p-3 text-xs text-slate-600">Aucune erreur aujourd&apos;hui.</p>
              ) : (
                (() => {
                  const maxCount = Math.max(1, ...(payload?.topErrors ?? []).map((entry) => entry.count))
                  return (payload?.topErrors ?? []).map((entry) => (
                    <div key={entry.message} className="app-panel-muted p-3 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <p className="break-all text-slate-700">{entry.message}</p>
                        <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">
                          x{entry.count}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-rose-500"
                          style={{ width: `${Math.round((entry.count / maxCount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                })()
              )}
            </div>
          </div>
        </div>

        <div className="app-panel mt-8 p-5">
          <h2 className="text-sm font-bold text-slate-900">Repartition par clan</h2>
          <p className="mt-1 text-xs text-slate-500">
            Aujourd&apos;hui (24 h) — clique sur un clan pour filtrer l&apos;historique ci-dessous.
          </p>
          <div className="mt-3 space-y-2">
            {(payload?.byClan.length ?? 0) === 0 ? (
              <p className="app-panel-muted p-3 text-xs text-slate-600">Aucun appel aujourd&apos;hui.</p>
            ) : (
              (payload?.byClan ?? []).map((entry) => {
                const otherErrors = Math.max(0, entry.errors - entry.rateLimited)
                const successPct = entry.count > 0 ? (entry.success / entry.count) * 100 : 0
                const rateLimitedPct = entry.count > 0 ? (entry.rateLimited / entry.count) * 100 : 0
                const errorPct = entry.count > 0 ? (otherErrors / entry.count) * 100 : 0
                const problemRatio = entry.count > 0 ? (entry.errors + entry.rateLimited) / entry.count : 0
                const isProblematic = entry.clanId !== null && problemRatio > 0.1

                return (
                  <button
                    key={entry.clanId ?? 'unassigned'}
                    type="button"
                    disabled={entry.clanId === null}
                    onClick={() => {
                      if (entry.clanId === null) return
                      setHistoryPage(1)
                      setHistoryClanIdInput(String(entry.clanId))
                      setAppliedHistoryClanId(String(entry.clanId))
                    }}
                    className={`app-panel-muted block w-full p-3 text-left text-xs transition-colors ${
                      entry.clanId === null ? 'cursor-default' : 'cursor-pointer hover:bg-gray-100'
                    } ${isProblematic ? 'border border-rose-300' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                        {isProblematic ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden />
                        ) : null}
                        {entry.label}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {entry.errors > 0 ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">
                            {entry.errors} err.
                          </span>
                        ) : null}
                        {entry.rateLimited > 0 ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                            {entry.rateLimited} x 429
                          </span>
                        ) : null}
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                          {entry.success} ok
                        </span>
                      </div>
                    </div>
                    <p className="mt-0.5 text-slate-500">
                      {entry.count} appel(s) • {entry.avgDurationMs ?? '-'} ms moy.
                    </p>
                    <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full bg-emerald-400" style={{ width: `${successPct}%` }} />
                      <div className="h-full bg-amber-400" style={{ width: `${rateLimitedPct}%` }} />
                      <div className="h-full bg-rose-500" style={{ width: `${errorPct}%` }} />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="app-panel mt-8 p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Gauge className="h-4 w-4 text-slate-500" aria-hidden />
            Configuration du rate limit
          </h2>
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
            <article className="app-panel-muted p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">X-RateLimit-Limit</p>
              <p className="mt-1 text-lg font-black text-slate-900">{payload?.latestRateLimit?.limit ?? '-'}</p>
            </article>
            <article className="app-panel-muted p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">X-RateLimit-Remaining</p>
              <p className="mt-1 text-lg font-black text-slate-900">{payload?.latestRateLimit?.remaining ?? '-'}</p>
            </article>
            <article className="app-panel-muted p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">X-RateLimit-Reset</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {payload?.latestRateLimit?.resetAt ? formatDateTime(payload.latestRateLimit.resetAt) : '-'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Observe: {payload?.latestRateLimit?.observedAt ? formatDateTime(payload.latestRateLimit.observedAt) : '-'}
              </p>
            </article>
          </div>

          {payload?.latestRateLimit?.limit ? (
            <div className="mt-3 app-panel-muted p-3">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Quota consomme</span>
                <span>
                  {Math.max(0, payload.latestRateLimit.limit - (payload.latestRateLimit.remaining ?? payload.latestRateLimit.limit))}{' '}
                  / {payload.latestRateLimit.limit}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${getQuotaGaugeTone(payload.latestRateLimit.remaining, payload.latestRateLimit.limit)}`}
                  style={{
                    width: `${getQuotaConsumedPct(payload.latestRateLimit.remaining, payload.latestRateLimit.limit)}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {payload?.latestRateLimit?.limit != null && payload.rpm > payload.latestRateLimit.limit ? (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Le RPM configure ({payload.rpm}) depasse la limite observee cote PUBG ({payload.latestRateLimit.limit}
              ) — risque accru de 429.
            </p>
          ) : null}

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
              className="app-btn app-btn--md app-btn--secondary"
            >
              {savingRpm ? 'Enregistrement...' : 'Mettre a jour'}
            </button>
          </form>

          {saveMessage ? <p className="mt-3 text-sm text-emerald-700">{saveMessage}</p> : null}
        </div>

        <div className="app-panel mt-8 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">Historique recent</h2>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                size="sm"
                value={errorsOnly ? 'errors' : 'all'}
                onChange={(value) => {
                  setHistoryPage(1)
                  setErrorsOnly(value === 'errors')
                }}
                options={[
                  { value: 'all', label: 'Tout' },
                  { value: 'errors', label: 'Erreurs' },
                ]}
              />
              <SegmentedControl
                size="sm"
                value={String(historyPageSize)}
                onChange={(value) => {
                  setHistoryPage(1)
                  setHistoryPageSize(Number(value) as (typeof HISTORY_PAGE_SIZE_OPTIONS)[number])
                }}
                options={HISTORY_PAGE_SIZE_OPTIONS.map((value) => ({
                  value: String(value),
                  label: String(value),
                }))}
              />
              <button
                type="button"
                onClick={() => {
                  setPurgeDialogOpen(true)
                }}
                disabled={purgingHistory}
                className="app-btn app-btn--sm app-btn--danger gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {purgingHistory ? 'Purge...' : 'Purger'}
              </button>
            </div>
          </div>
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={handleApplyHistoryFilters}
          >
            <label className="text-xs font-medium text-slate-700">
              Endpoint / source
              <input
                type="text"
                value={historyQueryInput}
                onChange={(event) => setHistoryQueryInput(event.target.value)}
                placeholder="ex: sync-matches"
                className="mt-1 block w-48 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Clan ID
              <input
                type="number"
                min={1}
                value={historyClanIdInput}
                onChange={(event) => setHistoryClanIdInput(event.target.value)}
                placeholder="ex: 1"
                className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
            </label>
            <button type="submit" className="app-btn app-btn--sm app-btn--secondary">
              Filtrer
            </button>
            {appliedHistoryQuery || appliedHistoryClanId ? (
              <button
                type="button"
                onClick={handleClearHistoryFilters}
                className="app-btn app-btn--sm app-btn--secondary"
              >
                Effacer les filtres
              </button>
            ) : null}
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Page {payload?.historyPagination.page ?? 1} / {payload?.historyPagination.totalPages ?? 1} •{' '}
            {payload?.historyPagination.total ?? 0} ligne(s) au total
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Astuce: survole ACTEUR pour voir l endpoint et survole STATUT pour le detail erreur.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
            <LegendPill label="2xx: succes" className="border-emerald-200 bg-emerald-100" />
            <LegendPill label="429: limite de debit atteinte" className="border-amber-200 bg-amber-100" />
            <LegendPill label="4xx/5xx/n-a: erreur" className="border-rose-200 bg-rose-100" />
          </div>
          {historyActionMessage ? <p className="mt-1 text-xs text-emerald-700">{historyActionMessage}</p> : null}
          {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}

          <div className="mt-4 space-y-2 md:hidden">
            {(payload?.history.length ?? 0) === 0 ? (
              <p className="app-panel-muted p-3 text-xs text-slate-600">
                Aucune ligne pour ce filtre.
              </p>
            ) : (
              (payload?.history ?? []).map((row) => (
                <article key={row.id} className="app-panel-muted p-3 text-xs text-slate-700">
                  <div className="flex items-start justify-between gap-2">
                    <p className="break-all font-semibold text-slate-900">{row.actorLabel}</p>
                    <span
                      title={row.errorMessage ?? 'Aucune erreur'}
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getApiStatusBadgeClass(row)}`}
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
                      Type:{' '}
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${getCategoryBadgeMeta(row).className}`}
                      >
                        {getCategoryBadgeMeta(row).label}
                      </span>
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">Endpoint: {row.method} {row.endpoint}</p>
                </article>
              ))
            )}
          </div>

          <div className="app-table-shell mt-4 hidden overflow-x-auto md:block">
            <table className="min-w-full table-fixed text-left text-xs text-slate-700">
              <thead>
                <tr className="app-table-head text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="w-[145px] px-2 py-2">Date</th>
                  <th className="w-[90px] px-2 py-2">Statut</th>
                  <th className="w-[85px] px-2 py-2">Duree</th>
                  <th className="w-[75px] px-2 py-2">Retries</th>
                  <th className="w-[110px] px-2 py-2">Dispo API</th>
                  <th className="px-2 py-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {(payload?.history ?? []).map((row) => (
                  <tr key={row.id} className="app-table-row align-top">
                    <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(row.startedAt)}</td>
                    <td className="px-2 py-2">
                      <span
                        title={row.errorMessage ?? 'Aucune erreur'}
                        className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${getApiStatusBadgeClass(row)}`}
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
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${getCategoryBadgeMeta(row).className}`}
                        >
                          {getCategoryBadgeMeta(row).label}
                        </span>
                        <span className="text-[11px] text-slate-500">{row.actorLabel}</span>
                      </div>
                      <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                        {row.method} {row.endpoint}
                      </p>
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
                className="app-btn app-btn--sm app-btn--secondary"
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
                className="app-btn app-btn--sm app-btn--secondary"
              >
                Suivant
              </button>
            </div>
          </div>
        </div>

        {purgeDialogOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="purge-history-title"
          >
            <div className="app-panel w-full max-w-md p-5">
              <h3 id="purge-history-title" className="text-base font-bold text-slate-900">
                Confirmer la purge
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Cette action supprimera definitivement tout l historique PUBG API. Elle est irreversible.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPurgeDialogOpen(false)}
                  disabled={purgingHistory}
                  className="app-btn app-btn--md app-btn--secondary"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handlePurgeHistory()
                  }}
                  disabled={purgingHistory}
                  className="app-btn app-btn--md app-btn--danger-solid"
                >
                  {purgingHistory ? 'Suppression...' : 'Confirmer la purge'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}

const CATEGORY_BADGE_CLASSES: Record<PubgApiCallCategory, string> = {
  player_search: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  player_detail: 'border-sky-200 bg-sky-50 text-sky-800',
  weapon_mastery: 'border-orange-200 bg-orange-50 text-orange-800',
  season_lifetime: 'border-violet-200 bg-violet-50 text-violet-800',
  season_ranked: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800',
  season_normal: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  seasons_list: 'border-teal-200 bg-teal-50 text-teal-800',
  clan_members: 'border-lime-200 bg-lime-50 text-lime-800',
  clan_lookup: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  match_detail: 'border-amber-200 bg-amber-50 text-amber-800',
  other: 'border-slate-200 bg-slate-50 text-slate-700',
}

function getCategoryBadgeMeta(row: ApiCallRow) {
  const category = categorizePubgApiCall(row.source, row.endpoint)
  return {
    label: PUBG_API_CALL_CATEGORY_LABELS[category],
    className: CATEGORY_BADGE_CLASSES[category],
  }
}

function getApiStatusBadgeClass(row: ApiCallRow) {
  if (row.statusCode === 429) {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }

  if (row.success) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }

  return 'border-rose-200 bg-rose-50 text-rose-800'
}

function getQuotaConsumedPct(remaining: number | null, limit: number) {
  if (limit <= 0) return 0
  const consumed = Math.max(0, limit - (remaining ?? limit))
  return Math.min(100, Math.round((consumed / limit) * 100))
}

function getQuotaGaugeTone(remaining: number | null, limit: number) {
  const pct = getQuotaConsumedPct(remaining, limit)
  if (pct >= 90) return 'bg-rose-500'
  if (pct >= 70) return 'bg-amber-400'
  return 'bg-emerald-400'
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
  icon: Icon,
  label,
  value,
  tone = 'slate',
}: {
  icon: LucideIcon
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
    <article className={`app-panel-muted p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide opacity-70">{label}</p>
        <Icon className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      </div>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </article>
  )
}
