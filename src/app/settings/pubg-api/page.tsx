'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Gauge,
  Globe,
  History,
  ListOrdered,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Timer,
  Trash2,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react'

import { KpiGrid, type Kpi } from '@/components/matches/MatchesUi'
import AdminPageBanner, { BANNER_GLASS_BUTTON } from '@/components/settings/AdminPageBanner'
import {
  Callout,
  ChoiceMenu,
  ConfirmDialog,
  EmptyState,
  ListSkeleton,
  SectionCard,
  Tag,
  type Tone,
} from '@/components/ui/CharteKit'
import Pagination from '@/components/ui/Pagination'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SortableTh from '@/components/ui/SortableTh'
import { useAuthSession } from '@/hooks/useAuthSession'
import { categorizePubgApiCall, PUBG_API_CALL_CATEGORY_LABELS, type PubgApiCallCategory } from '@/lib/pubg-api-call-category'

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

const HISTORY_PAGE_SIZE_OPTIONS = ['15', '25', '50'] as const
type HistoryPageSize = (typeof HISTORY_PAGE_SIZE_OPTIONS)[number]

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('fr-FR')
}

function formatCount(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString('fr-FR')
}

/**
 * Suivi des appels à l'API PUBG (journée en cours) et réglage de la limite de débit, selon la charte UI
 * (docs/ui/index.html) : bandeau photo, indicateurs, grille d'activité et barres aux couleurs des jetons de jeu,
 * historique en tableau (cartes sous `md`), confirmation de purge dans la page.
 */
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
  const [historyPageSize, setHistoryPageSize] = useState<HistoryPageSize>('15')
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
          pageSize: historyPageSize,
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

      const body = (await response.json().catch(() => null)) as { error?: string; rpm?: number } | null

      if (!response.ok) {
        throw new Error(body?.error ?? 'Impossible de mettre à jour la limite')
      }

      setRpmInput(String(body?.rpm ?? rpm))
      setSaveMessage('Limite de débit mise à jour.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible de mettre à jour la limite')
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

      const body = (await response.json().catch(() => null)) as { error?: string; deletedCount?: number } | null

      if (!response.ok) {
        throw new Error(body?.error ?? 'Purge impossible')
      }

      const deletedCount = body?.deletedCount ?? 0
      setHistoryPage(1)
      setReloadToken((current) => current + 1)
      setHistoryActionMessage(`${formatCount(deletedCount)} ligne(s) supprimée(s) de l’historique.`)
      setPurgeDialogOpen(false)
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : 'Purge impossible')
    } finally {
      setPurgingHistory(false)
    }
  }

  if (loading || (loadingData && !payload)) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col">
        <ListSkeleton rows={4} />
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!isSuperUser) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col">
        <EmptyState
          icon={ShieldAlert}
          title="Accès restreint"
          text={
            <>
              Cette page est réservée au SuperUser.{' '}
              <Link href="/" className="app-link font-semibold">
                Retour à l’accueil
              </Link>
            </>
          }
        />
      </div>
    )
  }

  const totals = payload?.totals
  const kpis: Kpi[] = [
    { label: 'Appels', value: formatCount(totals?.total), detail: 'depuis minuit', icon: Activity, color: 'var(--game-sky)' },
    { label: 'Succès', value: formatCount(totals?.success), detail: 'réponses 2xx', icon: CheckCircle2, color: 'var(--game-pos)' },
    { label: '429', value: formatCount(totals?.rateLimited), detail: 'limite de débit atteinte', icon: AlertTriangle, color: 'var(--game-warn)' },
    { label: 'Erreurs', value: formatCount(totals?.errors), detail: '429 compris', icon: XCircle, color: 'var(--game-neg)' },
    { label: 'Retries', value: formatCount(totals?.retriesTotal), detail: 'nouvelles tentatives', icon: RotateCcw, color: 'var(--theme-ui-text-muted)' },
    {
      label: 'Latence',
      value: totals?.avgDurationMs != null ? `${formatCount(totals.avgDurationMs)} ms` : '—',
      detail: 'durée moyenne d’un appel',
      icon: Timer,
      color: 'var(--game-sky)',
    },
  ]
  const latest = payload?.latestRateLimit ?? null
  const hasHistoryFilter = Boolean(appliedHistoryQuery || appliedHistoryClanId)

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-5">
      <AdminPageBanner
        title="API PUBG"
        subtitle="Appels à l’API PUBG de la journée, erreurs 429, latence et limite de débit."
        icon={Globe}
        image="/cartographie-tactique.jpg"
        currentHref="/settings/pubg-api"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          <>
            <span className="t-num">{payload?.rpm ?? '—'}</span> requêtes / min
          </>,
          'Réservé au SuperUser',
        ]}
        action={
          <button
            type="button"
            onClick={() => setReloadToken((current) => current + 1)}
            disabled={loadingData}
            className={BANNER_GLASS_BUTTON}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualiser
          </button>
        }
      />

      <div
        aria-busy={loadingData}
        className={`flex flex-col gap-5 ${loadingData ? 'pointer-events-none opacity-60 transition-opacity duration-200' : ''}`}
      >
        {error ? (
          <p className="t-body t-neg m-0 flex items-center gap-2" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <KpiGrid items={kpis} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" />

        <SectionCard
          id="pubg-api-activity"
          icon={Activity}
          title="Activité du jour"
          meta="Journée en cours (00:00 – 23:59) par tranches de 30 minutes ; la grille repart à zéro à minuit."
        >
          <div className="flex flex-col gap-1.5 md:hidden">
            <HeatRows series={payload?.series ?? []} perRow={8} max={chartMax} />
          </div>
          <div className="hidden flex-col gap-1.5 md:flex lg:hidden">
            <HeatRows series={payload?.series ?? []} perRow={16} max={chartMax} />
          </div>
          <div className="hidden flex-col gap-1.5 lg:flex">
            <HeatRows series={payload?.series ?? []} perRow={24} max={chartMax} />
          </div>
          <div className="t-meta flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <LegendSwatch tone="pos" label="Appels réussis" />
            <LegendSwatch tone="warn" label="Tranche avec des 429" />
            <LegendSwatch tone="neg" label="Tranche avec des erreurs" />
            <span>Plus la case est soutenue, plus le volume est élevé.</span>
          </div>
        </SectionCard>

        <SectionCard
          id="pubg-api-trend"
          icon={TrendingUp}
          title="Tendance sur 14 jours"
          meta="Appels par jour, hauteur relative au jour le plus chargé de la période."
        >
          <DailyBars points={payload?.dailySeries ?? []} />
        </SectionCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard id="pubg-api-categories" icon={BarChart3} title="Par type d’appel" meta="Aujourd’hui, par ressource PUBG appelée.">
            {(payload?.byCategory.length ?? 0) === 0 ? (
              <EmptyState icon={BarChart3} title="Aucun appel aujourd’hui" />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {(payload?.byCategory ?? []).map((entry) => (
                  <li key={entry.category} className="app-panel-muted flex flex-col gap-1.5 px-3 py-2.5">
                    <BreakdownHead label={entry.label} entry={entry} />
                    <StackedBar entry={entry} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard id="pubg-api-top-errors" icon={XCircle} title="Erreurs les plus fréquentes" meta="Aujourd’hui, messages regroupés.">
            {(payload?.topErrors.length ?? 0) === 0 ? (
              <EmptyState icon={CheckCircle2} title="Aucune erreur aujourd’hui" />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {(() => {
                  const maxCount = Math.max(1, ...(payload?.topErrors ?? []).map((entry) => entry.count))
                  return (payload?.topErrors ?? []).map((entry) => (
                    <li key={entry.message} className="app-panel-muted flex flex-col gap-1.5 px-3 py-2.5">
                      <span className="flex items-start justify-between gap-3">
                        <span className="t-body break-all text-gray-700">{entry.message}</span>
                        <Tag tone="neg">× {formatCount(entry.count)}</Tag>
                      </span>
                      <span className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.round((entry.count / maxCount) * 100)}%`, backgroundColor: 'var(--game-neg)' }}
                        />
                      </span>
                    </li>
                  ))
                })()}
              </ul>
            )}
          </SectionCard>
        </div>

        <SectionCard
          id="pubg-api-clans"
          icon={Users}
          title="Par clan"
          meta="Aujourd’hui. Choisir un clan filtre l’historique ci-dessous ; bordure rouge au-delà de 10 % d’échecs."
        >
          {(payload?.byClan.length ?? 0) === 0 ? (
            <EmptyState icon={Users} title="Aucun appel aujourd’hui" />
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
              {(payload?.byClan ?? []).map((entry) => {
                const problemRatio = entry.count > 0 ? (entry.errors + entry.rateLimited) / entry.count : 0
                const isProblematic = entry.clanId !== null && problemRatio > 0.1
                const selected = entry.clanId !== null && appliedHistoryClanId === String(entry.clanId)
                return (
                  <li key={entry.clanId ?? 'unassigned'} className="flex">
                    <button
                      type="button"
                      disabled={entry.clanId === null}
                      aria-pressed={entry.clanId === null ? undefined : selected}
                      onClick={() => {
                        if (entry.clanId === null) return
                        setHistoryPage(1)
                        setHistoryClanIdInput(String(entry.clanId))
                        setAppliedHistoryClanId(String(entry.clanId))
                      }}
                      title={entry.clanId === null ? 'Appels sans clan rattaché' : 'Filtrer l’historique sur ce clan'}
                      className="app-panel-muted flex w-full flex-col gap-1.5 px-3 py-2.5 text-left transition-colors enabled:hover:bg-gray-100 disabled:cursor-default"
                      style={
                        selected
                          ? { borderColor: 'var(--theme-ui-accent)', backgroundColor: 'var(--theme-ui-accent-tint)' }
                          : isProblematic
                            ? { borderColor: 'color-mix(in srgb, var(--game-neg) 60%, transparent)' }
                            : undefined
                      }
                    >
                      <BreakdownHead
                        label={
                          <span className="inline-flex items-center gap-1.5">
                            {isProblematic ? (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--game-neg)' }} aria-hidden="true" />
                            ) : null}
                            {entry.label}
                          </span>
                        }
                        entry={entry}
                      />
                      <StackedBar entry={entry} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          id="pubg-api-rate-limit"
          icon={Gauge}
          title="Limite de débit"
          meta={
            <>
              Débit configuré : <span className="t-num font-semibold text-gray-900">{payload?.rpm ?? '—'}</span> requêtes / min (entre{' '}
              {payload?.bounds.min ?? '—'} et {payload?.bounds.max ?? '—'}). Référence :{' '}
              <a href="https://documentation.pubg.com/en/rate-limits.html" target="_blank" rel="noreferrer" className="app-link font-semibold">
                limites de l’API PUBG
              </a>
              .
            </>
          }
        >
          <dl className="m-0 grid gap-2.5 sm:grid-cols-3">
            <RateLimitStat label="X-RateLimit-Limit" value={latest?.limit != null ? formatCount(latest.limit) : '—'} />
            <RateLimitStat label="X-RateLimit-Remaining" value={latest?.remaining != null ? formatCount(latest.remaining) : '—'} />
            <RateLimitStat
              label="X-RateLimit-Reset"
              value={latest?.resetAt ? formatDateTime(latest.resetAt) : '—'}
              detail={latest?.observedAt ? `Observé le ${formatDateTime(latest.observedAt)}` : undefined}
              small
            />
          </dl>

          {latest?.limit ? (
            <div className="app-panel-muted flex flex-col gap-1.5 px-3 py-2.5">
              <span className="t-meta flex items-center justify-between gap-2">
                <span>Quota consommé</span>
                <span className="t-num">
                  {formatCount(Math.max(0, latest.limit - (latest.remaining ?? latest.limit)))} / {formatCount(latest.limit)}
                </span>
              </span>
              <span className="h-2 w-full overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${getQuotaConsumedPct(latest.remaining, latest.limit)}%`,
                    backgroundColor: `var(--game-${getQuotaTone(latest.remaining, latest.limit)})`,
                  }}
                />
              </span>
            </div>
          ) : null}

          {latest?.limit != null && payload && payload.rpm > latest.limit ? (
            <Callout tone="warn" icon={AlertTriangle} title="Débit supérieur à la limite PUBG">
              Le débit configuré ({payload.rpm}) dépasse la limite observée côté PUBG ({latest.limit}) : risque accru de 429.
            </Callout>
          ) : null}

          <form className="flex flex-wrap items-end gap-2.5" onSubmit={handleSaveRpm}>
            <label className="flex flex-col gap-1">
              <span className="t-label">Requêtes par minute</span>
              <input
                type="number"
                min={payload?.bounds.min ?? 1}
                max={payload?.bounds.max ?? 300}
                step={1}
                value={rpmInput}
                onChange={(event) => setRpmInput(event.target.value)}
                disabled={!canWriteSettings || savingRpm}
                className="app-input w-32"
              />
            </label>
            <button type="submit" disabled={!canWriteSettings || savingRpm} className="app-btn app-btn--md app-btn--primary">
              {savingRpm ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
          {saveMessage ? (
            <p className="t-body t-pos m-0 flex items-center gap-2" role="status">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {saveMessage}
            </p>
          ) : null}
        </SectionCard>

        <SectionCard
          id="pubg-api-history"
          icon={History}
          title={`Historique des appels (${formatCount(payload?.historyPagination.total)})`}
          meta="Survoler un statut affiche le message d’erreur ; le type d’appel, son point d’accès."
          aside={
            <button
              type="button"
              onClick={() => setPurgeDialogOpen(true)}
              disabled={purgingHistory}
              className="app-btn app-btn--sm app-btn--danger gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {purgingHistory ? 'Purge…' : 'Purger'}
            </button>
          }
        >
          <form className="flex flex-wrap items-end gap-2.5" onSubmit={handleApplyHistoryFilters}>
            <label className="flex w-full flex-col gap-1 sm:w-56">
              <span className="t-label">Point d’accès ou source</span>
              <span className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                <input
                  type="text"
                  value={historyQueryInput}
                  onChange={(event) => setHistoryQueryInput(event.target.value)}
                  placeholder="sync-matches…"
                  className="app-input pl-9"
                />
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="t-label">N° de clan</span>
              <input
                type="number"
                min={1}
                value={historyClanIdInput}
                onChange={(event) => setHistoryClanIdInput(event.target.value)}
                placeholder="1"
                className="app-input w-24"
              />
            </label>
            <button type="submit" className="app-btn app-btn--md app-btn--secondary">
              Filtrer
            </button>
            {hasHistoryFilter ? (
              <button type="button" onClick={handleClearHistoryFilters} className="app-btn app-btn--md app-btn--secondary">
                Effacer les filtres
              </button>
            ) : null}
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <SegmentedControl
              size="sm"
              value={errorsOnly ? 'errors' : 'all'}
              onChange={(value) => {
                setHistoryPage(1)
                setErrorsOnly(value === 'errors')
              }}
              options={[
                { value: 'all', label: 'Tous' },
                { value: 'errors', label: 'Erreurs' },
              ]}
            />
            <div className="w-36">
              <ChoiceMenu<HistoryPageSize>
                label="Lignes par page"
                value={historyPageSize}
                onChange={(value) => {
                  setHistoryPage(1)
                  setHistoryPageSize(value)
                }}
                options={HISTORY_PAGE_SIZE_OPTIONS.map((value) => ({ value, label: `${value} par page` }))}
              />
            </div>
          </div>

          {historyActionMessage ? (
            <p className="t-body t-pos m-0 flex items-center gap-2" role="status">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {historyActionMessage}
            </p>
          ) : null}

          {(payload?.history.length ?? 0) === 0 ? (
            <EmptyState icon={ListOrdered} title="Aucun appel pour ce filtre" />
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
                {(payload?.history ?? []).map((row) => (
                  <li key={row.id} className="app-panel-muted flex flex-col gap-1.5 px-3 py-2.5">
                    <span className="flex items-start justify-between gap-2">
                      <CategoryLabel row={row} />
                      <StatusTag row={row} />
                    </span>
                    <span className="t-meta">
                      {formatDateTime(row.startedAt)} · {row.durationMs != null ? `${formatCount(row.durationMs)} ms` : '—'} · {row.retryCount}{' '}
                      retry · {row.rateLimitRemaining ?? '—'} dispo
                    </span>
                    <span className="t-meta break-all font-mono">
                      {row.method} {row.endpoint}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="app-table-shell hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <SortableTh align="left">Date</SortableTh>
                      <SortableTh align="left">Statut</SortableTh>
                      <SortableTh>Durée</SortableTh>
                      <SortableTh title="Nouvelles tentatives de l’appel">Retries</SortableTh>
                      <SortableTh title="Requêtes encore disponibles selon PUBG (X-RateLimit-Remaining)">Dispo API</SortableTh>
                      <SortableTh align="left">Type</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {(payload?.history ?? []).map((row) => (
                      <tr key={row.id} className="app-table-row align-top">
                        <td className="whitespace-nowrap px-[9px] py-2 text-gray-700">{formatDateTime(row.startedAt)}</td>
                        <td className="px-[9px] py-2">
                          <StatusTag row={row} />
                        </td>
                        <td className="t-num whitespace-nowrap px-[9px] py-2 text-right text-gray-700">
                          {row.durationMs != null ? `${formatCount(row.durationMs)} ms` : '—'}
                        </td>
                        <td className="t-num px-[9px] py-2 text-right text-gray-700">{row.retryCount}</td>
                        <td className="t-num px-[9px] py-2 text-right text-gray-700">{row.rateLimitRemaining ?? '—'}</td>
                        <td className="px-[9px] py-2" title={`${row.method} ${row.endpoint}${row.shard ? ` | Shard : ${row.shard}` : ''}`}>
                          <CategoryLabel row={row} />
                          <span className="t-meta mt-0.5 block break-all font-mono">
                            {row.method} {row.endpoint}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {payload ? (
            <Pagination
              page={payload.historyPagination.page}
              pageCount={payload.historyPagination.totalPages}
              total={payload.historyPagination.total}
              pageSize={payload.historyPagination.pageSize}
              onPageChange={setHistoryPage}
              ariaLabel="Pages de l’historique des appels"
              itemLabel="Appels"
            />
          ) : null}
        </SectionCard>
      </div>

      {purgeDialogOpen ? (
        <ConfirmDialog
          icon={Trash2}
          title="Purger l’historique ?"
          confirmLabel="Purger l’historique"
          tone="danger"
          busy={purgingHistory}
          onCancel={() => setPurgeDialogOpen(false)}
          onConfirm={() => void handlePurgeHistory()}
        >
          Tout l’historique des appels à l’API PUBG sera supprimé définitivement. Les indicateurs du jour repartiront de zéro.
        </ConfirmDialog>
      ) : null}
    </div>
  )
}

/** Ton d'une tranche ou d'un jour : erreur l'emporte sur 429, qui l'emporte sur succès. */
function pointTone(point: { errors: number; rateLimited: number }): 'pos' | 'warn' | 'neg' {
  // `errors` (success === false) inclut déjà les 429 : une tranche n'est « en erreur » que pour d'autres échecs.
  if (point.errors > point.rateLimited) return 'neg'
  if (point.rateLimited > 0) return 'warn'
  return 'pos'
}

function getIntensityLevel(value: number, max: number) {
  if (value <= 0 || max <= 0) return 0
  const ratio = value / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

const INTENSITY_MIX = [0, 28, 48, 70, 100]

function heatCellStyle(point: MinutePoint, max: number): CSSProperties {
  const level = getIntensityLevel(point.total, max)
  if (level === 0) return { backgroundColor: 'var(--theme-ui-surface-strong)', borderColor: 'var(--theme-ui-border)' }
  const tone = pointTone(point)
  return {
    backgroundColor: `color-mix(in srgb, var(--game-${tone}) ${INTENSITY_MIX[level]}%, transparent)`,
    borderColor: `color-mix(in srgb, var(--game-${tone}) ${Math.min(100, INTENSITY_MIX[level] + 25)}%, transparent)`,
  }
}

function slotTitle(point: MinutePoint) {
  const time = new Date(point.minute).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${time} · ${point.total} appel(s) · ${point.errors} erreur(s) · ${point.rateLimited} × 429`
}

/** Grille d'activité découpée en lignes de `perRow` tranches de 30 min, chaque ligne repérée par son heure de début. */
function HeatRows({ series, perRow, max }: { series: MinutePoint[]; perRow: number; max: number }) {
  const rows: MinutePoint[][] = []
  for (let index = 0; index < series.length; index += perRow) rows.push(series.slice(index, index + perRow))
  return (
    <>
      {rows.map((row) => (
        <div key={row[0].minute} className="flex items-center gap-2">
          <span className="t-meta t-num w-10 shrink-0">
            {new Date(row[0].minute).toLocaleTimeString('fr-FR', { hour: '2-digit' }).replace(/\s/g, ' ')}
          </span>
          <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
            {row.map((point) => (
              <span key={point.minute} title={slotTitle(point)} className="aspect-square rounded-[6px] border" style={heatCellStyle(point, max)} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function LegendSwatch({ tone, label }: { tone: 'pos' | 'warn' | 'neg'; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-[4px]" style={{ backgroundColor: `var(--game-${tone})` }} aria-hidden="true" />
      {label}
    </span>
  )
}

function DailyBars({ points }: { points: DayPoint[] }) {
  if (points.length === 0) return <EmptyState icon={TrendingUp} title="Aucun appel sur la période" />
  const max = Math.max(1, ...points.map((item) => item.total))
  return (
    <div className="flex items-end gap-1" style={{ height: 120 }}>
      {points.map((point) => {
        const heightPct = point.total > 0 ? Math.max(6, Math.round((point.total / max) * 100)) : 2
        const date = new Date(point.date)
        return (
          <div key={point.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div
              title={`${date.toLocaleDateString('fr-FR')} · ${point.total} appel(s) · ${point.errors} erreur(s) · ${point.rateLimited} × 429`}
              className="w-full rounded-t-[4px]"
              style={{ height: `${heightPct}%`, backgroundColor: `var(--game-${pointTone(point)})` }}
            />
            <span className="t-meta t-num">{date.toLocaleDateString('fr-FR', { day: '2-digit' })}</span>
          </div>
        )
      })}
    </div>
  )
}

function BreakdownHead({
  label,
  entry,
}: {
  label: React.ReactNode
  entry: { count: number; success: number; errors: number; rateLimited: number; avgDurationMs: number | null }
}) {
  return (
    <>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="t-body font-semibold text-gray-900">{label}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          {entry.errors > 0 ? <Tag tone="neg">{formatCount(entry.errors)} err.</Tag> : null}
          {entry.rateLimited > 0 ? <Tag tone="warn">{formatCount(entry.rateLimited)} × 429</Tag> : null}
          <Tag tone="pos">{formatCount(entry.success)} ok</Tag>
        </span>
      </span>
      <span className="t-meta">
        {formatCount(entry.count)} appel(s) · {entry.avgDurationMs != null ? `${formatCount(entry.avgDurationMs)} ms en moyenne` : 'durée inconnue'}
      </span>
    </>
  )
}

/** Barre empilée succès / 429 / autres erreurs, dont les trois segments totalisent 100 %. */
function StackedBar({ entry }: { entry: { count: number; success: number; errors: number; rateLimited: number } }) {
  // `errors` (success === false) inclut déjà les 429 : on isole les erreurs non-429.
  const otherErrors = Math.max(0, entry.errors - entry.rateLimited)
  const pct = (value: number) => (entry.count > 0 ? (value / entry.count) * 100 : 0)
  return (
    <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
      <span className="h-full" style={{ width: `${pct(entry.success)}%`, backgroundColor: 'var(--game-pos)' }} />
      <span className="h-full" style={{ width: `${pct(entry.rateLimited)}%`, backgroundColor: 'var(--game-warn)' }} />
      <span className="h-full" style={{ width: `${pct(otherErrors)}%`, backgroundColor: 'var(--game-neg)' }} />
    </span>
  )
}

function RateLimitStat({ label, value, detail, small = false }: { label: string; value: string; detail?: string; small?: boolean }) {
  return (
    <div className="app-panel-muted flex flex-col gap-1 px-3 py-2.5">
      <dt className="t-label">{label}</dt>
      <dd className={`m-0 text-gray-900 ${small ? 't-body t-num font-semibold' : 't-hero t-hero--sm'}`}>{value}</dd>
      {detail ? <dd className="t-meta m-0">{detail}</dd> : null}
    </div>
  )
}

function statusTone(row: ApiCallRow): Tone {
  if (row.statusCode === 429) return 'warn'
  return row.success ? 'pos' : 'neg'
}

function StatusTag({ row }: { row: ApiCallRow }) {
  return (
    <span title={row.errorMessage ?? 'Aucune erreur'}>
      <Tag tone={statusTone(row)}>{row.statusCode ?? 'n/a'}</Tag>
    </span>
  )
}

function CategoryLabel({ row }: { row: ApiCallRow }) {
  const category = categorizePubgApiCall(row.source, row.endpoint)
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Tag tone="neutral">{PUBG_API_CALL_CATEGORY_LABELS[category]}</Tag>
      <span className="t-meta">{row.actorLabel}</span>
    </span>
  )
}

function getQuotaConsumedPct(remaining: number | null, limit: number) {
  if (limit <= 0) return 0
  const consumed = Math.max(0, limit - (remaining ?? limit))
  return Math.min(100, Math.round((consumed / limit) * 100))
}

function getQuotaTone(remaining: number | null, limit: number): 'pos' | 'warn' | 'neg' {
  const pct = getQuotaConsumedPct(remaining, limit)
  if (pct >= 90) return 'neg'
  if (pct >= 70) return 'warn'
  return 'pos'
}
