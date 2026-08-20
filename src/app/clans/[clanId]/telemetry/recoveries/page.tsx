'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Database,
  FileJson,
  Gauge,
  HardDrive,
  HardDriveDownload,
  History,
  type LucideIcon,
  RefreshCw,
  Server,
  Timer,
  TrendingUp,
  Wrench,
  XCircle,
} from 'lucide-react'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'
import FilterDropdown from '@/components/ui/FilterDropdown'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { resolveGameMode } from '@/lib/pubg-assets'
import { isTelemetryDataExpiredError } from '@/lib/pubg-telemetry/telemetry-error-presentation'

const HISTORY_PAGE_SIZE_OPTIONS = [10, 15, 25] as const

type TelemetryRecoveryRow = {
  id: string
  squadMatchId: string
  pubgMatchId: string
  gameMode: string
  mapName: string
  placement: number
  squadCreatedAt: string
  status: 'success' | 'failed' | 'pending'
  parserVersion: string
  parsedAt: string
  sourceGeneratedAt: string | null
  contentLength: number | null
  bytesDownloaded: number | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  hasParsedPayload: boolean
}

type TelemetryRecoveriesPayload = {
  ok: boolean
  clanId: number
  limit: number
  summary: {
    total: number
    success: number
    failed: number
    expired: number
    pending: number
    withParsedPayload: number
  }
  rows: TelemetryRecoveryRow[]
}

type SortKey = 'updatedAt' | 'status' | 'bytesDownloaded'
type SortDirection = 'asc' | 'desc'
type KpiWindow = '24h' | '7d' | '30d' | 'all'

const WINDOW_OPTIONS: Array<{ value: KpiWindow; label: string }> = [
  { value: '24h', label: '24 heures' },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: 'all', label: 'Tout' },
]

// One row per telemetry_live_sync job (one match), not per daily_sync batch —
// see docs/TODO/TODO-settings-cron-refonte.md ("Dashboard observability").
type TelemetryObservabilitySeriesRow = {
  id: string
  squadMatchId: string | null
  pubgMatchId: string | null
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  status: 'success' | 'failed'
  expired: boolean
  errorCode: string | null
  errorMessage: string | null
  bytesDownloaded: number
}

type TelemetryObservabilitySummary = {
  runs: number
  success: number
  failed: number
  expired: number
  bytesDownloaded: number
}

type TelemetryObservabilityHealth = {
  ratedRuns: number
  successRate: number
  failedRate: number
  thresholds: {
    failedRateMax: number
    durationP95MaxMs: number
  }
  alerts: Array<{
    key: string
    label: string
    value: number
    threshold: number
    status: 'ok' | 'warning'
  }>
}

type TelemetryObservabilityPayload = {
  ok: boolean
  data?: {
    summary?: TelemetryObservabilitySummary
    health?: TelemetryObservabilityHealth
    latency?: { p95DurationMs: number }
    series?: TelemetryObservabilitySeriesRow[]
  }
  summary?: TelemetryObservabilitySummary
  health?: TelemetryObservabilityHealth
  latency?: { p95DurationMs: number }
  series?: TelemetryObservabilitySeriesRow[]
  error?: { message?: string }
}

type NormalizedTelemetryObservability = {
  summary: TelemetryObservabilitySummary
  health: TelemetryObservabilityHealth
  latency: { p95DurationMs: number }
  series: TelemetryObservabilitySeriesRow[]
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) {
    return '-'
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} Mo`
  }

  if (value >= 1024) {
    return `${Math.round(value / 1024)} Ko`
  }

  return `${value} o`
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '-'
  }

  return `${value.toFixed(1)} %`
}

function formatDurationMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return '-'
  }

  if (value >= 60) {
    const hours = Math.floor(value / 60)
    const minutes = Math.round(value % 60)
    return `${hours}h ${minutes}m`
  }

  return `${Math.round(value)} min`
}

function formatMilliseconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '-'
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`
  }

  return `${(value / 1000).toFixed(2)} s`
}

function median(values: number[]) {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }

  return sorted[middle]
}

function statusSortWeight(status: TelemetryRecoveryRow['status']) {
  if (status === 'failed') {
    return 0
  }

  if (status === 'pending') {
    return 1
  }

  return 2
}

function compareByKey(left: TelemetryRecoveryRow, right: TelemetryRecoveryRow, key: SortKey) {
  if (key === 'updatedAt') {
    const leftValue = new Date(left.updatedAt).getTime()
    const rightValue = new Date(right.updatedAt).getTime()
    return leftValue - rightValue
  }

  if (key === 'status') {
    return statusSortWeight(left.status) - statusSortWeight(right.status)
  }

  const leftValue = left.bytesDownloaded ?? -1
  const rightValue = right.bytesDownloaded ?? -1
  return leftValue - rightValue
}

function applySort(
  rows: TelemetryRecoveryRow[],
  primaryKey: SortKey,
  primaryDirection: SortDirection,
  secondaryKey: SortKey | 'none',
  secondaryDirection: SortDirection
) {
  const primaryFactor = primaryDirection === 'asc' ? 1 : -1
  const secondaryFactor = secondaryDirection === 'asc' ? 1 : -1

  return [...rows].sort((left, right) => {
    const primaryCompare = compareByKey(left, right, primaryKey) * primaryFactor
    if (primaryCompare !== 0) {
      return primaryCompare
    }

    if (secondaryKey !== 'none') {
      const secondaryCompare = compareByKey(left, right, secondaryKey) * secondaryFactor
      if (secondaryCompare !== 0) {
        return secondaryCompare
      }
    }

    return left.pubgMatchId.localeCompare(right.pubgMatchId)
  })
}

function extractDateSegment(value: string) {
  const candidate = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null
}

function statusClass(status: 'success' | 'failed' | 'pending') {
  if (status === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }

  if (status === 'failed') {
    return 'border-rose-200 bg-rose-50 text-rose-800'
  }

  return 'border-amber-200 bg-amber-50 text-amber-800'
}

function healthAlertClass(status: 'ok' | 'warning') {
  if (status === 'ok') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }

  return 'border-amber-200 bg-amber-50 text-amber-800'
}

function extractObservabilityError(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const typed = payload as { error?: unknown }
  if (!typed.error || typeof typed.error !== 'object') {
    return null
  }

  const errorMessage = (typed.error as { message?: unknown }).message
  return typeof errorMessage === 'string' && errorMessage.trim() ? errorMessage : null
}

function normalizeObservabilityPayload(
  payload: TelemetryObservabilityPayload
): NormalizedTelemetryObservability | null {
  const summary = payload.data?.summary ?? payload.summary
  const health = payload.data?.health ?? payload.health
  const latency = payload.data?.latency ?? payload.latency
  const series = payload.data?.series ?? payload.series

  if (!summary || !health || !latency || !Array.isArray(series)) {
    return null
  }

  return {
    summary,
    health,
    latency,
    series,
  }
}

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) {
    return ''
  }

  const normalized = String(value)
  if (!/[",\n\r]/.test(normalized)) {
    return normalized
  }

  return `"${normalized.replace(/"/g, '""')}"`
}

function buildRecoveriesCsv(rows: TelemetryRecoveryRow[]) {
  const headers = [
    'status',
    'pubgMatchId',
    'squadMatchId',
    'gameMode',
    'mapName',
    'placement',
    'bytesDownloaded',
    'contentLength',
    'parserVersion',
    'hasParsedPayload',
    'parsedAt',
    'updatedAt',
    'errorCode',
    'errorMessage',
  ]

  const lines = [headers.join(',')]

  for (const row of rows) {
    lines.push(
      [
        row.status,
        row.pubgMatchId,
        row.squadMatchId,
        row.gameMode,
        row.mapName,
        row.placement,
        row.bytesDownloaded ?? '',
        row.contentLength ?? '',
        row.parserVersion,
        row.hasParsedPayload,
        row.parsedAt,
        row.updatedAt,
        row.errorCode ?? '',
        row.errorMessage ?? '',
      ]
        .map((value) => escapeCsvValue(value))
        .join(',')
    )
  }

  return lines.join('\r\n')
}

function downloadRecoveriesCsv(clanId: number, rows: TelemetryRecoveryRow[]) {
  const csv = buildRecoveriesCsv(rows)
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `telemetry-recoveries-clan-${clanId}-${stamp}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export default function TelemetryRecoveriesPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<TelemetryRecoveriesPayload | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed' | 'pending'>('all')
  const [parserFilter, setParserFilter] = useState<'all' | 'with-json' | 'without-json'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [primarySortKey, setPrimarySortKey] = useState<SortKey>('updatedAt')
  const [primarySortDirection, setPrimarySortDirection] = useState<SortDirection>('desc')
  const [secondarySortKey, setSecondarySortKey] = useState<SortKey | 'none'>('status')
  const [secondarySortDirection, setSecondarySortDirection] = useState<SortDirection>('asc')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] =
    useState<(typeof HISTORY_PAGE_SIZE_OPTIONS)[number]>(15)
  const [kpiWindow, setKpiWindow] = useState<KpiWindow>('7d')
  const [observabilityWindow, setObservabilityWindow] = useState<KpiWindow>('7d')
  const [loadingObservability, setLoadingObservability] = useState(false)
  const [observabilityError, setObservabilityError] = useState<string | null>(null)
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null)
  const [observabilityPayload, setObservabilityPayload] =
    useState<NormalizedTelemetryObservability | null>(null)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  const loadRecoveries = useCallback(
    async (currentClanId: number) => {
      try {
        const response = await fetch(`/api/clans/${currentClanId}/telemetry/recoveries?limit=150`, {
          cache: 'no-store',
        })

        const data = (await response.json().catch(() => null)) as
          | TelemetryRecoveriesPayload
          | { error?: string }
          | null

        if (!response.ok || !data || !('ok' in data) || !data.ok) {
          if (response.status === 401 || response.status === 403) {
            router.replace(`/login?redirect=${encodeURIComponent(`/clans/${currentClanId}/telemetry/recoveries`)}`)
            return
          }

          setPayload(null)
          setError(data && 'error' in data && data.error ? data.error : 'Chargement des recuperations impossible')
          return
        }

        setPayload(data)
        setError(null)
      } catch {
        setPayload(null)
        setError('Chargement des recuperations impossible')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [router]
  )

  const loadObservability = useCallback(
    async (currentClanId: number, window: KpiWindow) => {
      try {
        setLoadingObservability(true)
        setObservabilityError(null)

        const response = await fetch(
          `/api/clans/${currentClanId}/telemetry/observability?window=${window}&limit=200`,
          {
            cache: 'no-store',
          }
        )

        const data = (await response.json().catch(() => null)) as TelemetryObservabilityPayload | null

        if (!response.ok || !data || !data.ok) {
          if (response.status === 401 || response.status === 403) {
            router.replace(`/login?redirect=${encodeURIComponent(`/clans/${currentClanId}/telemetry/recoveries`)}`)
            return
          }

          const message = extractObservabilityError(data) ?? 'Chargement du dashboard observability impossible'
          setObservabilityPayload(null)
          setObservabilityError(message)
          return
        }

        const normalized = normalizeObservabilityPayload(data)
        if (!normalized) {
          setObservabilityPayload(null)
          setObservabilityError('Format de reponse observability invalide')
          return
        }

        setObservabilityPayload(normalized)
        setObservabilityError(null)
      } catch {
        setObservabilityPayload(null)
        setObservabilityError('Chargement du dashboard observability impossible')
      } finally {
        setLoadingObservability(false)
      }
    },
    [router]
  )

  const runNullJsonBackfill = useCallback(async () => {
    if (!clanId) {
      return
    }

    try {
      setBackfillLoading(true)
      setBackfillMessage(null)

      const response = await fetch(`/api/clans/${clanId}/telemetry/backfill-null-json`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          limit: 150,
          dryRun: false,
        }),
      })

      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean
            error?: string
            candidateCount?: number
            processedCount?: number
            successCount?: number
            failedCount?: number
            batchCount?: number
          }
        | null

      if (!response.ok || !data?.ok) {
        setBackfillMessage(data?.error ?? 'Echec du backfill telemetry null JSON.')
        return
      }

      setBackfillMessage(
        `Backfill termine: ${data.successCount ?? 0} succes, ${data.failedCount ?? 0} echec(s), ${data.processedCount ?? 0}/${data.candidateCount ?? 0} traite(s), ${data.batchCount ?? 0} batch(s).`
      )

      setRefreshing(true)
      void loadRecoveries(clanId)
      void loadObservability(clanId, observabilityWindow)
    } catch {
      setBackfillMessage('Echec du backfill telemetry null JSON.')
    } finally {
      setBackfillLoading(false)
    }
  }, [clanId, loadObservability, loadRecoveries, observabilityWindow])

  useEffect(() => {
    if (!clanId) {
      return
    }

    void loadRecoveries(clanId)
  }, [clanId, loadRecoveries])

  useEffect(() => {
    if (!clanId) {
      return
    }

    void loadObservability(clanId, observabilityWindow)
  }, [clanId, loadObservability, observabilityWindow])

  const filteredRows = useMemo(() => {
    if (!payload) {
      return []
    }

    const search = searchTerm.trim().toLowerCase()

    return payload.rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) {
        return false
      }

      if (parserFilter === 'with-json' && !row.hasParsedPayload) {
        return false
      }

      if (parserFilter === 'without-json' && row.hasParsedPayload) {
        return false
      }

      if (!search) {
        return true
      }

      const haystack = [row.pubgMatchId, row.mapName, row.gameMode, row.errorCode ?? '', row.errorMessage ?? '']
        .join(' ')
        .toLowerCase()

      return haystack.includes(search)
    })
  }, [parserFilter, payload, searchTerm, statusFilter])

  const sortedRows = useMemo(() => {
    return applySort(
      filteredRows,
      primarySortKey,
      primarySortDirection,
      secondarySortKey,
      secondarySortDirection
    )
  }, [filteredRows, primarySortDirection, primarySortKey, secondarySortDirection, secondarySortKey])

  const historyTotalPages = Math.max(1, Math.ceil(sortedRows.length / historyPageSize))
  const historyPageClamped = Math.min(historyPage, historyTotalPages)
  const paginatedRows = useMemo(() => {
    const start = (historyPageClamped - 1) * historyPageSize
    return sortedRows.slice(start, start + historyPageSize)
  }, [historyPageClamped, historyPageSize, sortedRows])

  const telemetryKpis = useMemo(() => {
    if (!payload) {
      return {
        scopedCount: 0,
        successRate: null as number | null,
        medianBytes: null as number | null,
        medianSourceToParseMinutes: null as number | null,
      }
    }

    const now = Date.now()
    const maxAgeMs =
      kpiWindow === '24h'
        ? 24 * 60 * 60 * 1000
        : kpiWindow === '7d'
          ? 7 * 24 * 60 * 60 * 1000
          : kpiWindow === '30d'
            ? 30 * 24 * 60 * 60 * 1000
            : null

    const scopedRows =
      maxAgeMs === null
        ? payload.rows
        : payload.rows.filter((row) => {
            const updatedAt = new Date(row.updatedAt).getTime()
            return Number.isFinite(updatedAt) && now - updatedAt <= maxAgeMs
          })

    // Expired PUBG data is excluded from the denominator too — it's not a pipeline
    // failure, so it shouldn't drag down the success rate meant to measure that.
    const scopedRowsExcludingExpired = scopedRows.filter(
      (row) => !(row.status === 'failed' && isTelemetryDataExpiredError(row.errorCode, row.errorMessage))
    )

    const successRate =
      scopedRowsExcludingExpired.length > 0
        ? (scopedRowsExcludingExpired.filter((row) => row.status === 'success').length /
            scopedRowsExcludingExpired.length) *
          100
        : null

    const medianBytes = median(
      scopedRows
        .map((row) => row.bytesDownloaded)
        .filter((value): value is number => typeof value === 'number' && value > 0)
    )

    const medianSourceToParseMinutes = median(
      scopedRows
        .map((row) => {
          if (!row.sourceGeneratedAt) {
            return null
          }

          const source = new Date(row.sourceGeneratedAt).getTime()
          const parsed = new Date(row.parsedAt).getTime()
          if (!Number.isFinite(source) || !Number.isFinite(parsed) || parsed < source) {
            return null
          }

          return (parsed - source) / (1000 * 60)
        })
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    )

    return {
      scopedCount: scopedRows.length,
      successRate,
      medianBytes,
      medianSourceToParseMinutes,
    }
  }, [kpiWindow, payload])

  if (loading) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
        <NavigationTrail
          currentLabel="Récupérations télémétrie"
          currentHref={`/clans/${clanId}/telemetry/recoveries`}
          fallbackParent={{ href: `/clans/${clanId}/telemetry/dashboard`, label: 'Télémétrie' }}
        />
        <TableSkeleton rows={3} />
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <NavigationTrail
        currentLabel="Récupérations télémétrie"
        currentHref={`/clans/${clanId}/telemetry/recoveries`}
        fallbackParent={{ href: `/clans/${clanId}/telemetry/dashboard`, label: 'Télémétrie' }}
      />
      <section className="app-panel p-4">
        <SettingsPageHeader
          title="Récupérations télémétrie"
          subtitle="Vue de contrôle des téléchargements télémétrie, avec statuts, erreurs et empreinte parser."
        />
      </section>

      <section className="app-panel p-4">
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (!clanId) return
              setRefreshing(true)
              void loadRecoveries(clanId)
              void loadObservability(clanId, observabilityWindow)
            }}
            disabled={refreshing}
            className="app-btn app-btn--md app-btn--secondary gap-1.5"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {refreshing ? 'Rafraichissement...' : 'Rafraichir'}
          </button>

          <button
            type="button"
            onClick={() => {
              void runNullJsonBackfill()
            }}
            disabled={backfillLoading}
            className="app-btn app-btn--md app-btn--secondary gap-1.5"
          >
            <Wrench className="h-4 w-4" aria-hidden />
            {backfillLoading ? 'Backfill en cours...' : 'Backfill JSON manquants'}
          </button>

          {clanId ? (
            <Link
              href={`/clans/${clanId}/matches?period=week`}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Retour aux matchs
            </Link>
          ) : null}
        </div>

        {backfillMessage ? <p className="mt-3 text-sm text-amber-700">{backfillMessage}</p> : null}
      </section>

      {error ? <section className="app-panel p-4 text-sm text-rose-800">{error}</section> : null}

      {payload ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <MetricCard icon={Activity} label="Lignes chargees" value={String(payload.summary.total)} />
            <MetricCard
              icon={CheckCircle2}
              label="Succes"
              value={String(payload.summary.success)}
              tone="emerald"
            />
            <MetricCard icon={XCircle} label="Echecs" value={String(payload.summary.failed)} tone="rose" />
            <MetricCard icon={History} label="Expirees (PUBG)" value={String(payload.summary.expired)} />
            <MetricCard icon={Clock} label="En attente" value={String(payload.summary.pending)} tone="amber" />
            <MetricCard
              icon={FileJson}
              label="Avec parser JSON"
              value={String(payload.summary.withParsedPayload)}
            />
          </section>

          {payload.summary.total > 0 ? (
            <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-emerald-400"
                style={{ width: `${(payload.summary.success / payload.summary.total) * 100}%` }}
              />
              <div
                className="h-full bg-rose-500"
                style={{ width: `${(payload.summary.failed / payload.summary.total) * 100}%` }}
              />
              <div
                className="h-full bg-gray-400"
                style={{ width: `${(payload.summary.expired / payload.summary.total) * 100}%` }}
              />
              <div
                className="h-full bg-amber-400"
                style={{ width: `${(payload.summary.pending / payload.summary.total) * 100}%` }}
              />
            </div>
          ) : null}

          <section className="app-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                <Gauge className="h-5 w-5 text-slate-500" aria-hidden />
                KPIs de sante telemetry
              </h2>
              <SegmentedControl size="sm" value={kpiWindow} onChange={setKpiWindow} options={WINDOW_OPTIONS} />
            </div>

            <p className="mt-2 text-xs text-slate-500">Echantillon de calcul: {telemetryKpis.scopedCount} ligne(s)</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon={TrendingUp} label="Taux succes" value={formatPercent(telemetryKpis.successRate)} />
              <MetricCard icon={Database} label="Lignes observees" value={String(telemetryKpis.scopedCount)} />
              <MetricCard icon={HardDrive} label="Mediane bytes" value={formatBytes(telemetryKpis.medianBytes)} />
              <MetricCard
                icon={Timer}
                label="Mediane delai source->parse"
                value={formatDurationMinutes(telemetryKpis.medianSourceToParseMinutes)}
              />
            </div>
          </section>

          <section className="app-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                <Server className="h-5 w-5 text-slate-500" aria-hidden />
                Dashboard observability
              </h2>
              <SegmentedControl
                size="sm"
                value={observabilityWindow}
                onChange={setObservabilityWindow}
                options={WINDOW_OPTIONS}
              />
            </div>

            {loadingObservability ? (
              <p className="mt-3 text-sm text-slate-600">Chargement du dashboard observability...</p>
            ) : null}

            {observabilityError ? (
              <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {observabilityError}
              </p>
            ) : null}

            {!loadingObservability && !observabilityError && observabilityPayload ? (
              <>
                <p className="mt-2 text-xs text-slate-500">
                  Un job = un match traite par le worker telemetry (file <code className="bg-slate-100 px-1 rounded">telemetry_live_sync</code>), plus par run de sync quotidien.
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <MetricCard icon={Activity} label="Jobs" value={String(observabilityPayload.summary.runs)} />
                  <MetricCard
                    icon={CheckCircle2}
                    label="Succes"
                    value={String(observabilityPayload.summary.success)}
                    tone="emerald"
                  />
                  <MetricCard
                    icon={XCircle}
                    label="Echecs"
                    value={String(observabilityPayload.summary.failed)}
                    tone="rose"
                  />
                  <MetricCard
                    icon={History}
                    label="Expirees (PUBG)"
                    value={String(observabilityPayload.summary.expired)}
                  />
                  <MetricCard
                    icon={HardDriveDownload}
                    label="Bytes telecharges"
                    value={formatBytes(observabilityPayload.summary.bytesDownloaded)}
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    icon={Database}
                    label="Jobs notes (hors expires)"
                    value={String(observabilityPayload.health.ratedRuns)}
                    compact
                  />
                  <MetricCard
                    icon={TrendingUp}
                    label="Taux succes"
                    value={formatPercent(observabilityPayload.health.successRate)}
                    tone="emerald"
                    compact
                  />
                  <MetricCard
                    icon={AlertTriangle}
                    label="Taux echec"
                    value={formatPercent(observabilityPayload.health.failedRate)}
                    tone="rose"
                    compact
                  />
                  <MetricCard
                    icon={Timer}
                    label="Duree job p95"
                    value={formatMilliseconds(observabilityPayload.latency.p95DurationMs)}
                    compact
                  />
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {observabilityPayload.health.alerts.map((alert) => (
                    <article
                      key={alert.key}
                      className={`rounded-lg border px-3 py-2 text-sm ${healthAlertClass(alert.status)}`}
                    >
                      <p className="flex items-center gap-1.5 font-semibold">
                        {alert.status === 'ok' ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        {alert.label}
                      </p>
                      <p className="text-xs">
                        Valeur: {alert.key === 'duration_p95_ms' ? formatMilliseconds(alert.value) : formatPercent(alert.value)}
                        {' · '}Seuil:{' '}
                        {alert.key === 'duration_p95_ms'
                          ? formatMilliseconds(alert.threshold)
                          : formatPercent(alert.threshold)}
                      </p>
                    </article>
                  ))}
                </div>

                <div className="app-table-shell mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Job</th>
                        <th className="px-2 py-2">Match PUBG</th>
                        <th className="px-2 py-2">Statut</th>
                        <th className="px-2 py-2 text-right">Bytes</th>
                        <th className="px-2 py-2 text-right">Duree</th>
                      </tr>
                    </thead>
                    <tbody>
                      {observabilityPayload.series.slice(0, 8).map((row) => (
                        <tr key={row.id} className="app-table-row align-top">
                          <td className="px-2 py-2 text-slate-700">{formatDateTime(row.startedAt)}</td>
                          <td className="px-2 py-2 text-slate-700">{row.pubgMatchId ?? '-'}</td>
                          <td className="px-2 py-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                row.status === 'success'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : row.expired
                                    ? 'border-gray-300 bg-gray-100 text-gray-700'
                                    : 'border-rose-200 bg-rose-50 text-rose-800'
                              }`}
                            >
                              {row.status === 'success' ? (
                                <CheckCircle2 className="h-3 w-3" aria-hidden />
                              ) : row.expired ? (
                                <History className="h-3 w-3" aria-hidden />
                              ) : (
                                <XCircle className="h-3 w-3" aria-hidden />
                              )}
                              {row.status === 'success' ? 'success' : row.expired ? 'expire (PUBG)' : 'failed'}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                            {formatBytes(row.bytesDownloaded)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                            {row.durationMs !== null ? formatMilliseconds(row.durationMs) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>

          <section className="app-panel p-4">
            <h2 className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
              <History className="h-5 w-5 text-slate-500" aria-hidden />
              Historique des recuperations
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Extrait des {payload.limit} dernieres lignes telemetry pour le clan.
            </p>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <FilterDropdown
                id="recoveries-status-filter"
                label="Statut"
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value as 'all' | 'success' | 'failed' | 'pending')
                  setHistoryPage(1)
                }}
                options={[
                  { value: 'all', label: 'Tous' },
                  { value: 'success', label: 'success' },
                  { value: 'failed', label: 'failed' },
                  { value: 'pending', label: 'pending' },
                ]}
              />

              <FilterDropdown
                id="recoveries-parser-filter"
                label="Parser JSON"
                value={parserFilter}
                onChange={(value) => {
                  setParserFilter(value as 'all' | 'with-json' | 'without-json')
                  setHistoryPage(1)
                }}
                options={[
                  { value: 'all', label: 'Tous' },
                  { value: 'with-json', label: 'Avec JSON' },
                  { value: 'without-json', label: 'Sans JSON' },
                ]}
              />

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recherche
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value)
                    setHistoryPage(1)
                  }}
                  placeholder="match id, carte, mode, erreur..."
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 placeholder:text-slate-400"
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <FilterDropdown
                id="recoveries-primary-sort-key"
                label="Tri principal"
                value={primarySortKey}
                onChange={(value) => {
                  setPrimarySortKey(value as SortKey)
                  setHistoryPage(1)
                }}
                options={[
                  { value: 'updatedAt', label: 'Date MAJ' },
                  { value: 'status', label: 'Statut' },
                  { value: 'bytesDownloaded', label: 'Taille (bytes)' },
                ]}
              />

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ordre principal</p>
                <SegmentedControl
                  size="sm"
                  value={primarySortDirection}
                  onChange={(value) => {
                    setPrimarySortDirection(value)
                    setHistoryPage(1)
                  }}
                  options={[
                    { value: 'desc', label: 'Decroissant' },
                    { value: 'asc', label: 'Croissant' },
                  ]}
                />
              </div>

              <FilterDropdown
                id="recoveries-secondary-sort-key"
                label="Tri secondaire"
                value={secondarySortKey}
                onChange={(value) => {
                  setSecondarySortKey(value as SortKey | 'none')
                  setHistoryPage(1)
                }}
                options={[
                  { value: 'none', label: 'Aucun' },
                  { value: 'updatedAt', label: 'Date MAJ' },
                  { value: 'status', label: 'Statut' },
                  { value: 'bytesDownloaded', label: 'Taille (bytes)' },
                ]}
              />

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ordre secondaire</p>
                <SegmentedControl
                  size="sm"
                  value={secondarySortDirection}
                  onChange={(value) => {
                    setSecondarySortDirection(value)
                    setHistoryPage(1)
                  }}
                  options={[
                    { value: 'desc', label: 'Decroissant', disabled: secondarySortKey === 'none' },
                    { value: 'asc', label: 'Croissant', disabled: secondarySortKey === 'none' },
                  ]}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Resultats: {sortedRows.length} / {payload.rows.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!clanId || sortedRows.length === 0) {
                    return
                  }

                  downloadRecoveriesCsv(clanId, sortedRows)
                }}
                disabled={!clanId || sortedRows.length === 0}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Exporter CSV ({sortedRows.length})
              </button>
              {searchTerm.trim() ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Effacer la recherche
                </button>
              ) : null}
              <SegmentedControl
                size="sm"
                value={String(historyPageSize)}
                onChange={(value) => {
                  setHistoryPageSize(Number(value) as (typeof HISTORY_PAGE_SIZE_OPTIONS)[number])
                  setHistoryPage(1)
                }}
                options={HISTORY_PAGE_SIZE_OPTIONS.map((value) => ({
                  value: String(value),
                  label: String(value),
                }))}
              />
            </div>

            <div className="app-table-shell mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Statut</th>
                    <th className="px-2 py-2">Match PUBG</th>
                    <th className="px-2 py-2">Carte / mode</th>
                    <th className="px-2 py-2">Octets</th>
                    <th className="px-2 py-2">Parser</th>
                    <th className="px-2 py-2">Analysee le</th>
                    <th className="px-2 py-2">Erreur</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => {
                    const telemetryDataExpired =
                      row.status === 'failed' && isTelemetryDataExpiredError(row.errorCode, row.errorMessage)

                    return (
                    <tr key={row.id} className="app-table-row align-top">
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            telemetryDataExpired ? 'border-gray-300 bg-gray-100 text-gray-700' : statusClass(row.status)
                          }`}
                        >
                          {telemetryDataExpired ? (
                            <History className="h-3 w-3" aria-hidden />
                          ) : row.status === 'success' ? (
                            <CheckCircle2 className="h-3 w-3" aria-hidden />
                          ) : row.status === 'failed' ? (
                            <XCircle className="h-3 w-3" aria-hidden />
                          ) : (
                            <Clock className="h-3 w-3" aria-hidden />
                          )}
                          {telemetryDataExpired ? 'expiré (PUBG)' : row.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-slate-800">
                        <p className="font-medium">{row.pubgMatchId}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(row.squadCreatedAt)}</p>
                        {clanId ? (
                          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                            {extractDateSegment(row.squadCreatedAt) ? (
                              <Link
                                href={`/clans/${clanId}/matches/session/${extractDateSegment(row.squadCreatedAt)}?period=week`}
                                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Session
                              </Link>
                            ) : null}
                            {extractDateSegment(row.squadCreatedAt) ? (
                              <Link
                                href={`/clans/${clanId}/matches/session/${extractDateSegment(row.squadCreatedAt)}?period=week#match-${row.squadMatchId}`}
                                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Match
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-slate-700">
                        <p>{row.mapName}</p>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {resolveGameMode(row.gameMode)} · #{row.placement}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-slate-700">
                        <p>{formatBytes(row.bytesDownloaded)}</p>
                        <p className="text-xs text-slate-500">Header: {formatBytes(row.contentLength)}</p>
                      </td>
                      <td className="px-2 py-2 text-slate-700">
                        <p>{row.parserVersion}</p>
                        <p className="text-xs text-slate-500">JSON: {row.hasParsedPayload ? 'oui' : 'non'}</p>
                      </td>
                      <td className="px-2 py-2 text-slate-700">
                        <p>{formatDateTime(row.parsedAt)}</p>
                        <p className="text-xs text-slate-500">MAJ: {formatDateTime(row.updatedAt)}</p>
                      </td>
                      <td className="max-w-sm px-2 py-2 text-slate-700">
                        {row.errorCode || row.errorMessage ? (
                          telemetryDataExpired ? (
                            <>
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Télémétrie expirée
                              </p>
                              <p className="text-xs text-gray-600">
                                Donnée PUBG hors délai de rétention (~14-15 jours) — ne redeviendra jamais disponible.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                                {row.errorCode ?? 'ERROR'}
                              </p>
                              <p className="line-clamp-3 text-xs text-rose-700">
                                {row.errorMessage ?? 'Erreur sans message'}
                              </p>
                            </>
                          )
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                  {sortedRows.length === 0 ? (
                    <tr className="app-table-row">
                      <td colSpan={7} className="px-2 py-6 text-center text-sm text-slate-500">
                        Aucun resultat avec les filtres actuels.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {sortedRows.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {(historyPageClamped - 1) * historyPageSize + 1}–
                  {Math.min(historyPageClamped * historyPageSize, sortedRows.length)} sur {sortedRows.length}
                </p>
                <div className="app-pagination">
                  <button
                    type="button"
                    disabled={historyPageClamped <= 1}
                    onClick={() => setHistoryPage(Math.max(1, historyPageClamped - 1))}
                    aria-label="Page precedente"
                    title="Page precedente"
                    className="app-pagination-button"
                  >
                    ←
                  </button>
                  <span className="app-pagination-label">
                    {historyPageClamped} sur {historyTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={historyPageClamped >= historyTotalPages}
                    onClick={() => setHistoryPage(Math.min(historyTotalPages, historyPageClamped + 1))}
                    aria-label="Page suivante"
                    title="Page suivante"
                    className="app-pagination-button"
                  >
                    →
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = 'slate',
  compact = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'slate' | 'emerald' | 'amber' | 'rose'
  compact?: boolean
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'rose'
          ? 'text-rose-700'
          : 'text-slate-900'

  return (
    <article className="app-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </div>
      <p className={`mt-2 font-bold ${compact ? 'text-xl' : 'text-2xl'} ${toneClass}`}>{value}</p>
    </article>
  )
}