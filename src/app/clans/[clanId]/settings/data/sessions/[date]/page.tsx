'use client'

import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  HardDriveDownload,
  type LucideIcon,
  RefreshCw,
  Trash2,
  Workflow,
  Wrench,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import DataSectionHeader from '@/components/clan-settings/DataSectionHeader'
import SquadMatchList from '@/components/SquadMatchList'
import { ConfirmDialog, EmptyState, SectionCard, Tag, toneStyle, type Tone } from '@/components/ui/CharteKit'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useSquadMatches } from '@/hooks/useSquadMatches'
import { sessionDateOf } from '@/lib/match-sessions'
import type { SquadMatch, SquadPeriod } from '@/types/squad-matches'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): SquadPeriod {
  if (value === 'month' || value === 'month-1' || value === 'month-2') {
    return value
  }

  return 'week'
}

function isValidDateSegment(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  return date.toLocaleDateString('fr-FR', { dateStyle: 'full' })
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${bytes} o`
}

function formatRuntimeUptime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function buildNetworkAwareErrorMessage(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalizedMessage = message.toLowerCase()
  const isNetworkFetchError =
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('networkerror') ||
    normalizedMessage.includes('network request failed')
  return isNetworkFetchError
    ? `${prefix} Le serveur semble indisponible (verifiez que npm run dev est actif).`
    : `${prefix} ${message}`
}

function getResyncResumeStorageKey(clanId: number, date: string, period: string) {
  return `telemetry-resync-resume:${clanId}:${date}:${period}:all`
}

function isNonRetryableResyncError(message: string | null | undefined) {
  const normalized = (message ?? '').toLowerCase()
  return (
    normalized.includes('invalid json object event') ||
    normalized.includes('argumentpath.concat is not a constructor')
  )
}

type FileResyncResultEntry = {
  squadMatchId: string
  pubgMatchId?: string
  status: 'success' | 'failed'
  bytesDownloaded?: number
  contentLength?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  positionSamplesCount?: number
  trajectorySegmentsCount?: number
  deathSamplesCount?: number
}

type FileResyncResponse = {
  ok?: boolean
  error?: string
  successCount?: number
  failedCount?: number
  missingFiles?: string[]
  oversizedFiles?: string[]
  maxResyncFileBytes?: number
  validateOnly?: boolean
  onlyRecalculateAggregates?: boolean
  canProceed?: boolean
  resetBeforeSync?: boolean
  aggregatesRecalculated?: boolean
  aggregates?: {
    periodsUpdated: number
    memberTelemetryRows: number
    memberWeaponRows: number
    clanSynergyRows: number
  } | null
  aggregatesWarning?: string | null
  results?: FileResyncResultEntry[]
}

type TelemetrySyncMode = 'direct' | 'capture' | 'queue'

type FileImportResponse = {
  ok?: boolean
  error?: string
  successCount?: number
  failedCount?: number
  capturedCount?: number
  skippedExistingCount?: number
  captureEnabled?: boolean
}

type FileResyncQueueResponse = {
  ok?: boolean
  error?: string
  queuedCount?: number
  alreadyQueuedCount?: number
  queue?: {
    queued?: number
    running?: number
    remaining?: number
    success?: number
    failed?: number
    total?: number
  }
}

type RuntimeStatusResponse = {
  ok?: boolean
  runtime?: {
    pid?: number
    nodeVersion?: string
    uptimeSec?: number
    hostname?: string
  }
}

type QueueLiveStatusResponse = {
  ok?: boolean
  error?: string
  queue?: {
    queued?: number
    running?: number
    success?: number
    failed?: number
    total?: number
  }
  recentJobs?: Array<{
    id: string
    status: string
    message: string | null
    createdAt: string
    startedAt: string | null
    finishedAt: string | null
    duration: number | null
  }>
}

type LiveSyncQueueStatusResponse = {
  ok?: boolean
  error?: string
  queue?: {
    queued?: number
    running?: number
    remaining?: number
    success?: number
    failed?: number
    total?: number
  }
  recentJobs?: Array<{
    id: string
    status: string
    message: string | null
    createdAt: string
    finishedAt: string | null
  }>
}

const SAFE_RESYNC_BATCH_LIMIT = 1

export default function TelemetrySessionDatePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const { isSuperUser } = useAuthSession()

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const period = useMemo(() => parsePeriod(searchParams.get('period')), [searchParams])
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([])
  const [telemetrySyncLoading, setTelemetrySyncLoading] = useState(false)
  const [telemetrySyncMessage, setTelemetrySyncMessage] = useState<string | null>(null)
  const [telemetrySyncAggregateDetails, setTelemetrySyncAggregateDetails] = useState<string | null>(null)
  const [telemetrySyncErrors, setTelemetrySyncErrors] = useState<string[]>([])
  const [telemetrySyncCaptureNotes, setTelemetrySyncCaptureNotes] = useState<string[]>([])
  const [telemetryFetchFilesLoading, setTelemetryFetchFilesLoading] = useState(false)
  const [telemetryFetchFilesMessage, setTelemetryFetchFilesMessage] = useState<string | null>(null)
  const [telemetryFileSyncLoading, setTelemetryFileSyncLoading] = useState(false)
  const [telemetryFileSyncMessage, setTelemetryFileSyncMessage] = useState<string | null>(null)
  const [telemetryFileSyncTone, setTelemetryFileSyncTone] = useState<'success' | 'warning' | 'error'>('warning')
  const [telemetryFileQueueLoading, setTelemetryFileQueueLoading] = useState(false)
  const [telemetryFileQueueMessage, setTelemetryFileQueueMessage] = useState<string | null>(null)
  const [telemetryFileSyncErrors, setTelemetryFileSyncErrors] = useState<string[]>([])
  const [telemetryFileSyncProgress, setTelemetryFileSyncProgress] = useState<{
    total: number
    completed: number
    currentMatchId: string | null
    success: number
    failed: number
  } | null>(null)
  const [telemetryFileSyncLogs, setTelemetryFileSyncLogs] = useState<string[]>([])
  const [telemetryFileStatusByMatchId, setTelemetryFileStatusByMatchId] = useState<
    Record<string, 'available' | 'missing' | 'oversized' | 'unknown'>
  >({})
  const [telemetryFileStatusLoading, setTelemetryFileStatusLoading] = useState(false)
  const [runtimeStatus, setRuntimeStatus] = useState<{
    pid: number
    nodeVersion: string
    uptimeSec: number
    hostname: string
    checkedAt: number
  } | null>(null)
  const [runtimeStatusError, setRuntimeStatusError] = useState<string | null>(null)
  const [forceResync, setForceResync] = useState(false)
  const [resetBeforeResync, setResetBeforeResync] = useState(true)
  const [telemetryClearLoading, setTelemetryClearLoading] = useState(false)
  const [telemetryClearMessage, setTelemetryClearMessage] = useState<string | null>(null)
  const [telemetrySyncMode, setTelemetrySyncMode] = useState<TelemetrySyncMode>('direct')
  const [queueLiveStatus, setQueueLiveStatus] = useState<{
    queued: number
    running: number
    remaining: number
    success: number
    failed: number
    total: number
    updatedAt: number
    recentJobs: Array<{
      id: string
      status: string
      message: string | null
      createdAt: string
      finishedAt: string | null
    }>
  } | null>(null)
  const [queueLiveStatusLoading, setQueueLiveStatusLoading] = useState(false)
  const [queueLiveStatusError, setQueueLiveStatusError] = useState<string | null>(null)
  const [queueCleanupLoading, setQueueCleanupLoading] = useState(false)
  const [queueCleanupMessage, setQueueCleanupMessage] = useState<string | null>(null)
  const [directQueueLiveStatus, setDirectQueueLiveStatus] = useState<{
    queued: number
    running: number
    remaining: number
    success: number
    failed: number
    total: number
    updatedAt: number
    recentJobs: Array<{
      id: string
      status: string
      message: string | null
      createdAt: string
      finishedAt: string | null
    }>
  } | null>(null)
  const [directQueueLiveStatusLoading, setDirectQueueLiveStatusLoading] = useState(false)
  const [directQueueLiveStatusError, setDirectQueueLiveStatusError] = useState<string | null>(null)
  // Confirmation (modale de la charte) avant un effacement de télémétrie ou une annulation des jobs en cours.
  const [confirming, setConfirming] = useState<'clear' | 'cancel' | null>(null)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  const validDate = isValidDateSegment(params.date)
  const date = validDate && typeof params.date === 'string' ? params.date : null

  const { clanName, mapLabels, squads, loading, error, refresh } = useSquadMatches(clanId, period)

  const sessionMatches = useMemo(() => {
    if (!date) return []
    return squads.filter((match) => sessionDateOf(match.createdAt) === date)
  }, [date, squads])

  const sessionMatchIds = useMemo(() => sessionMatches.map((match) => match.id), [sessionMatches])

  const importEligibleIds = useMemo(
    () => selectedMatchIds.filter((matchId) => (telemetryFileStatusByMatchId[matchId] ?? 'unknown') === 'missing'),
    [selectedMatchIds, telemetryFileStatusByMatchId]
  )

  useEffect(() => {
    setSelectedMatchIds([])
    setTelemetrySyncMessage(null)
    setTelemetrySyncAggregateDetails(null)
    setTelemetrySyncErrors([])
    setTelemetrySyncCaptureNotes([])
    setTelemetryFetchFilesMessage(null)
    setTelemetryFileSyncMessage(null)
    setTelemetryFileSyncTone('warning')
    setTelemetryFileQueueMessage(null)
    setTelemetryFileSyncErrors([])
    setTelemetryFileSyncProgress(null)
    setTelemetryFileSyncLogs([])
    setTelemetryFileStatusByMatchId({})
    setForceResync(false)
    setResetBeforeResync(true)
    setTelemetryClearMessage(null)
  }, [date, period])

  useEffect(() => {
    if (!clanId || !date || typeof window === 'undefined') return

    const key = getResyncResumeStorageKey(clanId, date, period)
    const raw = window.localStorage.getItem(key)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as { remainingIds?: string[] } | null
      if (!parsed?.remainingIds || !Array.isArray(parsed.remainingIds)) {
        window.localStorage.removeItem(key)
        return
      }

      const validIds = parsed.remainingIds.filter((id): id is string => typeof id === 'string')
      if (validIds.length === 0) {
        window.localStorage.removeItem(key)
        return
      }

      setSelectedMatchIds(validIds)
      setTelemetryFileSyncMessage(`Reprise détectée après interruption: ${validIds.length} match(s) restant(s) présélectionné(s).`)
      setTelemetryFileSyncTone('warning')
    } catch {
      window.localStorage.removeItem(key)
    }
  }, [clanId, date, period])

  useEffect(() => {
    if (!clanId || sessionMatchIds.length === 0) {
      setTelemetryFileStatusByMatchId({})
      return
    }

    let cancelled = false

    async function loadLocalTelemetryFileStatuses() {
      setTelemetryFileStatusLoading(true)
      const initialStatusMap = Object.fromEntries(sessionMatchIds.map((id) => [id, 'unknown' as const]))
      setTelemetryFileStatusByMatchId(initialStatusMap)

      try {
        const response = await fetch(`/api/clans/${clanId}/telemetry/resync-files-selected`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ squadMatchIds: sessionMatchIds, validateOnly: true, recalculateAggregates: false }),
        })

        const payload = (await response.json().catch(() => null)) as FileResyncResponse | null
        if (cancelled || !response.ok || !payload?.ok) return

        const nextStatusMap: Record<string, 'available' | 'missing' | 'oversized' | 'unknown'> = { ...initialStatusMap }
        for (const result of payload.results ?? []) {
          if (result.status === 'success') nextStatusMap[result.squadMatchId] = 'available'
        }
        for (const id of payload.missingFiles ?? []) nextStatusMap[id] = 'missing'
        for (const id of payload.oversizedFiles ?? []) nextStatusMap[id] = 'oversized'
        setTelemetryFileStatusByMatchId(nextStatusMap)
      } catch {
        // Keep unknown statuses on preflight failure.
      } finally {
        if (!cancelled) setTelemetryFileStatusLoading(false)
      }
    }

    void loadLocalTelemetryFileStatuses()
    return () => { cancelled = true }
  }, [clanId, sessionMatchIds])

  useEffect(() => {
    // État du serveur (PID, hôte) : réservé au SuperUser, inutile d'interroger la route pour les autres
    if (!clanId || !isSuperUser) {
      setRuntimeStatus(null)
      setRuntimeStatusError(null)
      return
    }

    let cancelled = false

    async function loadRuntimeStatus() {
      try {
        const response = await fetch(`/api/clans/${clanId}/dev/runtime-status`, { method: 'GET', cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as RuntimeStatusResponse | null
        if (cancelled) return

        if (!response.ok || !payload?.ok || !payload.runtime?.pid) {
          setRuntimeStatusError('Statut runtime indisponible')
          return
        }

        setRuntimeStatus({
          pid: payload.runtime.pid,
          nodeVersion: payload.runtime.nodeVersion ?? 'inconnue',
          uptimeSec: payload.runtime.uptimeSec ?? 0,
          hostname: payload.runtime.hostname ?? 'n/a',
          checkedAt: Date.now(),
        })
        setRuntimeStatusError(null)
      } catch {
        if (!cancelled) setRuntimeStatusError('Statut runtime indisponible')
      }
    }

    void loadRuntimeStatus()
    const timer = window.setInterval(() => { void loadRuntimeStatus() }, 20000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [clanId, isSuperUser])

  useEffect(() => {
    if (!clanId || telemetrySyncMode !== 'queue') {
      setQueueLiveStatus(null)
      setQueueLiveStatusError(null)
      return
    }

    let cancelled = false

    async function loadQueueLiveStatus(initialLoad: boolean) {
      if (initialLoad) setQueueLiveStatusLoading(true)

      try {
        const response = await fetch(`/api/clans/${clanId}/telemetry/sync-batch-manual`, { method: 'GET', cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as QueueLiveStatusResponse | null
        if (cancelled) return

        if (!response.ok || !payload?.ok) {
          setQueueLiveStatusError(payload?.error ?? 'Statut de file indisponible')
          return
        }

        const queued = payload.queue?.queued ?? 0
        const running = payload.queue?.running ?? 0
        const success = payload.queue?.success ?? 0
        const failed = payload.queue?.failed ?? 0
        const total = payload.queue?.total ?? queued + running + success + failed

        setQueueLiveStatus({
          queued,
          running,
          remaining: queued + running,
          success,
          failed,
          total,
          updatedAt: Date.now(),
          recentJobs: (payload.recentJobs ?? []).slice(0, 5).map((job) => ({
            id: job.id,
            status: job.status,
            message: job.message,
            createdAt: job.createdAt,
            finishedAt: job.finishedAt,
          })),
        })
        setQueueLiveStatusError(null)
      } catch {
        if (!cancelled) setQueueLiveStatusError('Statut de file indisponible')
      } finally {
        if (!cancelled && initialLoad) setQueueLiveStatusLoading(false)
      }
    }

    void loadQueueLiveStatus(true)
    const timer = window.setInterval(() => { void loadQueueLiveStatus(false) }, 5000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [clanId, telemetrySyncMode])

  useEffect(() => {
    if (!clanId || telemetrySyncMode !== 'direct') {
      setDirectQueueLiveStatus(null)
      setDirectQueueLiveStatusError(null)
      return
    }

    let cancelled = false

    async function loadDirectQueueLiveStatus(initialLoad: boolean) {
      if (initialLoad) setDirectQueueLiveStatusLoading(true)

      try {
        const response = await fetch(`/api/clans/${clanId}/telemetry/sync-selected-enqueue`, { method: 'GET', cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as LiveSyncQueueStatusResponse | null
        if (cancelled) return

        if (!response.ok || !payload?.ok) {
          setDirectQueueLiveStatusError(payload?.error ?? 'Statut de file indisponible')
          return
        }

        const queued = payload.queue?.queued ?? 0
        const running = payload.queue?.running ?? 0
        const success = payload.queue?.success ?? 0
        const failed = payload.queue?.failed ?? 0
        const total = payload.queue?.total ?? queued + running + success + failed

        setDirectQueueLiveStatus({
          queued,
          running,
          remaining: payload.queue?.remaining ?? queued + running,
          success,
          failed,
          total,
          updatedAt: Date.now(),
          recentJobs: (payload.recentJobs ?? []).slice(0, 5).map((job) => ({
            id: job.id,
            status: job.status,
            message: job.message,
            createdAt: job.createdAt,
            finishedAt: job.finishedAt,
          })),
        })
        setDirectQueueLiveStatusError(null)
      } catch {
        if (!cancelled) setDirectQueueLiveStatusError('Statut de file indisponible')
      } finally {
        if (!cancelled && initialLoad) setDirectQueueLiveStatusLoading(false)
      }
    }

    void loadDirectQueueLiveStatus(true)
    const timer = window.setInterval(() => { void loadDirectQueueLiveStatus(false) }, 5000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [clanId, telemetrySyncMode])

  const sortedSessionDates = useMemo(
    () => Array.from(new Set(squads.map((match) => sessionDateOf(match.createdAt)))).sort((a, b) => b.localeCompare(a)),
    [squads]
  )

  const currentDateIndex = useMemo(
    () => sortedSessionDates.findIndex((value) => value === date),
    [date, sortedSessionDates]
  )

  const previousDate = currentDateIndex >= 0 ? sortedSessionDates[currentDateIndex + 1] : undefined
  const nextDate = currentDateIndex > 0 ? sortedSessionDates[currentDateIndex - 1] : undefined

  const backHref = useMemo(() => {
    if (!clanId) return '/clans'
    return `/clans/${clanId}/settings/data/sessions?period=${period}`
  }, [clanId, period])

  const sessionHref = useMemo(() => {
    if (!clanId) return (_: string) => '/clans'
    return (targetDate: string) => `/clans/${clanId}/settings/data/sessions/${targetDate}?period=${period}`
  }, [clanId, period])

  async function runManualTelemetrySync() {
    if (!clanId || selectedMatchIds.length === 0) return

    setTelemetrySyncLoading(true)
    setTelemetrySyncMessage(null)
    setTelemetrySyncErrors([])
    setTelemetrySyncCaptureNotes([])
    setTelemetrySyncAggregateDetails(null)

    try {
      // Enqueues into the same live-sync queue the automatic cron uses — the
      // always-running telemetry-resync-worker process (not this web request)
      // downloads, parses and persists the telemetry, so this call returns immediately.
      const response = await fetch(`/api/clans/${clanId}/telemetry/sync-selected-enqueue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ squadMatchIds: selectedMatchIds }),
      })

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        queuedCount?: number
        alreadyQueuedCount?: number
        skippedCount?: number
        selectedCount?: number
        results?: Array<{
          squadMatchId: string
          status: 'queued' | 'already_queued' | 'skipped'
          errorCode?: string | null
          errorMessage?: string | null
        }>
      } | null

      if (!response.ok || !payload?.ok) {
        setTelemetrySyncMessage(payload?.error ?? 'Échec de la mise en file télémétrie.')
        return
      }

      const skippedEntries = (payload.results ?? [])
        .filter((entry) => entry.status === 'skipped')
        .map((entry) => `${entry.squadMatchId}: ${entry.errorMessage ?? 'erreur inconnue'}`)

      setTelemetrySyncMessage(
        `Mise en file terminée: ${payload.queuedCount ?? 0} match(s) mis en file pour le worker télémétrie, ${payload.alreadyQueuedCount ?? 0} déjà en file, ${payload.skippedCount ?? 0} ignoré(s). Le worker (telemetry-resync-worker) les traitera automatiquement.`
      )
      setTelemetrySyncErrors(skippedEntries)
      setTelemetryClearMessage(null)
      refresh()
    } catch (err) {
      setTelemetrySyncMessage(buildNetworkAwareErrorMessage('Échec de la mise en file télémétrie.', err))
    } finally {
      setTelemetrySyncLoading(false)
    }
  }

  async function runClearTelemetryOk() {
    if (!clanId || selectedMatchIds.length === 0) return

    setTelemetryClearLoading(true)
    setTelemetryClearMessage(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/clear-selected`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ squadMatchIds: selectedMatchIds }),
      })

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        deletedCount?: number
        deletedFileCount?: number
        alreadyMissingCount?: number
        outOfScopeCount?: number
      } | null

      if (!response.ok || !payload?.ok) {
        setTelemetryClearMessage(payload?.error ?? 'Échec de la suppression télémétrie OK.')
        return
      }

      setTelemetryClearMessage(
        `Suppression terminée: ${payload.deletedCount ?? 0} télémétrie OK effacée(s), ${payload.deletedFileCount ?? 0} fichier(s) supprimé(s), ${payload.alreadyMissingCount ?? 0} déjà absente(s), ${payload.outOfScopeCount ?? 0} hors périmètre.`
      )
      setTelemetrySyncMessage(null)
      setTelemetrySyncAggregateDetails(null)
      setTelemetrySyncErrors([])
      setTelemetrySyncCaptureNotes([])
      refresh()
    } catch (err) {
      setTelemetryClearMessage(buildNetworkAwareErrorMessage('Échec de la suppression télémétrie OK.', err))
    } finally {
      setTelemetryClearLoading(false)
    }
  }

  async function runResyncTelemetryFromImportedFiles() {
    if (!clanId || !date) return

    if (selectedMatchIds.length === 0) {
      setTelemetryFileSyncMessage('Sélectionnez au moins 1 match avant le resync fichiers.')
      setTelemetryFileSyncTone('error')
      return
    }

    const matchById = new Map(sessionMatches.map((match) => [match.id, match]))
    const alreadySucceededIds = selectedMatchIds.filter(
      (matchId) => matchById.get(matchId)?.telemetry?.status === 'success'
    )
    const candidateIds = forceResync
      ? selectedMatchIds
      : selectedMatchIds.filter((matchId) => !alreadySucceededIds.includes(matchId))

    if (candidateIds.length === 0) {
      setTelemetryFileSyncMessage('Aucun match à resync: la sélection est déjà en Parser OK. Activez "Forcer le resync" pour retraiter.')
      setTelemetryFileSyncTone('warning')
      return
    }

    const runBatchIds = candidateIds.slice(0, SAFE_RESYNC_BATCH_LIMIT)
    const deferredIds = candidateIds.slice(SAFE_RESYNC_BATCH_LIMIT)

    try {
      setTelemetryFileSyncLoading(true)
      setTelemetryFileSyncMessage(null)
      setTelemetryFileSyncTone('warning')
      setTelemetryFileSyncErrors([])
      setTelemetryFileSyncLogs([])

      const preflightResponse = await fetch(`/api/clans/${clanId}/telemetry/resync-files-selected`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ squadMatchIds: runBatchIds, validateOnly: true, recalculateAggregates: false }),
      })

      const preflightPayload = (await preflightResponse.json().catch(() => null)) as FileResyncResponse | null

      if (!preflightResponse.ok || !preflightPayload?.ok) {
        setTelemetryFileSyncMessage(preflightPayload?.error ?? 'Échec de la prévalidation des fichiers telemetry.')
        setTelemetryFileSyncTone('error')
        return
      }

      const preflightMissing = preflightPayload.missingFiles ?? []
      const preflightOversized = preflightPayload.oversizedFiles ?? []

      if (preflightMissing.length > 0 || preflightOversized.length > 0) {
        const missingPart = preflightMissing.length > 0
          ? `Fichiers manquants: ${preflightMissing.length} (${preflightMissing.slice(0, 5).join(', ')}). `
          : ''
        const oversizedPart = preflightOversized.length > 0
          ? `Fichiers trop volumineux: ${preflightOversized.length}${preflightPayload.maxResyncFileBytes ? `, limite ${formatBytes(preflightPayload.maxResyncFileBytes)}` : ''}.`
          : ''
        setTelemetryFileSyncMessage(`Resync bloqué par sécurité. ${missingPart}${oversizedPart}`.trim())
        setTelemetryFileSyncTone('error')
        return
      }

      let successCount = 0
      let failedCount = 0
      const allResults: FileResyncResultEntry[] = []
      const allErrors: string[] = []
      const runLogs: string[] = []
      const failedIdsRetriable: string[] = []
      const failedIdsNonRetryable: string[] = []
      let interruptedReason: string | null = null
      let lastProcessedIndex = -1

      setTelemetryFileSyncProgress({ total: runBatchIds.length, completed: 0, currentMatchId: runBatchIds[0] ?? null, success: 0, failed: 0 })

      for (let index = 0; index < runBatchIds.length; index += 1) {
        const squadMatchId = runBatchIds[index]
        setTelemetryFileSyncProgress((current) => current ? { ...current, currentMatchId: squadMatchId } : current)

        try {
          const response = await fetch(`/api/clans/${clanId}/telemetry/resync-files-selected`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ squadMatchIds: [squadMatchId], recalculateAggregates: false, resetBeforeSync: resetBeforeResync }),
          })

          const payload = (await response.json().catch(() => null)) as FileResyncResponse | null

          if (!response.ok || !payload?.ok) {
            failedCount += 1
            failedIdsRetriable.push(squadMatchId)
            const line = `${squadMatchId}: ${payload?.error ?? 'erreur API resync fichiers'}`
            allErrors.push(line)
            runLogs.push(`KO ${line}`)
          } else {
            const result = payload.results?.[0]
            if (!result || result.status === 'failed') {
              failedCount += 1
              const errorMessage = result?.errorMessage ?? 'erreur inconnue'
              const nonRetryable = isNonRetryableResyncError(errorMessage)
              if (nonRetryable) failedIdsNonRetryable.push(squadMatchId)
              else failedIdsRetriable.push(squadMatchId)
              const line = `${squadMatchId}: ${errorMessage}`
              allErrors.push(line)
              runLogs.push(`${nonRetryable ? 'KO DEFINITIF' : 'KO'} ${line}`)
              if (result) allResults.push(result)
            } else {
              successCount += 1
              allResults.push(result)
              const size = typeof result.bytesDownloaded === 'number' ? ` (${formatBytes(result.bytesDownloaded)})` : ''
              const pos = typeof result.positionSamplesCount === 'number'
                ? ` pos:${result.positionSamplesCount} traj:${result.trajectorySegmentsCount ?? 0} morts:${result.deathSamplesCount ?? 0}`
                : ''
              runLogs.push(`OK ${squadMatchId}${size}${pos}`)
            }
          }
        } catch (requestError) {
          interruptedReason = buildNetworkAwareErrorMessage('Interruption resync fichiers.', requestError)
          runLogs.push(`INTERRUPTION ${squadMatchId}: serveur indisponible`)
          allErrors.push(`${squadMatchId}: interruption (serveur indisponible)`)
          break
        }

        lastProcessedIndex = index
        setTelemetryFileSyncLogs([...runLogs])
        setTelemetryFileSyncProgress((current) =>
          current ? { ...current, completed: index + 1, success: successCount, failed: failedCount } : current
        )
        await new Promise((resolve) => setTimeout(resolve, 600))
      }

      const unprocessedIds = runBatchIds.slice(lastProcessedIndex + 1)
      const remainingIds = Array.from(new Set([...failedIdsRetriable, ...unprocessedIds, ...deferredIds]))

      let aggregatePayload: FileResyncResponse | null = null
      if (!interruptedReason && successCount > 0 && remainingIds.length === 0) {
        const aggregateResponse = await fetch(`/api/clans/${clanId}/telemetry/resync-files-selected`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ onlyRecalculateAggregates: true }),
        })
        aggregatePayload = (await aggregateResponse.json().catch(() => null)) as FileResyncResponse | null
      }

      const totalBytes = allResults.filter((e) => e.status === 'success').reduce((acc, e) => acc + (e.bytesDownloaded ?? 0), 0)
      const bytesPart = totalBytes > 0 ? ` Total parsé: ${formatBytes(totalBytes)}.` : ''
      const aggPart = aggregatePayload?.aggregates
        ? ` Agrégats: ${aggregatePayload.aggregates.periodsUpdated} période(s), ${aggregatePayload.aggregates.memberTelemetryRows} lignes membre, ${aggregatePayload.aggregates.memberWeaponRows} lignes arme.`
        : aggregatePayload?.aggregatesWarning ? ` Recalcul agrégats en warning: ${aggregatePayload.aggregatesWarning}` : ''
      const remainingPart = remainingIds.length > 0 ? ` Restants à traiter: ${remainingIds.length}.` : ''
      const deferredPart = deferredIds.length > 0 ? ` Lot sécurisé: ${runBatchIds.length}/${candidateIds.length} traité(s) sur ce lancement.` : ''
      const nonRetryablePart = failedIdsNonRetryable.length > 0 ? ` ${failedIdsNonRetryable.length} erreur(s) non relançable(s) retirée(s) de la reprise auto.` : ''
      const aggregateDeferredPart = !interruptedReason && successCount > 0 && remainingIds.length > 0 ? ' Recalcul des agrégats différé jusqu\'à la fin de tous les lots.' : ''

      if (interruptedReason) {
        setTelemetryFileSyncMessage(`Resync interrompu: ${successCount} succès, ${failedCount} échec(s) avant interruption.${remainingPart} Relancez pour reprendre.`)
        setTelemetryFileSyncTone('error')
      } else {
        setTelemetryFileSyncMessage(`Resync fichiers terminé: ${successCount} succès, ${failedCount} échec(s).${bytesPart}${aggPart}${deferredPart}${remainingPart}${aggregateDeferredPart}${nonRetryablePart}`)
        setTelemetryFileSyncTone(failedCount > 0 || remainingIds.length > 0 ? 'warning' : 'success')
      }
      setTelemetryFileSyncErrors(allErrors)
      setTelemetryFileSyncLogs([...runLogs])

      if (remainingIds.length > 0) {
        setSelectedMatchIds(remainingIds)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(getResyncResumeStorageKey(clanId, date, period), JSON.stringify({ remainingIds }))
        }
      } else if (typeof window !== 'undefined') {
        window.localStorage.removeItem(getResyncResumeStorageKey(clanId, date, period))
      }

      setTelemetrySyncMessage(null)
      setTelemetrySyncAggregateDetails(null)
      setTelemetrySyncErrors([])
      setTelemetrySyncCaptureNotes([])
      setTelemetryClearMessage(null)
      setTelemetryFileSyncProgress((current) => current ? { ...current, currentMatchId: null } : current)
      if (!interruptedReason) refresh()
    } catch (err) {
      setTelemetryFileSyncMessage(buildNetworkAwareErrorMessage('Échec du resync fichiers telemetry.', err))
      setTelemetryFileSyncTone('error')
    } finally {
      setTelemetryFileSyncProgress((current) => current ? { ...current, currentMatchId: null } : current)
      setTelemetryFileSyncLoading(false)
    }
  }

  async function enqueueResyncTelemetryFromImportedFiles() {
    if (!clanId || !date) return

    if (selectedMatchIds.length === 0) {
      setTelemetryFileQueueMessage('Selectionnez au moins 1 match avant la mise en file worker.')
      return
    }

    const matchById = new Map(sessionMatches.map((match) => [match.id, match]))
    const alreadySucceededIds = selectedMatchIds.filter((id) => matchById.get(id)?.telemetry?.status === 'success')
    const candidateIds = forceResync ? selectedMatchIds : selectedMatchIds.filter((id) => !alreadySucceededIds.includes(id))

    if (candidateIds.length === 0) {
      setTelemetryFileQueueMessage('Aucun match à mettre en file: la sélection est déjà en "Parser OK". Activez "Forcer le resync" pour retraiter.')
      return
    }

    try {
      setTelemetryFileQueueLoading(true)
      setTelemetryFileQueueMessage(null)

      const preflightResponse = await fetch(`/api/clans/${clanId}/telemetry/resync-files-selected`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ squadMatchIds: candidateIds, validateOnly: true, recalculateAggregates: false }),
      })

      const preflightPayload = (await preflightResponse.json().catch(() => null)) as FileResyncResponse | null

      if (!preflightResponse.ok || !preflightPayload?.ok) {
        setTelemetryFileQueueMessage(preflightPayload?.error ?? 'Échec de la prévalidation avant mise en file worker.')
        return
      }

      const preflightMissing = preflightPayload.missingFiles ?? []
      const preflightOversized = preflightPayload.oversizedFiles ?? []

      if (preflightMissing.length > 0 || preflightOversized.length > 0) {
        const missingPart = preflightMissing.length > 0 ? `Fichiers manquants: ${preflightMissing.length}. ` : ''
        const oversizedPart = preflightOversized.length > 0
          ? `Fichiers trop volumineux: ${preflightOversized.length}${preflightPayload.maxResyncFileBytes ? `, limite ${formatBytes(preflightPayload.maxResyncFileBytes)}` : ''}.`
          : ''
        setTelemetryFileQueueMessage(`Mise en file bloquee. ${missingPart}${oversizedPart}`.trim())
        return
      }

      const queueResponse = await fetch(`/api/clans/${clanId}/telemetry/resync-files-queue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ squadMatchIds: candidateIds, resetBeforeSync: resetBeforeResync, recalculateAggregates: true }),
      })

      const queuePayload = (await queueResponse.json().catch(() => null)) as FileResyncQueueResponse | null

      if (!queueResponse.ok || !queuePayload?.ok) {
        setTelemetryFileQueueMessage(queuePayload?.error ?? 'Échec de la mise en file worker.')
        return
      }

      const queuedCount = queuePayload.queuedCount ?? 0
      const alreadyQueuedCount = queuePayload.alreadyQueuedCount ?? 0
      const queueQueued = queuePayload.queue?.queued ?? 0
      const queueRunning = queuePayload.queue?.running ?? 0
      const queueRemaining = queuePayload.queue?.remaining ?? queueQueued + queueRunning
      const queueSuccess = queuePayload.queue?.success ?? 0
      const queueFailed = queuePayload.queue?.failed ?? 0
      const resetPart = resetBeforeResync ? ' Option "Réinitialiser DB" active.' : ''

      setTelemetryFileQueueMessage(
        `Mise en file terminée: ${queuedCount} job(s) ajouté(s), ${alreadyQueuedCount} déjà en file ou en cours. Restant à traiter: ${queueRemaining} (${queueQueued} en attente, ${queueRunning} en cours). Historique: ${queueSuccess} succès, ${queueFailed} échec(s).${resetPart} Lancez \`npm run telemetry:worker\` dans un terminal séparé pour exécuter la file.`
      )
      setTelemetryFileSyncMessage(null)
    } catch (err) {
      setTelemetryFileQueueMessage(buildNetworkAwareErrorMessage('Échec de la mise en file worker.', err))
    } finally {
      setTelemetryFileQueueLoading(false)
    }
  }

  async function runQueueCleanup() {
    if (!clanId) return

    setQueueCleanupLoading(true)
    setQueueCleanupMessage(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/queue-cleanup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-old', cancelMaxAgeMs: 1 }),
      })
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        cancelled?: number
        message?: string
      } | null

      if (!response.ok || !payload?.ok) {
        setQueueCleanupMessage(payload?.error ?? 'Échec du nettoyage de la file.')
        return
      }

      setQueueCleanupMessage(
        payload.cancelled === 0
          ? 'Aucun job en cours à annuler.'
          : `${payload.cancelled} job(s) en cours annulé(s) et marqué(s) en échec.`
      )
    } catch (err) {
      setQueueCleanupMessage(buildNetworkAwareErrorMessage('Échec du nettoyage de la file.', err))
    } finally {
      setQueueCleanupLoading(false)
    }
  }

  async function runFetchTelemetryFilesFromPubg() {
    if (!clanId || selectedMatchIds.length === 0) return

    if (importEligibleIds.length === 0) {
      setTelemetryFetchFilesMessage('Import bloqué: aucun match sélectionné sans fichier local manquant.')
      return
    }

    try {
      setTelemetryFetchFilesLoading(true)
      setTelemetryFetchFilesMessage(null)

      const response = await fetch(`/api/clans/${clanId}/telemetry/fetch-files-selected`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ squadMatchIds: importEligibleIds }),
      })

      const payload = (await response.json().catch(() => null)) as FileImportResponse | null

      if (!response.ok || !payload?.ok) {
        setTelemetryFetchFilesMessage(payload?.error ?? 'Échec du téléchargement des fichiers telemetry depuis PUBG.')
        return
      }

      const disabledPart = payload.captureEnabled === false ? ' Capture désactivée (TELEMETRY_CAPTURE_FIXTURES=false).' : ''
      const skippedPart = (payload.skippedExistingCount ?? 0) > 0 ? ` ${payload.skippedExistingCount} fichier(s) déjà présent(s) ignoré(s).` : ''
      setTelemetryFetchFilesMessage(
        `Téléchargement PUBG terminé: ${payload.successCount ?? 0} succès, ${payload.failedCount ?? 0} échec(s), ${payload.capturedCount ?? 0} fichier(s) capturé(s).${skippedPart}${disabledPart}`
      )
      setTelemetryFileSyncMessage(null)
      refresh()
    } catch (err) {
      setTelemetryFetchFilesMessage(buildNetworkAwareErrorMessage('Échec du téléchargement des fichiers telemetry depuis PUBG.', err))
    } finally {
      setTelemetryFetchFilesLoading(false)
    }
  }

  function toggleMatchSelection(matchId: string) {
    setSelectedMatchIds((current) => current.includes(matchId) ? current.filter((id) => id !== matchId) : [...current, matchId])
  }

  function selectAllSessionMatches() {
    setSelectedMatchIds(sessionMatches.map((match) => match.id))
  }

  function clearSelectedSessionMatches() {
    setSelectedMatchIds([])
  }

  if (!clanId || !date) return null

  const busy = telemetrySyncLoading || telemetryFetchFilesLoading || telemetryClearLoading || telemetryFileSyncLoading
  const dayLabel = formatDateLabel(date)

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    // `.game-ui` : jetons --game-* (couleurs des états de la file).
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <DataSectionHeader
        clanId={clanId}
        title={dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)}
        subtitle={`${clanName || `Clan #${clanId}`} — parties de la soirée et panneau d’exploitation de leur télémétrie.`}
        icon={CalendarDays}
        currentHref={`/clans/${clanId}/settings/data/sessions/${date}`}
        pills={sessionMatches.length > 0 ? [<><span className="t-num">{sessionMatches.length}</span> partie(s)</>] : []}
      />

      <nav aria-label="Soirées voisines" className="flex flex-wrap items-center justify-between gap-2">
        <Link href={backHref} className="app-btn app-btn--sm app-btn--secondary gap-1.5">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Toutes les soirées
        </Link>
        <div className="flex gap-2">
          {previousDate ? (
            <Link href={sessionHref(previousDate)} className="app-btn app-btn--sm app-btn--secondary gap-1.5">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Précédente
            </Link>
          ) : (
            <span className="app-btn app-btn--sm app-btn--secondary cursor-not-allowed gap-1.5 opacity-45" aria-disabled="true">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Précédente
            </span>
          )}
          {nextDate ? (
            <Link href={sessionHref(nextDate)} className="app-btn app-btn--sm app-btn--secondary gap-1.5">
              Suivante
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className="app-btn app-btn--sm app-btn--secondary cursor-not-allowed gap-1.5 opacity-45" aria-disabled="true">
              Suivante
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        </div>
      </nav>

      {loading ? <TableSkeleton /> : null}
      {error ? <p className="t-body t-neg m-0">{error}</p> : null}

      {!loading && !error && sessionMatches.length > 0 ? (
        <>
          <SquadMatchList
            clanId={clanId}
            period={period}
            matches={sessionMatches}
            mapLabels={mapLabels}
            title="Parties de la soirée"
            description={`${sessionMatches.length} partie(s) le ${dayLabel}. Cochez celles à traiter.`}
            emptyMessage="Aucune partie ce jour-là."
            limit={sessionMatches.length}
            selectable
            selectedMatchIds={selectedMatchIds}
            onToggleMatchSelection={toggleMatchSelection}
            telemetryFileStatusByMatchId={telemetryFileStatusByMatchId}
            showAuditLink
          />

          <SectionCard
            id="soiree-recovery"
            icon={Wrench}
            title="Récupération manuelle de la télémétrie"
            meta="Trois modes, appliqués aux parties cochées dans la liste."
            aside={
              runtimeStatus ? (
                <Tag tone="pos">
                  Serveur actif · PID {runtimeStatus.pid} · {formatRuntimeUptime(runtimeStatus.uptimeSec)}
                </Tag>
              ) : runtimeStatusError ? (
                <Tag tone="warn">{runtimeStatusError}</Tag>
              ) : null
            }
          >
            {runtimeStatus ? (
              <p className="t-meta m-0">
                {runtimeStatus.nodeVersion} · {runtimeStatus.hostname}
              </p>
            ) : null}

            <div className="grid gap-2.5 md:grid-cols-3" role="radiogroup" aria-label="Mode de récupération">
              {SOIREE_MODES.map((mode) => {
                const selected = mode.value === telemetrySyncMode
                const Icon = mode.icon
                return (
                  <button
                    key={mode.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTelemetrySyncMode(mode.value)}
                    // Teinte de la tuile choisie en style : les utilitaires perdent contre le fond de `.app-panel-muted`.
                    className={`app-panel-muted flex flex-col gap-1.5 p-3 text-left transition-colors ${selected ? '' : 'hover:bg-gray-50'}`}
                    style={
                      selected
                        ? {
                            borderColor: 'var(--theme-ui-accent-ring)',
                            backgroundColor: 'var(--theme-ui-accent-soft)',
                            boxShadow: '0 0 0 1px var(--theme-ui-accent-ring)',
                          }
                        : undefined
                    }
                  >
                    <span className="flex items-center gap-2">
                      <Icon
                        className={`h-[18px] w-[18px] shrink-0 ${selected ? 'text-[var(--theme-ui-accent-text)]' : 'text-gray-500'}`}
                        aria-hidden="true"
                      />
                      <span className="t-card-title">{mode.title}</span>
                    </span>
                    <span className="t-meta">{mode.description}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="t-meta mr-1">
                <span className="t-num">{selectedMatchIds.length}</span> partie(s) cochée(s)
              </span>
              <button
                type="button"
                onClick={selectAllSessionMatches}
                className="app-btn app-btn--sm app-btn--secondary"
                disabled={busy || sessionMatches.length === 0}
              >
                Tout cocher
              </button>
              <button
                type="button"
                onClick={clearSelectedSessionMatches}
                className="app-btn app-btn--sm app-btn--secondary"
                disabled={busy || selectedMatchIds.length === 0}
              >
                Tout décocher
              </button>
              <Link href={`/clans/${clanId}/settings/data/recoveries`} className="app-link text-xs font-semibold">
                Suivi des récupérations
              </Link>
            </div>

            {telemetrySyncMode === 'direct' ? (
              <div className="flex flex-col gap-3">
                <p className="t-body m-0 text-gray-700">
                  Met les parties cochées en file pour le worker de télémétrie, qui les télécharge et les traite en
                  arrière-plan, sans bloquer le site.
                </p>
                <div>
                  <button
                    type="button"
                    onClick={runManualTelemetrySync}
                    className="app-btn app-btn--md app-btn--primary gap-2"
                    disabled={busy || selectedMatchIds.length === 0}
                  >
                    <Workflow className="h-4 w-4" aria-hidden="true" />
                    {telemetrySyncLoading ? 'Mise en file…' : `Mettre en file (${selectedMatchIds.length})`}
                  </button>
                </div>
                <LiveQueue
                  status={directQueueLiveStatus}
                  loading={directQueueLiveStatusLoading}
                  error={directQueueLiveStatusError}
                />
              </div>
            ) : null}

            {telemetrySyncMode === 'capture' ? (
              <div className="flex flex-col gap-3">
                <p className="t-body m-0 text-gray-700">
                  Télécharge et conserve les fichiers des parties cochées (dossier .telemetry-captured/), sans les traiter.
                  Ensuite : mode « Traiter les fichiers ».
                </p>
                <div>
                  <button
                    type="button"
                    onClick={runFetchTelemetryFilesFromPubg}
                    className="app-btn app-btn--md app-btn--primary gap-2"
                    disabled={busy || selectedMatchIds.length === 0 || telemetryFileStatusLoading || importEligibleIds.length === 0}
                  >
                    <HardDriveDownload className="h-4 w-4" aria-hidden="true" />
                    {telemetryFetchFilesLoading ? 'Capture en cours…' : `Capturer les fichiers (${importEligibleIds.length})`}
                  </button>
                </div>
              </div>
            ) : null}

            {telemetrySyncMode === 'queue' ? (
              <div className="flex flex-col gap-3">
                <p className="t-body m-0 text-gray-700">
                  Traite les fichiers déjà capturés : mise en file pour le worker, ou traitement immédiat.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={enqueueResyncTelemetryFromImportedFiles}
                    className="app-btn app-btn--md app-btn--primary gap-2"
                    disabled={busy || telemetryFileQueueLoading || selectedMatchIds.length === 0}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {telemetryFileQueueLoading ? 'Mise en file…' : `Mettre en file (${selectedMatchIds.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={runResyncTelemetryFromImportedFiles}
                    className="app-btn app-btn--md app-btn--secondary"
                    disabled={busy || selectedMatchIds.length === 0}
                  >
                    {telemetryFileSyncLoading ? 'Traitement en cours…' : `Traiter maintenant (${selectedMatchIds.length})`}
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="t-body flex items-start gap-2 text-gray-900">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-[var(--theme-ui-accent)]"
                      checked={resetBeforeResync}
                      onChange={(event) => setResetBeforeResync(event.target.checked)}
                      disabled={busy}
                    />
                    Effacer la télémétrie existante avant le traitement
                  </label>
                  <label className="t-body flex items-start gap-2 text-gray-900">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-[var(--theme-ui-accent)]"
                      checked={forceResync}
                      onChange={(event) => setForceResync(event.target.checked)}
                      disabled={busy}
                    />
                    Retraiter même les parties déjà analysées
                  </label>
                </div>
                <LiveQueue
                  status={queueLiveStatus}
                  loading={queueLiveStatusLoading}
                  error={queueLiveStatusError}
                  action={
                    <button
                      type="button"
                      onClick={() => setConfirming('cancel')}
                      disabled={queueCleanupLoading}
                      className="app-btn app-btn--sm app-btn--danger"
                    >
                      {queueCleanupLoading ? 'Annulation…' : 'Annuler les jobs en cours'}
                    </button>
                  }
                />
                {queueCleanupMessage ? <p className="t-meta m-0">{queueCleanupMessage}</p> : null}
              </div>
            ) : null}

            {telemetryFetchFilesMessage && telemetrySyncMode === 'capture' ? (
              <Notice tone="sky">{telemetryFetchFilesMessage}</Notice>
            ) : null}
            {telemetryFileQueueMessage && telemetrySyncMode === 'queue' ? <Notice tone="sky">{telemetryFileQueueMessage}</Notice> : null}
            {telemetrySyncMessage && telemetrySyncMode === 'direct' ? <Notice tone="pos">{telemetrySyncMessage}</Notice> : null}
            {telemetryFileSyncMessage && telemetrySyncMode === 'queue' ? (
              <Notice tone={telemetryFileSyncTone === 'success' ? 'pos' : telemetryFileSyncTone === 'error' ? 'neg' : 'warn'}>
                {telemetryFileSyncMessage}
              </Notice>
            ) : null}
            {telemetryClearMessage ? <Notice tone="warn">{telemetryClearMessage}</Notice> : null}

            {telemetrySyncErrors.length > 0 && telemetrySyncMode === 'direct' ? (
              <LineList tone="neg" title="Ignorées" lines={telemetrySyncErrors.slice(0, 5)} />
            ) : null}
            {telemetryFileSyncProgress && telemetrySyncMode === 'queue' ? (
              <Notice tone="sky">
                Progression : {telemetryFileSyncProgress.completed}/{telemetryFileSyncProgress.total} · {telemetryFileSyncProgress.success}{' '}
                réussie(s) · {telemetryFileSyncProgress.failed} échouée(s)
                {telemetryFileSyncProgress.currentMatchId ? ` · en cours : ${telemetryFileSyncProgress.currentMatchId}` : ''}
              </Notice>
            ) : null}
            {telemetryFileSyncLogs.length > 0 && telemetrySyncMode === 'queue' ? (
              <LineList tone="neutral" title="Journal" lines={telemetryFileSyncLogs.slice(-20)} scroll />
            ) : null}
            {telemetryFileSyncErrors.length > 0 && telemetrySyncMode === 'queue' ? (
              <LineList tone="neg" title="Erreurs" lines={telemetryFileSyncErrors.slice(0, 5)} />
            ) : null}

            <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
              <div>
                <button
                  type="button"
                  onClick={() => setConfirming('clear')}
                  className="app-btn app-btn--md app-btn--danger gap-2"
                  disabled={busy || selectedMatchIds.length === 0}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {telemetryClearLoading ? 'Effacement…' : `Effacer la télémétrie (${selectedMatchIds.length})`}
                </button>
              </div>
              <p className="t-meta m-0">
                Supprime les fichiers capturés et les données de télémétrie des parties cochées. Irréversible au-delà des 14
                jours de conservation de PUBG.
              </p>
            </div>
          </SectionCard>
        </>
      ) : null}

      {!loading && !error && sessionMatches.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Aucune partie" text="Aucune partie trouvée pour cette date avec les filtres actuels." />
      ) : null}

      {confirming === 'clear' ? (
        <ConfirmDialog
          icon={Trash2}
          title={`Effacer la télémétrie de ${selectedMatchIds.length} partie(s) ?`}
          confirmLabel="Effacer"
          tone="danger"
          busy={telemetryClearLoading}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null)
            void runClearTelemetryOk()
          }}
        >
          Les fichiers capturés et les données de télémétrie de ces parties sont supprimés. Au-delà de 14 jours, PUBG ne
          fournit plus le fichier : la perte est définitive.
        </ConfirmDialog>
      ) : null}
      {confirming === 'cancel' ? (
        <ConfirmDialog
          icon={XCircle}
          title="Annuler les jobs en cours ?"
          confirmLabel="Annuler les jobs"
          tone="danger"
          busy={queueCleanupLoading}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null)
            void runQueueCleanup()
          }}
        >
          Tous les jobs de traitement du clan en cours d’exécution passent en échec ; ils pourront être relancés depuis
          l’onglet Erreurs.
        </ConfirmDialog>
      ) : null}
    </div>
  )
}

const SOIREE_MODES: Array<{ value: TelemetrySyncMode; title: string; description: string; icon: LucideIcon }> = [
  { value: 'direct', title: 'Mise en file directe', description: 'Le worker télécharge et traite en arrière-plan.', icon: Workflow },
  { value: 'capture', title: 'Capture seule', description: 'Télécharge et conserve les fichiers, sans traitement.', icon: HardDriveDownload },
  { value: 'queue', title: 'Traiter les fichiers', description: 'Traite les fichiers déjà capturés.', icon: RefreshCw },
]

type LiveQueueStatus = {
  queued: number
  running: number
  remaining: number
  success: number
  failed: number
  total: number
  updatedAt: number
  recentJobs: Array<{ id: string; status: string; message: string | null }>
}

const JOB_TONES: Record<string, Tone> = { success: 'pos', failed: 'neg', running: 'sky', queued: 'warn' }

/** État de la file en direct (actualisé toutes les 5 s par la page) : tuiles de chiffres et derniers jobs. */
function LiveQueue({
  status,
  loading,
  error,
  action,
}: {
  status: LiveQueueStatus | null
  loading: boolean
  error: string | null
  action?: React.ReactNode
}) {
  const tiles: Array<{ label: string; value: number; tone: Tone }> = status
    ? [
        { label: 'Restants', value: status.remaining, tone: 'sky' },
        { label: 'En attente', value: status.queued, tone: 'warn' },
        { label: 'En cours', value: status.running, tone: 'sky' },
        { label: 'Réussis', value: status.success, tone: 'pos' },
        { label: 'Échecs', value: status.failed, tone: 'neg' },
        { label: 'Total', value: status.total, tone: 'neutral' },
      ]
    : []
  return (
    <div className="app-panel-muted flex flex-col gap-2.5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="t-label">File en direct · actualisée toutes les 5 s</span>
        {action}
      </div>
      {loading && !status ? <span className="t-meta">Chargement…</span> : null}
      {status ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {tiles.map((tile) => (
              <div key={tile.label} className="app-stat-tile">
                <span className="app-stat-tile__value" style={tile.tone === 'neutral' ? undefined : { color: `var(--game-${tile.tone})` }}>
                  {tile.value}
                </span>
                <span className="app-stat-tile__label">{tile.label}</span>
              </div>
            ))}
          </div>
          <span className="t-meta">Mise à jour : {new Date(status.updatedAt).toLocaleTimeString('fr-FR')}</span>
          {status.recentJobs.length > 0 ? (
            <ul className="m-0 flex max-h-28 list-none flex-col gap-1 overflow-y-auto p-0">
              {status.recentJobs.map((job) => (
                <li key={job.id} className="t-meta flex items-start gap-2">
                  <Tag tone={JOB_TONES[job.status] ?? 'neutral'}>{job.status}</Tag>
                  <span className="min-w-0 break-words">{job.message ?? 'Sans message'}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      {error ? <span className="t-meta t-warn">{error}</span> : null}
    </div>
  )
}

/** Message d'une action : texte coloré par le jeton de jeu, sur fond doux. */
function Notice({ tone, children }: { tone: Exclude<Tone, 'neutral'>; children: React.ReactNode }) {
  return (
    <p className="t-body m-0 rounded-[10px] px-3 py-2" style={toneStyle(tone)} role="status">
      {children}
    </p>
  )
}

function LineList({ tone, title, lines, scroll = false }: { tone: Tone; title: string; lines: string[]; scroll?: boolean }) {
  return (
    <div className="app-panel-muted flex flex-col gap-1.5 p-3">
      <span className="t-label" style={tone === 'neutral' ? undefined : { color: `var(--game-${tone})` }}>
        {title}
      </span>
      <ul className={`t-meta m-0 flex list-disc flex-col gap-1 pl-5 ${scroll ? 'max-h-40 overflow-y-auto' : ''}`}>
        {lines.map((line, index) => (
          <li key={`${index}-${line}`} className="break-words">
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
