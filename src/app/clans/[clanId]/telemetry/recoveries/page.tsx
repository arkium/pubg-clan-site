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
  ListOrdered,
  type LucideIcon,
  Play,
  RefreshCw,
  Server,
  Timer,
  TrendingUp,
  Users,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'
import FilterDropdown from '@/components/ui/FilterDropdown'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { resolveGameMode } from '@/lib/pubg-assets'
import { isTelemetryDataExpiredError } from '@/lib/pubg-telemetry/telemetry-error-presentation'

const HISTORY_PAGE_SIZE_OPTIONS = [10, 15, 25] as const

export type ClanBacklogStat = {
  clanId: number
  clanName: string
  clanTag: string
  totalMatches: number
  completedMatches: number
  expiredMatches: number
  recoverableBacklog: number
  urgentBacklog: number
  inQueueCount: number
  toQueueCount: number
  completionRate: number | null
}

export type StatusPayload = {
  worker: {
    alive: boolean
    pid: number | null
    acquiredAt: string | null
  }
  queue: {
    queued: number
    running: number
    remaining: number
    success: number
    failed: number
    total: number
  }
  scheduler: {
    syncEnabled: boolean
    cronJobsEnabled: boolean
    maxMatchesPerRun: number
    nextDailySyncEstimate: string
  }
  etaSeconds: number | null
}

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
  clan?: { id: number; name: string; tag: string | null }
  limit: number
  summary: {
    total: number
    success: number
    failed: number
    expired: number
    pending: number
    withParsedPayload: number
  }
  backlog?: ClanBacklogStat | null
  engineStatus?: StatusPayload | null
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

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '-'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSecs = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSecs > 0 ? `${remainingSecs}s` : ''}`
  const hours = Math.floor(seconds / 60)
  const remainingMins = minutes % 60
  return `${hours}h ${remainingMins}m`
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '-'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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

function StatusPill({ status, labelOverride }: { status: string; labelOverride?: string }) {
  let modifier = 'status-pill--offline'
  let label = labelOverride ?? status

  switch (status.toLowerCase()) {
    case 'success':
    case 'completed':
    case 'ok':
      modifier = 'status-pill--online'
      label = labelOverride ?? 'Succès'
      break
    case 'running':
      modifier = 'status-pill--pending'
      label = labelOverride ?? 'En cours'
      break
    case 'queued':
      modifier = 'status-pill--pending'
      label = labelOverride ?? 'En file'
      break
    case 'pending':
      modifier = 'status-pill--pending'
      label = labelOverride ?? 'En attente'
      break
    case 'failed':
    case 'error':
      modifier = 'status-pill--error'
      label = labelOverride ?? 'Échec'
      break
    case 'expired':
      modifier = 'status-pill--offline'
      label = labelOverride ?? 'Expiré (PUBG)'
      break
    default:
      modifier = 'status-pill--offline'
      label = labelOverride ?? status
  }

  return (
    <span className={`status-pill ${modifier}`}>
      <span className="status-dot" />
      {label}
    </span>
  )
}

function healthAlertClass(status: 'ok' | 'warning') {
  if (status === 'ok') {
    return 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
  }

  return 'border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
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
  const { isSuperUser } = useAuthSession()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<TelemetryRecoveriesPayload | null>(null)
  const [clansList, setClansList] = useState<{ id: number; name: string; tag: string | null }[]>([])
  const [enqueueLoading, setEnqueueLoading] = useState<'urgent' | 'backlog' | null>(null)
  const [enqueueFeedback, setEnqueueFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<number>(() => Date.now())

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

  const loadClans = useCallback(async () => {
    try {
      const response = await fetch('/api/clans', { cache: 'no-store' })
      const data = (await response.json().catch(() => null)) as { id: number; name: string; tag: string | null }[] | null
      if (Array.isArray(data)) {
        setClansList(data.map((c) => ({ id: c.id, name: c.name, tag: c.tag ?? null })))
      }
    } catch {
      // non-bloquant
    }
  }, [])

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
          setError(data && 'error' in data && data.error ? data.error : 'Chargement des récupérations impossible')
          return
        }

        setPayload(data)
        setRefreshedAt(Date.now())
        setError(null)
      } catch {
        setPayload(null)
        setError('Chargement des récupérations impossible')
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
          setObservabilityError('Format de réponse observability invalide')
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

  const handleEnqueue = async (mode: 'urgent' | 'backlog') => {
    if (!clanId || enqueueLoading) return
    setEnqueueLoading(mode)
    setEnqueueFeedback(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/recoveries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: mode === 'urgent' ? 'enqueue_urgent' : 'enqueue_backlog',
        }),
      })

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        queuedCount?: number
        alreadyQueuedCount?: number
        data?: { queuedCount?: number; alreadyQueuedCount?: number }
      } | null

      if (response.ok && data?.ok) {
        const queuedCount = data.data?.queuedCount ?? data.queuedCount ?? 0
        const alreadyQueued = data.data?.alreadyQueuedCount ?? data.alreadyQueuedCount ?? 0
        setEnqueueFeedback({
          type: 'success',
          message: `Mise en file réussie : ${queuedCount} match(s) ajouté(s) à la file${
            alreadyQueued > 0 ? ` (${alreadyQueued} déjà en file)` : ''
          }.`,
        })
        setRefreshing(true)
        void loadRecoveries(clanId)
      } else {
        setEnqueueFeedback({
          type: 'error',
          message: data?.error ?? 'Échec lors de la mise en file du backlog.',
        })
      }
    } catch {
      setEnqueueFeedback({
        type: 'error',
        message: 'Erreur de communication avec le serveur lors de la mise en file.',
      })
    } finally {
      setEnqueueLoading(null)
    }
  }

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
        setBackfillMessage(data?.error ?? 'Échec du backfill telemetry null JSON.')
        return
      }

      setBackfillMessage(
        `Backfill terminé : ${data.successCount ?? 0} succès, ${data.failedCount ?? 0} échec(s), ${data.processedCount ?? 0}/${data.candidateCount ?? 0} traité(s), ${data.batchCount ?? 0} batch(s).`
      )

      setRefreshing(true)
      void loadRecoveries(clanId)
      void loadObservability(clanId, observabilityWindow)
    } catch {
      setBackfillMessage('Échec du backfill telemetry null JSON.')
    } finally {
      setBackfillLoading(false)
    }
  }, [clanId, loadObservability, loadRecoveries, observabilityWindow])

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      if (!isMounted) return
      await Promise.allSettled([
        loadClans(),
        clanId ? loadRecoveries(clanId) : Promise.resolve(),
        clanId ? loadObservability(clanId, observabilityWindow) : Promise.resolve(),
      ])
    }
    void init()

    return () => {
      isMounted = false
    }
  }, [clanId, loadClans, loadRecoveries, loadObservability, observabilityWindow])

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

    const now = refreshedAt
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
  }, [kpiWindow, payload, refreshedAt])

  if (loading) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
        <NavigationTrail
          currentLabel="Récupérations télémétrie"
          currentHref={`/clans/${clanId}/telemetry/recoveries`}
          fallbackParent={{ href: `/clans/${clanId}/telemetry/dashboard`, label: 'Télémétrie' }}
        />
        <TableSkeleton rows={4} />
      </main>
    )
  }

  const backlog = payload?.backlog
  const engineStatus = payload?.engineStatus

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <NavigationTrail
        currentLabel="Récupérations télémétrie"
        currentHref={`/clans/${clanId}/telemetry/recoveries`}
        fallbackParent={{ href: `/clans/${clanId}/telemetry/dashboard`, label: 'Télémétrie' }}
      />

      {/* Header avec sélecteur de clan et actions globales */}
      <section className="app-panel p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <SettingsPageHeader
                title="Récupérations télémétrie"
                subtitle="Pilotage du téléchargement des fichiers télémétrie PUBG, audit du backlog et surveillance du parser."
              />
            </div>
            {payload?.clan && (
              <div className="mt-2 flex items-center gap-2">
                <span className="app-meta-pill font-semibold">
                  Clan #{payload.clan.id} {payload.clan.tag ? `[${payload.clan.tag}]` : ''} {payload.clan.name}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sélecteur rapide de clan */}
            {clansList.length > 0 && (
              <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
                <Users className="h-4 w-4 text-indigo-500 ml-1.5" />
                <select
                  value={String(clanId)}
                  onChange={(e) => {
                    const target = e.target.value
                    if (target) {
                      router.push(`/clans/${target}/telemetry/recoveries`)
                    }
                  }}
                  className="rounded-lg border-0 bg-transparent px-2 py-1 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                >
                  {clansList.map((c) => (
                    <option key={c.id} value={String(c.id)} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                      Clan #{c.id} — {c.name} {c.tag ? `[${c.tag}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (!clanId) return
                setRefreshing(true)
                void loadRecoveries(clanId)
                void loadObservability(clanId, observabilityWindow)
              }}
              disabled={refreshing}
              className="app-btn app-btn--sm app-btn--secondary gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              {refreshing ? 'Actualisation...' : 'Actualiser'}
            </button>

            {isSuperUser && (
              <Link
                href="/settings/telemetry-recoveries"
                className="app-btn app-btn--sm app-btn--secondary gap-1.5 font-semibold text-indigo-600 dark:text-indigo-400"
              >
                <Server className="h-4 w-4" />
                Console globale
              </Link>
            )}

            {clanId ? (
              <Link
                href={`/clans/${clanId}/matches?period=week`}
                className="app-btn app-btn--sm app-btn--secondary gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Matchs
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <section className="app-panel p-4 text-sm text-rose-700 dark:text-rose-300 border border-rose-500/30 bg-rose-500/10 rounded-xl">
          {error}
        </section>
      ) : null}

      {/* 1. MOTEUR TÉLÉMÉTRIE & FILE GLOBALE (Identique à la page globale) */}
      {engineStatus && (
        <section className="app-panel p-5 space-y-4 border-l-4 border-indigo-500">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Server className="h-4 w-4 text-indigo-500" />
                Moteur Télémétrie & File d&apos;attente
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Statut du worker d&apos;ingestion, charge de la file globale et estimation de traitement.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill
                status={engineStatus.worker.alive ? 'success' : 'failed'}
                labelOverride={
                  engineStatus.worker.alive
                    ? `Worker actif (PID ${engineStatus.worker.pid ?? '?'})`
                    : 'Worker inactif'
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <MetricCard
              icon={Clock}
              label="En attente"
              value={String(engineStatus.queue.queued)}
              tone="amber"
              compact
            />
            <MetricCard
              icon={Activity}
              label="En cours"
              value={String(engineStatus.queue.running)}
              tone="indigo"
              compact
            />
            <MetricCard
              icon={ListOrdered}
              label="Restant à traiter"
              value={String(engineStatus.queue.remaining)}
              tone={engineStatus.queue.remaining > 0 ? 'amber' : 'slate'}
              compact
            />
            <MetricCard
              icon={Timer}
              label="Durée estimée (ETA)"
              value={formatDuration(engineStatus.etaSeconds)}
              compact
            />
            <MetricCard
              icon={Zap}
              label="Prochain cron estimé"
              value={formatTime(engineStatus.scheduler.nextDailySyncEstimate)}
              compact
            />
            <MetricCard
              icon={CheckCircle2}
              label="Total traités"
              value={String(engineStatus.queue.total)}
              compact
            />
          </div>
        </section>
      )}

      {/* 2. AUDIT DE COUVERTURE & ACTIONS BACKLOG POUR CE CLAN */}
      {backlog && (
        <section className="app-panel p-5 space-y-4 border-2 border-indigo-500/20 dark:border-indigo-500/30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="h-4 w-4 text-indigo-500" />
                  Couverture Télémétrie & Backlog du Clan
                </h2>
                <span className="app-meta-pill text-xs font-bold font-mono">
                  {formatPercent(backlog.completionRate)} complété
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Audit de l&apos;intégralité des matchs enregistrés pour ce clan. Seuls les matchs de moins de 14 jours sont encore récupérables via l&apos;API PUBG.
              </p>
            </div>

            {/* Actions d'enfilage pour ce clan */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleEnqueue('urgent')}
                disabled={enqueueLoading !== null || backlog.urgentBacklog === 0}
                className="app-btn app-btn--sm app-btn--primary gap-1.5"
                title="Met en file les matchs entre 7 et 14 jours avant leur expiration définitive"
              >
                <Play className={`h-3.5 w-3.5 ${enqueueLoading === 'urgent' ? 'animate-spin' : ''}`} />
                {enqueueLoading === 'urgent'
                  ? 'Enfilage...'
                  : `Mettre en file urgences (${backlog.urgentBacklog})`}
              </button>

              <button
                type="button"
                onClick={() => void handleEnqueue('backlog')}
                disabled={enqueueLoading !== null || backlog.toQueueCount === 0}
                className="app-btn app-btn--sm app-btn--secondary gap-1.5"
                title="Met en file tous les matchs récupérables non encore traités"
              >
                <HardDriveDownload className={`h-3.5 w-3.5 ${enqueueLoading === 'backlog' ? 'animate-spin' : ''}`} />
                {enqueueLoading === 'backlog'
                  ? 'Enfilage...'
                  : `Mettre en file le backlog (${backlog.toQueueCount})`}
              </button>

              <button
                type="button"
                onClick={() => void runNullJsonBackfill()}
                disabled={backfillLoading}
                className="app-btn app-btn--sm app-btn--secondary gap-1.5"
                title="Réanalyse les fichiers déjà téléchargés dont le JSON parsé est manquant"
              >
                <Wrench className={`h-3.5 w-3.5 ${backfillLoading ? 'animate-spin' : ''}`} />
                {backfillLoading ? 'Réparation...' : 'Backfill JSON manquants'}
              </button>
            </div>
          </div>

          {/* Feedback d'actions */}
          {enqueueFeedback && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 ${
                enqueueFeedback.type === 'success'
                  ? 'telemetry-toast-success'
                  : 'telemetry-toast-error'
              }`}
            >
              <span>{enqueueFeedback.message}</span>
              <button
                type="button"
                onClick={() => setEnqueueFeedback(null)}
                className="opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )}

          {backfillMessage && (
            <div className="p-3 rounded-xl text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200">
              {backfillMessage}
            </div>
          )}

          {/* Barre de progression tricolore */}
          {backlog.totalMatches > 0 && (
            <div className="space-y-1.5">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${(backlog.completedMatches / backlog.totalMatches) * 100}%` }}
                  title={`Complétés: ${backlog.completedMatches}`}
                />
                <div
                  className="h-full bg-slate-400 dark:bg-slate-600 transition-all duration-300"
                  style={{ width: `${(backlog.expiredMatches / backlog.totalMatches) * 100}%` }}
                  title={`Expirés PUBG: ${backlog.expiredMatches}`}
                />
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${(backlog.recoverableBacklog / backlog.totalMatches) * 100}%` }}
                  title={`Backlog récupérable: ${backlog.recoverableBacklog}`}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Complétés ({backlog.completedMatches})
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-600" />
                  Expirés définitifs ({backlog.expiredMatches})
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  Récupérables ({backlog.recoverableBacklog})
                </span>
              </div>
            </div>
          )}

          {/* Grille des 6 indicateurs macro */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard
              icon={Activity}
              label="Matchs totaux"
              value={String(backlog.totalMatches)}
              hint="Historique complet du clan"
              compact
            />
            <MetricCard
              icon={CheckCircle2}
              label="Complétés"
              value={String(backlog.completedMatches)}
              tone="emerald"
              hint="Télémétrie parsée"
              compact
            />
            <MetricCard
              icon={History}
              label="Expirés (>14j)"
              value={String(backlog.expiredMatches)}
              hint="Irrévocables (PUBG)"
              compact
            />
            <MetricCard
              icon={HardDriveDownload}
              label="Backlog récupérable"
              value={String(backlog.recoverableBacklog)}
              tone={backlog.recoverableBacklog > 0 ? 'indigo' : 'slate'}
              hint="Prêts à télécharger"
              compact
            />
            <MetricCard
              icon={AlertTriangle}
              label="Urgents (< 14j)"
              value={String(backlog.urgentBacklog)}
              tone={backlog.urgentBacklog > 0 ? 'rose' : 'slate'}
              hint="Expire sous 7 jours !"
              compact
            />
            <MetricCard
              icon={ListOrdered}
              label="En file d'attente"
              value={`${backlog.inQueueCount} / ${backlog.toQueueCount}`}
              hint="En file / Restant"
              compact
            />
          </div>
        </section>
      )}

      {/* 3. ÉCHANTILLON CHARGÉ (150 DERNIÈRES LIGNES) */}
      {payload ? (
        <>
          <section className="app-panel p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileJson className="h-4 w-4 text-indigo-500" />
                Échantillon récent ({payload.rows.length} lignes)
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Extraction des {payload.limit} derniers événements
              </span>
            </div>

            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              <MetricCard icon={Activity} label="Lignes chargées" value={String(payload.summary.total)} compact />
              <MetricCard
                icon={CheckCircle2}
                label="Succès"
                value={String(payload.summary.success)}
                tone="emerald"
                compact
              />
              <MetricCard icon={XCircle} label="Échecs" value={String(payload.summary.failed)} tone="rose" compact />
              <MetricCard icon={History} label="Expirées (PUBG)" value={String(payload.summary.expired)} compact />
              <MetricCard icon={Clock} label="En attente" value={String(payload.summary.pending)} tone="amber" compact />
              <MetricCard
                icon={FileJson}
                label="Avec parser JSON"
                value={String(payload.summary.withParsedPayload)}
                compact
              />
            </div>
          </section>

          {/* 4. KPIS DE SANTÉ TÉLÉMÉTRIE */}
          <section className="app-panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                <Gauge className="h-4 w-4 text-indigo-500" aria-hidden />
                KPIs de santé télémétrie
              </h2>
              <SegmentedControl size="sm" value={kpiWindow} onChange={setKpiWindow} options={WINDOW_OPTIONS} />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Échantillon de calcul : {telemetryKpis.scopedCount} ligne(s) sur la fenêtre sélectionnée.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                icon={TrendingUp}
                label="Taux succès"
                value={formatPercent(telemetryKpis.successRate)}
                tone="emerald"
              />
              <MetricCard icon={Database} label="Lignes observées" value={String(telemetryKpis.scopedCount)} />
              <MetricCard icon={HardDrive} label="Médiane taille" value={formatBytes(telemetryKpis.medianBytes)} />
              <MetricCard
                icon={Timer}
                label="Médiane délai source->parse"
                value={formatDurationMinutes(telemetryKpis.medianSourceToParseMinutes)}
              />
            </div>
          </section>

          {/* 5. DASHBOARD OBSERVABILITÉ */}
          <section className="app-panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                <Server className="h-4 w-4 text-indigo-500" aria-hidden />
                Observabilité des jobs télémétrie
              </h2>
              <SegmentedControl
                size="sm"
                value={observabilityWindow}
                onChange={setObservabilityWindow}
                options={WINDOW_OPTIONS}
              />
            </div>

            {loadingObservability ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">Chargement de l&apos;observabilité...</p>
            ) : null}

            {observabilityError ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                {observabilityError}
              </div>
            ) : null}

            {!loadingObservability && !observabilityError && observabilityPayload ? (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Un job = un match traité par le worker telemetry (file <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-indigo-500 font-mono">telemetry_live_sync</code>).
                </p>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <MetricCard icon={Activity} label="Jobs" value={String(observabilityPayload.summary.runs)} compact />
                  <MetricCard
                    icon={CheckCircle2}
                    label="Succès"
                    value={String(observabilityPayload.summary.success)}
                    tone="emerald"
                    compact
                  />
                  <MetricCard
                    icon={XCircle}
                    label="Échecs"
                    value={String(observabilityPayload.summary.failed)}
                    tone="rose"
                    compact
                  />
                  <MetricCard
                    icon={History}
                    label="Expirées (PUBG)"
                    value={String(observabilityPayload.summary.expired)}
                    compact
                  />
                  <MetricCard
                    icon={HardDriveDownload}
                    label="Octets téléchargés"
                    value={formatBytes(observabilityPayload.summary.bytesDownloaded)}
                    compact
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    icon={Database}
                    label="Jobs notés (hors expirés)"
                    value={String(observabilityPayload.health.ratedRuns)}
                    compact
                  />
                  <MetricCard
                    icon={TrendingUp}
                    label="Taux succès"
                    value={formatPercent(observabilityPayload.health.successRate)}
                    tone="emerald"
                    compact
                  />
                  <MetricCard
                    icon={AlertTriangle}
                    label="Taux échec"
                    value={formatPercent(observabilityPayload.health.failedRate)}
                    tone="rose"
                    compact
                  />
                  <MetricCard
                    icon={Timer}
                    label="Durée job p95"
                    value={formatMilliseconds(observabilityPayload.latency.p95DurationMs)}
                    compact
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {observabilityPayload.health.alerts.map((alert) => (
                    <article
                      key={alert.key}
                      className={`rounded-xl border p-3 text-sm ${healthAlertClass(alert.status)}`}
                    >
                      <p className="flex items-center gap-1.5 font-semibold">
                        {alert.status === 'ok' ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        {alert.label}
                      </p>
                      <p className="text-xs mt-0.5 opacity-90">
                        Valeur : {alert.key === 'duration_p95_ms' ? formatMilliseconds(alert.value) : formatPercent(alert.value)}
                        {' · '}Seuil :{' '}
                        {alert.key === 'duration_p95_ms'
                          ? formatMilliseconds(alert.threshold)
                          : formatPercent(alert.threshold)}
                      </p>
                    </article>
                  ))}
                </div>

                <div className="app-table-shell overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Job</th>
                        <th className="px-3 py-2">Match PUBG</th>
                        <th className="px-3 py-2">Statut</th>
                        <th className="px-3 py-2 text-right">Taille</th>
                        <th className="px-3 py-2 text-right">Durée</th>
                      </tr>
                    </thead>
                    <tbody>
                      {observabilityPayload.series.slice(0, 8).map((row) => (
                        <tr key={row.id} className="app-table-row align-top">
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{formatDateTime(row.startedAt)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-900 dark:text-white">{row.pubgMatchId ?? '-'}</td>
                          <td className="px-3 py-2">
                            <StatusPill
                              status={row.expired ? 'expired' : row.status}
                              labelOverride={row.expired ? 'Expiré (PUBG)' : row.status}
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                            {formatBytes(row.bytesDownloaded)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
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

          {/* 6. HISTORIQUE DÉTAILLÉ DES RÉCUPÉRATIONS */}
          <section className="app-panel p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <History className="h-4 w-4 text-indigo-500" aria-hidden />
                  Historique détaillé des récupérations
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Liste des {payload.rows.length} derniers enregistrements télémétrie de ce clan.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
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
                  { value: 'success', label: 'Succès' },
                  { value: 'failed', label: 'Échecs' },
                  { value: 'pending', label: 'En attente' },
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

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Recherche
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value)
                    setHistoryPage(1)
                  }}
                  placeholder="ID match, carte, mode, erreur..."
                  className="h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
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
                  { value: 'bytesDownloaded', label: 'Taille (octets)' },
                ]}
              />

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ordre principal</p>
                <SegmentedControl
                  size="sm"
                  value={primarySortDirection}
                  onChange={(value) => {
                    setPrimarySortDirection(value)
                    setHistoryPage(1)
                  }}
                  options={[
                    { value: 'desc', label: 'Décroissant' },
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
                  { value: 'bytesDownloaded', label: 'Taille (octets)' },
                ]}
              />

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ordre secondaire</p>
                <SegmentedControl
                  size="sm"
                  value={secondarySortDirection}
                  onChange={(value) => {
                    setSecondarySortDirection(value)
                    setHistoryPage(1)
                  }}
                  options={[
                    { value: 'desc', label: 'Décroissant', disabled: secondarySortKey === 'none' },
                    { value: 'asc', label: 'Croissant', disabled: secondarySortKey === 'none' },
                  ]}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="app-meta-pill text-xs font-bold">
                  {sortedRows.length} résultat(s) / {payload.rows.length}
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
                  className="app-btn app-btn--xs app-btn--secondary"
                >
                  Exporter CSV ({sortedRows.length})
                </button>
                {searchTerm.trim() ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="app-btn app-btn--xs app-btn--secondary"
                  >
                    Effacer recherche
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Lignes :</span>
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
            </div>

            <div className="app-table-shell overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Statut</th>
                    <th className="px-3 py-2">Match PUBG</th>
                    <th className="px-3 py-2">Carte / mode</th>
                    <th className="px-3 py-2">Taille</th>
                    <th className="px-3 py-2">Parser</th>
                    <th className="px-3 py-2">Analysé le</th>
                    <th className="px-3 py-2">Erreur</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => {
                    const telemetryDataExpired =
                      row.status === 'failed' && isTelemetryDataExpiredError(row.errorCode, row.errorMessage)

                    return (
                      <tr key={row.id} className="app-table-row align-top">
                        <td className="px-3 py-2">
                          <StatusPill
                            status={telemetryDataExpired ? 'expired' : row.status}
                            labelOverride={telemetryDataExpired ? 'Expiré (PUBG)' : row.status}
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                          <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">{row.pubgMatchId}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(row.squadCreatedAt)}</p>
                          {clanId ? (
                            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                              {extractDateSegment(row.squadCreatedAt) ? (
                                <Link
                                  href={`/clans/${clanId}/matches/session/${extractDateSegment(row.squadCreatedAt)}?period=week`}
                                  className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                                >
                                  Session
                                </Link>
                              ) : null}
                              {extractDateSegment(row.squadCreatedAt) ? (
                                <Link
                                  href={`/clans/${clanId}/matches/session/${extractDateSegment(row.squadCreatedAt)}?period=week#match-${row.squadMatchId}`}
                                  className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                                >
                                  Match
                                </Link>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                          <p className="font-semibold text-slate-900 dark:text-white">{row.mapName}</p>
                          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {resolveGameMode(row.gameMode)} · #{row.placement}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                          <p className="font-medium text-slate-900 dark:text-white">{formatBytes(row.bytesDownloaded)}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Header : {formatBytes(row.contentLength)}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                          <p className="font-mono text-xs">{row.parserVersion}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">JSON : {row.hasParsedPayload ? 'oui' : 'non'}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 text-xs">
                          {formatDateTime(row.parsedAt)}
                        </td>
                        <td className="px-3 py-2">
                          {row.errorCode || row.errorMessage ? (
                            <div className="max-w-xs space-y-1">
                              {row.errorCode ? (
                                <span className="inline-block rounded-md bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 font-mono text-[11px] font-bold text-rose-700 dark:text-rose-300">
                                  {row.errorCode}
                                </span>
                              ) : null}
                              {row.errorMessage ? (
                                <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-400" title={row.errorMessage}>
                                  {row.errorMessage}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {sortedRows.length === 0 ? (
                    <tr className="app-table-row">
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        Aucun résultat avec les filtres actuels.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {sortedRows.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Affichage de {(historyPageClamped - 1) * historyPageSize + 1} à{' '}
                  {Math.min(historyPageClamped * historyPageSize, sortedRows.length)} sur {sortedRows.length}
                </p>
                <div className="app-pagination">
                  <button
                    type="button"
                    disabled={historyPageClamped <= 1}
                    onClick={() => setHistoryPage(Math.max(1, historyPageClamped - 1))}
                    aria-label="Page précédente"
                    title="Page précédente"
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
  hint,
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'indigo'
  compact?: boolean
  hint?: string
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'amber'
        ? 'text-amber-700 dark:text-amber-400'
        : tone === 'rose'
          ? 'text-rose-700 dark:text-rose-400'
          : tone === 'indigo'
            ? 'text-indigo-700 dark:text-indigo-400'
            : 'text-slate-900 dark:text-white'

  return (
    <article className="app-panel-muted rounded-xl p-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase font-semibold tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
          <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />
        </div>
        <p className={`mt-2 font-bold ${compact ? 'text-xl' : 'text-2xl'} ${toneClass}`}>{value}</p>
      </div>
      {hint ? (
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 leading-tight">{hint}</p>
      ) : null}
    </article>
  )
}