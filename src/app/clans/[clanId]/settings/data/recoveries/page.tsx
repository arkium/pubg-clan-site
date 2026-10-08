'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Download,
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
  Swords,
  Timer,
  TrendingUp,
  Wrench,
  X,
  XCircle,
  Zap,
} from 'lucide-react'

import DataSectionHeader, { BANNER_GLASS_BUTTON } from '@/components/clan-settings/DataSectionHeader'
import { Callout, ChoiceMenu, EmptyState, ErrorState, ListSkeleton, SectionCard, Tag, type Tone } from '@/components/ui/CharteKit'
import Pagination from '@/components/ui/Pagination'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SortableTh from '@/components/ui/SortableTh'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { resolveGameMode } from '@/lib/pubg-assets'
import { isTelemetryDataExpiredError } from '@/lib/pubg-telemetry/telemetry-error-presentation'
import { sessionDateOf } from '@/lib/match-sessions'

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

/** Soirée d'une partie (journée de jeu à Paris), pour le lien vers la page de la soirée. */
function extractDateSegment(value: string) {
  return Number.isNaN(Date.parse(value)) ? null : sessionDateOf(value)
}

const STATUS_TAGS: Record<string, { tone: Tone; label: string }> = {
  success: { tone: 'pos', label: 'Succès' },
  completed: { tone: 'pos', label: 'Succès' },
  ok: { tone: 'pos', label: 'Succès' },
  running: { tone: 'sky', label: 'En cours' },
  queued: { tone: 'warn', label: 'En file' },
  pending: { tone: 'warn', label: 'En attente' },
  failed: { tone: 'neg', label: 'Échec' },
  error: { tone: 'neg', label: 'Échec' },
  expired: { tone: 'neutral', label: 'Expirée (PUBG)' },
}

/** Statut d'un job ou d'une ligne, en pastille de la charte. */
function StatusTag({ status }: { status: string }) {
  const entry = STATUS_TAGS[status.toLowerCase()] ?? { tone: 'neutral' as const, label: status }
  return <Tag tone={entry.tone}>{entry.label}</Tag>
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
  const [secondarySortKey] = useState<SortKey | 'none'>('status')
  const [secondarySortDirection] = useState<SortDirection>('asc')
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
            router.replace(`/login?redirect=${encodeURIComponent(`/clans/${currentClanId}/settings/data/recoveries`)}`)
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
            router.replace(`/login?redirect=${encodeURIComponent(`/clans/${currentClanId}/settings/data/recoveries`)}`)
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

  function changeSort(key: SortKey) {
    if (key === primarySortKey) {
      setPrimarySortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
    } else {
      setPrimarySortKey(key)
      setPrimarySortDirection(key === 'status' ? 'asc' : 'desc')
    }
    setHistoryPage(1)
  }

  function refreshAll() {
    if (!clanId) return
    setRefreshing(true)
    void loadRecoveries(clanId)
    void loadObservability(clanId, observabilityWindow)
  }

  if (!clanId) return null

  const backlog = payload?.backlog
  const engineStatus = payload?.engineStatus

  const header = (
    <DataSectionHeader
      clanId={clanId}
      title="Récupérations"
      subtitle="Téléchargement des fichiers de télémétrie PUBG du clan : file du worker, backlog récupérable, observabilité et historique."
      icon={HardDriveDownload}
      currentHref={`/clans/${clanId}/settings/data/recoveries`}
      pills={backlog ? [<>{formatPercent(backlog.completionRate)} complété</>] : []}
      action={
        <button type="button" className={BANNER_GLASS_BUTTON} onClick={refreshAll} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refreshing ? 'Actualisation…' : 'Actualiser'}
        </button>
      }
    />
  )

  if (loading) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
        {header}
        <ListSkeleton rows={4} />
      </div>
    )
  }

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    // `.game-ui` : jetons --game-* (couleurs des indicateurs et des états).
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      {header}

      <div className="flex flex-wrap items-end justify-between gap-3">
        {clansList.length > 0 ? (
          <div className="flex w-full flex-col gap-1 sm:w-80">
            <span className="t-label">Clan</span>
            <ChoiceMenu
              label="Clan"
              value={String(clanId)}
              options={clansList.map((clan) => ({
                value: String(clan.id),
                label: `${clan.tag ? `[${clan.tag}] ` : ''}${clan.name}`,
              }))}
              onChange={(value) => router.push(`/clans/${value}/settings/data/recoveries`)}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {isSuperUser ? (
            <Link href="/settings/telemetry" className="app-btn app-btn--sm app-btn--secondary gap-1.5">
              <Server className="h-4 w-4" aria-hidden="true" />
              Tous les clans
            </Link>
          ) : null}
          <Link href={`/clans/${clanId}/matches?period=week`} className="app-btn app-btn--sm app-btn--secondary gap-1.5">
            <Swords className="h-4 w-4" aria-hidden="true" />
            Matchs du clan
          </Link>
        </div>
      </div>

      {error ? (
        <section className="app-panel">
          <ErrorState message={error} onRetry={refreshAll} />
        </section>
      ) : null}

      {engineStatus ? (
        <SectionCard
          id="recoveries-engine"
          icon={Server}
          title="Moteur et file d’attente"
          meta="Worker d’ingestion, charge de la file commune et estimation de traitement."
          aside={
            <Tag tone={engineStatus.worker.alive ? 'pos' : 'neg'}>
              {engineStatus.worker.alive ? `Worker actif · PID ${engineStatus.worker.pid ?? '?'}` : 'Worker inactif'}
            </Tag>
          }
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard icon={Clock} label="En attente" value={String(engineStatus.queue.queued)} tone="warn" />
            <MetricCard icon={Activity} label="En cours" value={String(engineStatus.queue.running)} tone="sky" />
            <MetricCard
              icon={ListOrdered}
              label="Restant"
              value={String(engineStatus.queue.remaining)}
              tone={engineStatus.queue.remaining > 0 ? 'warn' : 'neutral'}
            />
            <MetricCard icon={Timer} label="Durée estimée" value={formatDuration(engineStatus.etaSeconds)} />
            <MetricCard icon={Zap} label="Prochain cron" value={formatTime(engineStatus.scheduler.nextDailySyncEstimate)} />
            <MetricCard icon={CheckCircle2} label="Total traités" value={String(engineStatus.queue.total)} />
          </div>
        </SectionCard>
      ) : null}

      {backlog ? (
        <SectionCard
          id="recoveries-backlog"
          icon={Database}
          title="Couverture et backlog du clan"
          meta="Toutes les parties enregistrées du clan. Seules celles de moins de 14 jours sont encore récupérables chez PUBG."
          aside={<span className="app-meta-pill">{formatPercent(backlog.completionRate)} complété</span>}
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleEnqueue('urgent')}
              disabled={enqueueLoading !== null || backlog.urgentBacklog === 0}
              className="app-btn app-btn--sm app-btn--primary gap-1.5"
              title="Met en file les parties de 7 à 14 jours, avant leur expiration définitive"
            >
              <Play className={`h-3.5 w-3.5 ${enqueueLoading === 'urgent' ? 'animate-pulse' : ''}`} aria-hidden="true" />
              {enqueueLoading === 'urgent' ? 'Mise en file…' : `Mettre en file les urgences (${backlog.urgentBacklog})`}
            </button>
            <button
              type="button"
              onClick={() => void handleEnqueue('backlog')}
              disabled={enqueueLoading !== null || backlog.toQueueCount === 0}
              className="app-btn app-btn--sm app-btn--secondary gap-1.5"
              title="Met en file toutes les parties récupérables non encore traitées"
            >
              <HardDriveDownload className={`h-3.5 w-3.5 ${enqueueLoading === 'backlog' ? 'animate-pulse' : ''}`} aria-hidden="true" />
              {enqueueLoading === 'backlog' ? 'Mise en file…' : `Mettre en file le backlog (${backlog.toQueueCount})`}
            </button>
            <button
              type="button"
              onClick={() => void runNullJsonBackfill()}
              disabled={backfillLoading}
              className="app-btn app-btn--sm app-btn--secondary gap-1.5"
              title="Réanalyse les fichiers déjà téléchargés dont le JSON analysé manque"
            >
              <Wrench className={`h-3.5 w-3.5 ${backfillLoading ? 'animate-pulse' : ''}`} aria-hidden="true" />
              {backfillLoading ? 'Réparation…' : 'Réparer les JSON manquants'}
            </button>
          </div>

          {enqueueFeedback ? (
            <div className="flex items-start justify-between gap-2" role="status">
              <p className={`t-body m-0 ${enqueueFeedback.type === 'success' ? 't-pos' : 't-neg'}`}>{enqueueFeedback.message}</p>
              <button
                type="button"
                onClick={() => setEnqueueFeedback(null)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                aria-label="Fermer le message"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {backfillMessage ? (
            <Callout tone="warn" icon={Wrench} title="Réparation des JSON manquants">
              {backfillMessage}
            </Callout>
          ) : null}

          {backlog.totalMatches > 0 ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--game-track)' }} aria-hidden="true">
                <div style={{ width: `${(backlog.completedMatches / backlog.totalMatches) * 100}%`, background: 'var(--game-pos)' }} />
                <div
                  style={{ width: `${(backlog.expiredMatches / backlog.totalMatches) * 100}%`, background: 'var(--theme-ui-text-muted)' }}
                />
                <div style={{ width: `${(backlog.recoverableBacklog / backlog.totalMatches) * 100}%`, background: 'var(--game-sky)' }} />
              </div>
              <div className="t-meta flex flex-wrap items-center gap-x-4 gap-y-1">
                <LegendDot color="var(--game-pos)" label={`Complétées (${backlog.completedMatches})`} />
                <LegendDot color="var(--theme-ui-text-muted)" label={`Expirées définitivement (${backlog.expiredMatches})`} />
                <LegendDot color="var(--game-sky)" label={`Récupérables (${backlog.recoverableBacklog})`} />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard icon={Activity} label="Parties" value={String(backlog.totalMatches)} hint="Historique complet du clan" />
            <MetricCard icon={CheckCircle2} label="Complétées" value={String(backlog.completedMatches)} tone="pos" hint="Télémétrie analysée" />
            <MetricCard icon={History} label="Expirées" value={String(backlog.expiredMatches)} hint="Plus de 14 jours chez PUBG" />
            <MetricCard
              icon={HardDriveDownload}
              label="Récupérables"
              value={String(backlog.recoverableBacklog)}
              tone={backlog.recoverableBacklog > 0 ? 'sky' : 'neutral'}
              hint="Prêtes à télécharger"
            />
            <MetricCard
              icon={AlertTriangle}
              label="Urgentes"
              value={String(backlog.urgentBacklog)}
              tone={backlog.urgentBacklog > 0 ? 'neg' : 'neutral'}
              hint="Expirent sous 7 jours"
            />
            <MetricCard
              icon={ListOrdered}
              label="En file"
              value={`${backlog.inQueueCount} / ${backlog.toQueueCount}`}
              hint="En file / restant"
            />
          </div>
        </SectionCard>
      ) : null}

      {payload ? (
        <>
          <SectionCard
            id="recoveries-sample"
            icon={FileJson}
            title="Échantillon récent"
            meta={`${payload.rows.length} lignes, les ${payload.limit} derniers événements du clan.`}
          >
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <MetricCard icon={Activity} label="Lignes" value={String(payload.summary.total)} />
              <MetricCard icon={CheckCircle2} label="Succès" value={String(payload.summary.success)} tone="pos" />
              <MetricCard icon={XCircle} label="Échecs" value={String(payload.summary.failed)} tone="neg" />
              <MetricCard icon={History} label="Expirées" value={String(payload.summary.expired)} />
              <MetricCard icon={Clock} label="En attente" value={String(payload.summary.pending)} tone="warn" />
              <MetricCard icon={FileJson} label="JSON analysé" value={String(payload.summary.withParsedPayload)} />
            </div>
          </SectionCard>

          <SectionCard
            id="recoveries-health"
            icon={Gauge}
            title="Santé de la télémétrie"
            meta={`Calcul sur ${telemetryKpis.scopedCount} ligne(s) de la période.`}
            aside={<SegmentedControl size="sm" value={kpiWindow} onChange={setKpiWindow} options={WINDOW_OPTIONS} />}
          >
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <MetricCard icon={TrendingUp} label="Taux de succès" value={formatPercent(telemetryKpis.successRate)} tone="pos" />
              <MetricCard icon={Database} label="Lignes observées" value={String(telemetryKpis.scopedCount)} />
              <MetricCard icon={HardDrive} label="Taille médiane" value={formatBytes(telemetryKpis.medianBytes)} />
              <MetricCard
                icon={Timer}
                label="Délai médian"
                value={formatDurationMinutes(telemetryKpis.medianSourceToParseMinutes)}
                hint="De la partie à l’analyse"
              />
            </div>
          </SectionCard>

          <SectionCard
            id="recoveries-observability"
            icon={Activity}
            title="Observabilité des jobs"
            meta="Un job = une partie traitée par le worker de télémétrie (file telemetry_live_sync)."
            aside={
              <SegmentedControl size="sm" value={observabilityWindow} onChange={setObservabilityWindow} options={WINDOW_OPTIONS} />
            }
          >
            {loadingObservability ? <ListSkeleton rows={2} /> : null}
            {observabilityError ? (
              <Callout tone="warn" icon={AlertTriangle} title="Observabilité indisponible">
                {observabilityError}
              </Callout>
            ) : null}
            {!loadingObservability && !observabilityError && observabilityPayload ? (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                  <MetricCard icon={Activity} label="Jobs" value={String(observabilityPayload.summary.runs)} />
                  <MetricCard icon={CheckCircle2} label="Succès" value={String(observabilityPayload.summary.success)} tone="pos" />
                  <MetricCard icon={XCircle} label="Échecs" value={String(observabilityPayload.summary.failed)} tone="neg" />
                  <MetricCard icon={History} label="Expirées" value={String(observabilityPayload.summary.expired)} />
                  <MetricCard icon={HardDriveDownload} label="Téléchargé" value={formatBytes(observabilityPayload.summary.bytesDownloaded)} />
                </div>
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  <MetricCard icon={Database} label="Jobs notés" value={String(observabilityPayload.health.ratedRuns)} hint="Hors expirés" />
                  <MetricCard icon={TrendingUp} label="Taux de succès" value={formatPercent(observabilityPayload.health.successRate)} tone="pos" />
                  <MetricCard icon={AlertTriangle} label="Taux d’échec" value={formatPercent(observabilityPayload.health.failedRate)} tone="neg" />
                  <MetricCard icon={Timer} label="Durée p95" value={formatMilliseconds(observabilityPayload.latency.p95DurationMs)} />
                </div>

                {observabilityPayload.health.alerts.length > 0 ? (
                  <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                    {observabilityPayload.health.alerts.map((alert) => {
                      const tone = alert.status === 'ok' ? 'pos' : 'warn'
                      const format = alert.key === 'duration_p95_ms' ? formatMilliseconds : formatPercent
                      return (
                        <li key={alert.key} className="app-panel-muted flex items-start gap-2.5 px-3 py-2.5">
                          {alert.status === 'ok' ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: `var(--game-${tone})` }} aria-hidden="true" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: `var(--game-${tone})` }} aria-hidden="true" />
                          )}
                          <span className="flex min-w-0 flex-col">
                            <span className="t-body font-semibold text-gray-900">{alert.label}</span>
                            <span className="t-meta">
                              Valeur : {format(alert.value)} · seuil : {format(alert.threshold)}
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}

                <div className="app-table-shell hidden md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="app-table-head">
                      <tr>
                        <th className="t-label px-3 py-2">Début</th>
                        <th className="t-label px-3 py-2">Partie PUBG</th>
                        <th className="t-label px-3 py-2">Statut</th>
                        <th className="t-label px-3 py-2 text-right">Taille</th>
                        <th className="t-label px-3 py-2 text-right">Durée</th>
                      </tr>
                    </thead>
                    <tbody>
                      {observabilityPayload.series.slice(0, 8).map((row) => (
                        <tr key={row.id} className="app-table-row align-top">
                          <td className="px-3 py-2 text-gray-700">{formatDateTime(row.startedAt)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-900">{row.pubgMatchId ?? '—'}</td>
                          <td className="px-3 py-2">
                            <StatusTag status={row.expired ? 'expired' : row.status} />
                          </td>
                          <td className="t-num px-[9px] py-2 text-right text-gray-700">{formatBytes(row.bytesDownloaded)}</td>
                          <td className="t-num px-[9px] py-2 text-right text-gray-700">
                            {row.durationMs !== null ? formatMilliseconds(row.durationMs) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
                  {observabilityPayload.series.slice(0, 8).map((row) => (
                    <li key={row.id} className="app-panel-muted flex flex-col gap-1 px-3 py-2.5">
                      <span className="flex items-center justify-between gap-2">
                        <StatusTag status={row.expired ? 'expired' : row.status} />
                        <span className="t-meta">{formatDateTime(row.startedAt)}</span>
                      </span>
                      <span className="truncate font-mono text-xs text-gray-900">{row.pubgMatchId ?? '—'}</span>
                      <span className="t-meta">
                        {formatBytes(row.bytesDownloaded)} · {row.durationMs !== null ? formatMilliseconds(row.durationMs) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </SectionCard>

          <SectionCard
            id="recoveries-history"
            icon={History}
            title="Historique des récupérations"
            meta={`Les ${payload.rows.length} derniers enregistrements de télémétrie du clan. Tri par les en-têtes du tableau.`}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="t-label">Statut</span>
                <ChoiceMenu
                  label="Statut"
                  value={statusFilter}
                  onChange={(value) => {
                    setStatusFilter(value)
                    setHistoryPage(1)
                  }}
                  options={[
                    { value: 'all', label: 'Tous' },
                    { value: 'success', label: 'Succès' },
                    { value: 'failed', label: 'Échecs' },
                    { value: 'pending', label: 'En attente' },
                  ]}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="t-label">JSON analysé</span>
                <ChoiceMenu
                  label="JSON analysé"
                  value={parserFilter}
                  onChange={(value) => {
                    setParserFilter(value)
                    setHistoryPage(1)
                  }}
                  options={[
                    { value: 'all', label: 'Tous' },
                    { value: 'with-json', label: 'Avec JSON' },
                    { value: 'without-json', label: 'Sans JSON' },
                  ]}
                />
              </div>
              <label className="flex flex-col gap-1">
                <span className="t-label">Recherche</span>
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value)
                    setHistoryPage(1)
                  }}
                  placeholder="Partie, carte, mode, erreur…"
                  className="app-input"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="app-meta-pill">
                  <span className="t-num">{sortedRows.length}</span>&nbsp;/&nbsp;<span className="t-num">{payload.rows.length}</span>
                  &nbsp;résultat(s)
                </span>
                <button
                  type="button"
                  onClick={() => downloadRecoveriesCsv(clanId, sortedRows)}
                  disabled={sortedRows.length === 0}
                  className="app-btn app-btn--sm app-btn--secondary gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Exporter en CSV
                </button>
                {searchTerm.trim() ? (
                  <button type="button" onClick={() => setSearchTerm('')} className="app-link text-xs font-semibold">
                    Effacer la recherche
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <span className="t-meta">Lignes par page</span>
                <SegmentedControl
                  size="sm"
                  value={String(historyPageSize)}
                  onChange={(value) => {
                    setHistoryPageSize(Number(value) as (typeof HISTORY_PAGE_SIZE_OPTIONS)[number])
                    setHistoryPage(1)
                  }}
                  options={HISTORY_PAGE_SIZE_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))}
                />
              </div>
            </div>

            {sortedRows.length === 0 ? (
              <EmptyState icon={History} title="Aucun résultat" text="Aucun enregistrement ne correspond aux filtres actuels." />
            ) : (
              <>
                <div className="app-table-shell hidden md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="app-table-head">
                      <tr>
                        <SortableTh<SortKey> column="status" sortKey={primarySortKey} sortDir={primarySortDirection} onSort={changeSort}>
                          Statut
                        </SortableTh>
                        <th className="t-label px-3 py-2">Partie</th>
                        <th className="t-label px-3 py-2">Carte · mode</th>
                        <SortableTh<SortKey>
                          column="bytesDownloaded"
                          sortKey={primarySortKey}
                          sortDir={primarySortDirection}
                          onSort={changeSort}
                          align="right"
                        >
                          Taille
                        </SortableTh>
                        <SortableTh<SortKey> column="updatedAt" sortKey={primarySortKey} sortDir={primarySortDirection} onSort={changeSort}>
                          Mise à jour
                        </SortableTh>
                        <th className="t-label px-3 py-2">Erreur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => (
                        <tr key={row.id} className="app-table-row align-top">
                          <td className="px-3 py-2">
                            <StatusTag status={rowStatus(row)} />
                          </td>
                          <td className="px-3 py-2">
                            <RecoveryMatchCell clanId={clanId} row={row} />
                          </td>
                          <td className="px-3 py-2">
                            <p className="m-0 font-semibold text-gray-900">{row.mapName}</p>
                            <p className="t-meta m-0">
                              {resolveGameMode(row.gameMode)} · #{row.placement}
                            </p>
                          </td>
                          <td className="px-[9px] py-2 text-right">
                            <p className="t-num m-0 font-semibold text-gray-900">{formatBytes(row.bytesDownloaded)}</p>
                            <p className="t-meta m-0">JSON : {row.hasParsedPayload ? 'oui' : 'non'}</p>
                          </td>
                          <td className="px-3 py-2">
                            <p className="m-0 text-xs text-gray-700">{formatDateTime(row.updatedAt)}</p>
                            <p className="t-meta m-0">Analyse : {formatDateTime(row.parsedAt)}</p>
                          </td>
                          <td className="px-3 py-2">
                            <RecoveryError row={row} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
                  {paginatedRows.map((row) => (
                    <li key={row.id} className="app-panel-muted flex flex-col gap-1.5 px-3 py-2.5">
                      <span className="flex items-center justify-between gap-2">
                        <StatusTag status={rowStatus(row)} />
                        <span className="t-meta">{formatDateTime(row.updatedAt)}</span>
                      </span>
                      <RecoveryMatchCell clanId={clanId} row={row} />
                      <span className="t-meta">
                        {row.mapName} · {resolveGameMode(row.gameMode)} · #{row.placement} · {formatBytes(row.bytesDownloaded)}
                      </span>
                      <RecoveryError row={row} />
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={historyPageClamped}
                  pageCount={historyTotalPages}
                  total={sortedRows.length}
                  pageSize={historyPageSize}
                  onPageChange={setHistoryPage}
                  ariaLabel="Pages de l’historique"
                  itemLabel="Lignes"
                />
              </>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}

/** Statut affiché d'une ligne : un échec dû à un fichier expiré chez PUBG se lit « Expirée ». */
function rowStatus(row: TelemetryRecoveryRow) {
  return row.status === 'failed' && isTelemetryDataExpiredError(row.errorCode, row.errorMessage) ? 'expired' : row.status
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  )
}

function RecoveryMatchCell({ clanId, row }: { clanId: number; row: TelemetryRecoveryRow }) {
  const sessionDate = extractDateSegment(row.squadCreatedAt)
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="m-0 truncate font-mono text-xs font-bold text-gray-900">{row.pubgMatchId}</p>
      <p className="t-meta m-0">{formatDateTime(row.squadCreatedAt)}</p>
      {sessionDate ? (
        <span className="flex flex-wrap gap-2 text-xs">
          <Link href={`/clans/${clanId}/matches/session/${sessionDate}?period=week`} className="app-link font-semibold">
            Soirée
          </Link>
          <Link
            href={`/clans/${clanId}/matches/session/${sessionDate}?period=week#match-${row.squadMatchId}`}
            className="app-link font-semibold"
          >
            Partie
          </Link>
        </span>
      ) : null}
    </div>
  )
}

function RecoveryError({ row }: { row: TelemetryRecoveryRow }) {
  if (!row.errorCode && !row.errorMessage) return <span className="t-meta">—</span>
  return (
    <div className="flex max-w-xs flex-col gap-1">
      {row.errorCode ? (
        <span className="self-start">
          <Tag tone="neg">{row.errorCode}</Tag>
        </span>
      ) : null}
      {row.errorMessage ? (
        <p className="t-meta m-0 line-clamp-2" title={row.errorMessage}>
          {row.errorMessage}
        </p>
      ) : null}
    </div>
  )
}

/** Indicateur compact (charte) : intitulé et icône teintée, valeur en chiffres héros, précision atténuée. */
function MetricCard({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: Tone
  hint?: string
}) {
  const color = tone === 'neutral' ? undefined : `var(--game-${tone})`
  return (
    <div className="app-panel-muted flex min-w-0 flex-col gap-1 px-3 py-2.5">
      <p className="t-label m-0 flex items-center gap-1.5">
        <Icon className="h-[13px] w-[13px] shrink-0" style={{ color: color ?? 'var(--theme-ui-text-muted)' }} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </p>
      <p className="t-hero t-hero--sm m-0 truncate text-gray-900" style={color ? { color } : undefined}>
        {value}
      </p>
      {hint ? <p className="t-meta m-0 leading-tight">{hint}</p> : null}
    </div>
  )
}
