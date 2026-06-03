'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import ClanSectionNav from '@/components/ClanSectionNav'
import { useSelectedClan } from '@/hooks/useSelectedClan'

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
    pending: number
    withParsedPayload: number
  }
  rows: TelemetryRecoveryRow[]
}

type SortKey = 'updatedAt' | 'status' | 'bytesDownloaded'
type SortDirection = 'asc' | 'desc'
type KpiWindow = '24h' | '7d' | '30d' | 'all'

type TelemetryObservabilitySeriesRow = {
  id: string
  startedAt: string
  finishedAt: string | null
  cronStatus: string
  durationMs: number | null
  telemetry: {
    status: string
    reason: string | null
    scanned: number
    parsed: number
    failed: number
    skipped: number
    bytesDownloaded: number
    fetchMatchMs: number
    downloadAssetMs: number
    parseMs: number
    persistMs: number
  }
}

type TelemetryObservabilityPayload = {
  ok: boolean
  data?: {
    summary?: {
      runs: number
      scanned: number
      parsed: number
      failed: number
      skipped: number
      bytesDownloaded: number
      fetchMatchMs: number
      downloadAssetMs: number
      parseMs: number
      persistMs: number
    }
    health?: {
      runsWithTelemetry: number
      successRate: number
      failedRate: number
      thresholds: {
        failedRateMax: number
        parseP95MaxMs: number
      }
      alerts: Array<{
        key: string
        label: string
        value: number
        threshold: number
        status: 'ok' | 'warning'
      }>
    }
    latency?: {
      p95: {
        fetchMatchMs: number
        downloadAssetMs: number
        parseMs: number
        persistMs: number
      }
    }
    series?: TelemetryObservabilitySeriesRow[]
  }
  summary?: {
    runs: number
    scanned: number
    parsed: number
    failed: number
    skipped: number
    bytesDownloaded: number
    fetchMatchMs: number
    downloadAssetMs: number
    parseMs: number
    persistMs: number
  }
  health?: {
    runsWithTelemetry: number
    successRate: number
    failedRate: number
    thresholds: {
      failedRateMax: number
      parseP95MaxMs: number
    }
    alerts: Array<{
      key: string
      label: string
      value: number
      threshold: number
      status: 'ok' | 'warning'
    }>
  }
  latency?: {
    p95: {
      fetchMatchMs: number
      downloadAssetMs: number
      parseMs: number
      persistMs: number
    }
  }
  series?: TelemetryObservabilitySeriesRow[]
  error?: { message?: string }
}

type NormalizedTelemetryObservability = {
  summary: {
    runs: number
    scanned: number
    parsed: number
    failed: number
    skipped: number
    bytesDownloaded: number
    fetchMatchMs: number
    downloadAssetMs: number
    parseMs: number
    persistMs: number
  }
  health: {
    runsWithTelemetry: number
    successRate: number
    failedRate: number
    thresholds: {
      failedRateMax: number
      parseP95MaxMs: number
    }
    alerts: Array<{
      key: string
      label: string
      value: number
      threshold: number
      status: 'ok' | 'warning'
    }>
  }
  latency: {
    p95: {
      fetchMatchMs: number
      downloadAssetMs: number
      parseMs: number
      persistMs: number
    }
  }
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
  const [kpiWindow, setKpiWindow] = useState<KpiWindow>('7d')
  const [observabilityWindow, setObservabilityWindow] = useState<KpiWindow>('7d')
  const [loadingObservability, setLoadingObservability] = useState(false)
  const [observabilityError, setObservabilityError] = useState<string | null>(null)
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

    const successRate =
      scopedRows.length > 0
        ? (scopedRows.filter((row) => row.status === 'success').length / scopedRows.length) * 100
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
        <p className="text-sm text-slate-600">Chargement des recuperations telemetrie...</p>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <header className="app-panel p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Ops Telemetrie</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Recuperations telemetrie (provisoire)</h1>
        <p className="mt-2 text-sm text-slate-600">
          Vue de controle des telechargements telemetry, avec statuts, erreurs et empreinte parser.
        </p>
        {clanId ? <ClanSectionNav clanId={clanId} /> : null}

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
            className="app-btn app-btn--md app-btn--secondary"
          >
            {refreshing ? 'Rafraichissement...' : 'Rafraichir'}
          </button>

          {clanId ? (
            <Link
              href={`/clans/${clanId}/matches?period=week`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Retour aux matchs
            </Link>
          ) : null}
        </div>
      </header>

      {error ? <section className="app-panel p-4 text-sm text-rose-800">{error}</section> : null}

      {payload ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Lignes chargees</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{payload.summary.total}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Succes</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{payload.summary.success}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Echecs</p>
              <p className="mt-2 text-2xl font-bold text-rose-700">{payload.summary.failed}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">En attente</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">{payload.summary.pending}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Avec parser JSON</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{payload.summary.withParsedPayload}</p>
            </article>
          </section>

          <section className="app-panel p-4">
            <div className="flex flex-wrap items-end gap-3">
              <h2 className="text-lg font-semibold text-slate-900">KPIs de sante telemetry</h2>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fenetre
                <select
                  value={kpiWindow}
                  onChange={(event) => setKpiWindow(event.target.value as KpiWindow)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="24h">24 heures</option>
                  <option value="7d">7 jours</option>
                  <option value="30d">30 jours</option>
                  <option value="all">Tout l'historique</option>
                </select>
              </label>
            </div>

            <p className="mt-2 text-xs text-slate-500">Echantillon de calcul: {telemetryKpis.scopedCount} ligne(s)</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Taux succes</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatPercent(telemetryKpis.successRate)}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Lignes observees</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{telemetryKpis.scopedCount}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Mediane bytes</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatBytes(telemetryKpis.medianBytes)}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Mediane delai source-&gt;parse</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {formatDurationMinutes(telemetryKpis.medianSourceToParseMinutes)}
              </p>
            </article>
            </div>
          </section>

          <section className="app-panel p-4">
            <div className="flex flex-wrap items-end gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Dashboard observability</h2>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fenetre
                <select
                  value={observabilityWindow}
                  onChange={(event) => setObservabilityWindow(event.target.value as KpiWindow)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="24h">24 heures</option>
                  <option value="7d">7 jours</option>
                  <option value="30d">30 jours</option>
                  <option value="all">Tout l'historique</option>
                </select>
              </label>
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
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Runs</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{observabilityPayload.summary.runs}</p>
                  </article>
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Scanned</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{observabilityPayload.summary.scanned}</p>
                  </article>
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Parsed</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-700">{observabilityPayload.summary.parsed}</p>
                  </article>
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Failed</p>
                    <p className="mt-2 text-2xl font-bold text-rose-700">{observabilityPayload.summary.failed}</p>
                  </article>
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Bytes telecharges</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {formatBytes(observabilityPayload.summary.bytesDownloaded)}
                    </p>
                  </article>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Fetch p95</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {formatMilliseconds(observabilityPayload.latency.p95.fetchMatchMs)}
                    </p>
                  </article>
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Download p95</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {formatMilliseconds(observabilityPayload.latency.p95.downloadAssetMs)}
                    </p>
                  </article>
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Parse p95</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {formatMilliseconds(observabilityPayload.latency.p95.parseMs)}
                    </p>
                  </article>
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Persist p95</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {formatMilliseconds(observabilityPayload.latency.p95.persistMs)}
                    </p>
                  </article>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Runs telemetry</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {observabilityPayload.health.runsWithTelemetry}
                    </p>
                  </article>
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Taux succes</p>
                    <p className="mt-2 text-xl font-semibold text-emerald-700">
                      {formatPercent(observabilityPayload.health.successRate)}
                    </p>
                  </article>
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Taux echec</p>
                    <p className="mt-2 text-xl font-semibold text-rose-700">
                      {formatPercent(observabilityPayload.health.failedRate)}
                    </p>
                  </article>
                  <article className="app-panel p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Seuil parse p95</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {formatMilliseconds(observabilityPayload.health.thresholds.parseP95MaxMs)}
                    </p>
                  </article>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {observabilityPayload.health.alerts.map((alert) => (
                    <article
                      key={alert.key}
                      className={`rounded-lg border px-3 py-2 text-sm ${healthAlertClass(alert.status)}`}
                    >
                      <p className="font-semibold">{alert.label}</p>
                      <p className="text-xs">
                        Valeur: {alert.key === 'parse_p95_ms' ? formatMilliseconds(alert.value) : formatPercent(alert.value)}
                        {' · '}Seuil:{' '}
                        {alert.key === 'parse_p95_ms'
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
                        <th className="px-2 py-2">Run</th>
                        <th className="px-2 py-2">Statut telemetry</th>
                        <th className="px-2 py-2 text-right">Scanned</th>
                        <th className="px-2 py-2 text-right">Parsed</th>
                        <th className="px-2 py-2 text-right">Failed</th>
                        <th className="px-2 py-2 text-right">Bytes</th>
                        <th className="px-2 py-2 text-right">Parse</th>
                      </tr>
                    </thead>
                    <tbody>
                      {observabilityPayload.series.slice(0, 8).map((row) => (
                        <tr key={row.id} className="app-table-row align-top">
                          <td className="px-2 py-2 text-slate-700">{formatDateTime(row.startedAt)}</td>
                          <td className="px-2 py-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                row.telemetry.status === 'success'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : row.telemetry.failed > 0
                                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                                    : 'border-amber-200 bg-amber-50 text-amber-800'
                              }`}
                            >
                              {row.telemetry.status}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-700">{row.telemetry.scanned}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-700">{row.telemetry.parsed}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-700">{row.telemetry.failed}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                            {formatBytes(row.telemetry.bytesDownloaded)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                            {formatMilliseconds(row.telemetry.parseMs)}
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
            <h2 className="text-lg font-semibold text-slate-900">Historique des recuperations</h2>
            <p className="mt-1 text-sm text-slate-600">
              Extrait des {payload.limit} dernieres lignes telemetry pour le clan.
            </p>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Statut
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'all' | 'success' | 'failed' | 'pending')}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="all">Tous</option>
                  <option value="success">success</option>
                  <option value="failed">failed</option>
                  <option value="pending">pending</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Parser JSON
                <select
                  value={parserFilter}
                  onChange={(event) => setParserFilter(event.target.value as 'all' | 'with-json' | 'without-json')}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="all">Tous</option>
                  <option value="with-json">Avec JSON</option>
                  <option value="without-json">Sans JSON</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recherche
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="match id, carte, mode, erreur..."
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 placeholder:text-slate-400"
                />
              </label>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tri principal
                <select
                  value={primarySortKey}
                  onChange={(event) => setPrimarySortKey(event.target.value as SortKey)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="updatedAt">Date MAJ</option>
                  <option value="status">Statut</option>
                  <option value="bytesDownloaded">Taille (bytes)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ordre principal
                <select
                  value={primarySortDirection}
                  onChange={(event) => setPrimarySortDirection(event.target.value as SortDirection)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="desc">Decroissant</option>
                  <option value="asc">Croissant</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tri secondaire
                <select
                  value={secondarySortKey}
                  onChange={(event) => setSecondarySortKey(event.target.value as SortKey | 'none')}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="none">Aucun</option>
                  <option value="updatedAt">Date MAJ</option>
                  <option value="status">Statut</option>
                  <option value="bytesDownloaded">Taille (bytes)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ordre secondaire
                <select
                  value={secondarySortDirection}
                  onChange={(event) => setSecondarySortDirection(event.target.value as SortDirection)}
                  disabled={secondarySortKey === 'none'}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="desc">Decroissant</option>
                  <option value="asc">Croissant</option>
                </select>
              </label>
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
                  {sortedRows.map((row) => (
                    <tr key={row.id} className="app-table-row align-top">
                      <td className="px-2 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(row.status)}`}>
                          {row.status}
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
                          {row.gameMode} · #{row.placement}
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
                          <>
                            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                              {row.errorCode ?? 'ERROR'}
                            </p>
                            <p className="line-clamp-3 text-xs text-rose-700">
                              {row.errorMessage ?? 'Erreur sans message'}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
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
          </section>
        </>
      ) : null}
    </main>
  )
}