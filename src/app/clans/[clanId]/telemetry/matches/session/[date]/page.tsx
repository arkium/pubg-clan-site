'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import SectionNav from '@/components/SectionNav'
import SquadMatchList from '@/components/SquadMatchList'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useSquadMatches } from '@/hooks/useSquadMatches'
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

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function summarizeAggregateWarning(rawWarning: string): { summary: string; details: string | null } {
  const normalized = compactWhitespace(rawWarning)
  if (normalized.length === 0) return { summary: 'Recalcul des agrégats en échec.', details: null }

  const unknownArgumentMatch = rawWarning.match(/Unknown argument\s+[`']?([A-Za-z0-9_]+)[`']?/)
  if (unknownArgumentMatch) {
    return {
      summary: `Recalcul des agrégats en échec: client Prisma non synchronisé (${unknownArgumentMatch[1]}).`,
      details: rawWarning,
    }
  }

  if (normalized.length <= 220) return { summary: normalized.endsWith('.') ? normalized : `${normalized}.`, details: null }
  return { summary: `${normalized.slice(0, 217)}...`, details: rawWarning }
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

const SAFE_RESYNC_BATCH_LIMIT = 1

export default function TelemetrySessionDatePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

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
    return squads.filter((match) => match.createdAt.slice(0, 10) === date)
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
    if (!clanId) {
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
  }, [clanId])

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

  const sortedSessionDates = useMemo(
    () => Array.from(new Set(squads.map((match) => match.createdAt.slice(0, 10)))).sort((a, b) => b.localeCompare(a)),
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
    return `/clans/${clanId}/telemetry/matches?period=${period}`
  }, [clanId, period])

  const sessionHref = useMemo(() => {
    if (!clanId) return (_: string) => '/clans'
    return (targetDate: string) => `/clans/${clanId}/telemetry/matches/session/${targetDate}?period=${period}`
  }, [clanId, period])

  async function runManualTelemetrySync() {
    if (!clanId || selectedMatchIds.length === 0) return

    setTelemetrySyncLoading(true)
    setTelemetrySyncMessage(null)
    setTelemetrySyncErrors([])
    setTelemetrySyncCaptureNotes([])

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/sync-selected`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ squadMatchIds: selectedMatchIds, recalculateAggregates: true }),
      })

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        successCount?: number
        failedCount?: number
        processedCount?: number
        aggregatesRecalculated?: boolean
        aggregates?: {
          periodsUpdated?: number
          memberTelemetryRows?: number
          memberWeaponRows?: number
          clanSynergyRows?: number
        } | null
        aggregatesWarning?: string | null
        captureEnabled?: boolean
        captureMaxBytes?: number
        results?: Array<{
          squadMatchId: string
          status: 'success' | 'failed'
          errorCode?: string | null
          errorMessage: string | null
          captureFilePath?: string
          captureEventCount?: number
          captureBytesRead?: number
          captureWasTruncated?: boolean
          captureError?: string
        }>
      } | null

      if (!response.ok || !payload?.ok) {
        setTelemetrySyncMessage(payload?.error ?? 'Echec de la récupération télémétrie.')
        setTelemetrySyncAggregateDetails(null)
        return
      }

      const failedEntries = (payload.results ?? [])
        .filter((entry) => entry.status === 'failed')
        .map((entry) => `${entry.squadMatchId}: ${entry.errorMessage ?? 'erreur inconnue'}`)

      const capturedEntries = (payload.results ?? []).filter((entry) => !!entry.captureFilePath)
      const truncatedEntries = capturedEntries.filter((entry) => entry.captureWasTruncated === true)
      const captureErrorEntries = (payload.results ?? [])
        .filter((entry) => !!entry.captureError)
        .map((entry) => `${entry.squadMatchId}: ${entry.captureError}`)
      const captureNotAttemptedEntries = (payload.results ?? []).filter(
        (entry) => !entry.captureFilePath && !entry.captureError
      )
      const captureFailedCount = (payload.results ?? []).filter((entry) => !!entry.captureError).length
      const captureDisabledCount = payload.captureEnabled === false ? payload.processedCount ?? 0 : 0
      const captureNotAttemptedCount = Math.max(0, captureNotAttemptedEntries.length - captureDisabledCount)
      const captureMaxBytesLabel = payload.captureMaxBytes
        ? `${(payload.captureMaxBytes / (1024 * 1024)).toFixed(1)} Mo`
        : 'limite inconnue'

      const captureNotes: string[] = [
        `Captures: ${capturedEntries.length} réussie(s), ${captureNotAttemptedCount + captureDisabledCount} non tentée(s), ${captureFailedCount} en erreur.`,
      ]
      if (truncatedEntries.length > 0) captureNotes.push(`Fichiers tronqués: ${truncatedEntries.length} (limite ${captureMaxBytesLabel}).`)
      if (captureDisabledCount > 0) captureNotes.push('Raison non tentée: capture désactivée (TELEMETRY_CAPTURE_FIXTURES=false).')
      else if (captureNotAttemptedCount > 0) captureNotes.push('Raison non tentée: capture non lancée pour certains matchs.')
      if (captureErrorEntries.length > 0) captureNotes.push(...captureErrorEntries.slice(0, 10))

      let aggregateDetails: string | null = null
      const aggregatePart = payload.aggregatesRecalculated
        ? payload.aggregates
          ? ` Agrégats recalculés: ${payload.aggregates.memberWeaponRows ?? 0} lignes armes membre, ${payload.aggregates.memberTelemetryRows ?? 0} lignes membres, ${payload.aggregates.clanSynergyRows ?? 0} lignes synergies (${payload.aggregates.periodsUpdated ?? 0} période(s)).`
          : payload.aggregatesWarning
            ? (() => { const warning = summarizeAggregateWarning(payload.aggregatesWarning!); aggregateDetails = warning.details; return ` ${warning.summary}` })()
            : ' Recalcul des agrégats demandé, sans détail de retour.'
        : ''

      setTelemetrySyncMessage(
        `Resync URL terminé: ${payload.successCount ?? 0} succès, ${payload.failedCount ?? 0} échec(s), ${payload.processedCount ?? 0} match(s) traité(s).${aggregatePart}`
      )
      setTelemetrySyncAggregateDetails(aggregateDetails)
      setTelemetrySyncErrors(failedEntries)
      setTelemetrySyncCaptureNotes(captureNotes)
      setTelemetryClearMessage(null)
      refresh()
    } catch (err) {
      setTelemetrySyncMessage(buildNetworkAwareErrorMessage('Echec du resync URL télémétrie.', err))
      setTelemetrySyncAggregateDetails(null)
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
        setTelemetryClearMessage(payload?.error ?? 'Echec de la suppression télémétrie OK.')
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
      setTelemetryClearMessage(buildNetworkAwareErrorMessage('Echec de la suppression télémétrie OK.', err))
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
        setTelemetryFileSyncMessage(preflightPayload?.error ?? 'Echec de la prevalidation des fichiers telemetry.')
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
      setTelemetryFileSyncMessage(buildNetworkAwareErrorMessage('Echec du resync fichiers telemetry.', err))
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
        setTelemetryFileQueueMessage(preflightPayload?.error ?? 'Echec de la prevalidation avant mise en file worker.')
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
        setTelemetryFileQueueMessage(queuePayload?.error ?? 'Echec de la mise en file worker.')
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
      setTelemetryFileQueueMessage(buildNetworkAwareErrorMessage('Echec de la mise en file worker.', err))
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
        setQueueCleanupMessage(payload?.error ?? 'Echec du nettoyage de la file.')
        return
      }

      setQueueCleanupMessage(
        payload.cancelled === 0
          ? 'Aucun job en cours à annuler.'
          : `${payload.cancelled} job(s) en cours annulé(s) et marqué(s) en échec.`
      )
    } catch (err) {
      setQueueCleanupMessage(buildNetworkAwareErrorMessage('Echec du nettoyage de la file.', err))
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
        setTelemetryFetchFilesMessage(payload?.error ?? 'Echec du téléchargement des fichiers telemetry depuis PUBG.')
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
      setTelemetryFetchFilesMessage(buildNetworkAwareErrorMessage('Echec du téléchargement des fichiers telemetry depuis PUBG.', err))
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

  return (
    <main className="app-container app-main">
      <header className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-5 py-5 text-white shadow-lg">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Télémétrie — Soirée</p>
          <h1 className="text-2xl font-bold tracking-tight">{clanName || `Clan #${clanId}`} | {formatDateLabel(date)}</h1>
          <p className="mt-1 text-sm text-slate-300">
            Récupération télémétrie pour les matchs de cette soirée.
          </p>
        </div>
        <div className="mt-3">
          <SectionNav section="owner-menu" />
        </div>
      </header>

      <section className="app-panel mb-5 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            href={backHref}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:w-auto"
          >
            ← Retour aux soirées
          </Link>

          <div className="grid w-full grid-cols-2 gap-2 md:w-auto md:grid-flow-col md:justify-end">
            {previousDate ? (
              <Link href={sessionHref(previousDate)} className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                <span className="sm:hidden">← Précédente</span>
                <span className="hidden sm:inline">← Soirée précédente</span>
              </Link>
            ) : (
              <span className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-400">
                <span className="sm:hidden">← Précédente</span>
                <span className="hidden sm:inline">← Soirée précédente</span>
              </span>
            )}
            {nextDate ? (
              <Link href={sessionHref(nextDate)} className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                <span className="sm:hidden">Suivante →</span>
                <span className="hidden sm:inline">Soirée suivante →</span>
              </Link>
            ) : (
              <span className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-400">
                <span className="sm:hidden">Suivante →</span>
                <span className="hidden sm:inline">Soirée suivante →</span>
              </span>
            )}
          </div>
        </div>
      </section>

      {loading ? <p className="mb-5 text-sm text-slate-600">Chargement de la soirée...</p> : null}
      {error ? <p className="mb-5 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && sessionMatches.length > 0 ? (
        <>
          <SquadMatchList
            clanId={clanId}
            period={period}
            matches={sessionMatches}
            mapLabels={mapLabels}
            title="Matchs de la soirée"
            description={`${sessionMatches.length} match(s) détecté(s) pour le ${formatDateLabel(date)}.`}
            emptyMessage="Aucun match trouvé pour cette date."
            limit={sessionMatches.length}
            selectable
            selectedMatchIds={selectedMatchIds}
            onToggleMatchSelection={toggleMatchSelection}
            telemetryFileStatusByMatchId={telemetryFileStatusByMatchId}
          />

          <section className="mt-5 app-panel p-4">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Récupération télémétrie manuelle</h2>
              <p className="mt-1 text-sm text-gray-600">Trois modes de récupération adapté à vos besoins.</p>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <div
                onClick={() => setTelemetrySyncMode('direct')}
                className={`border-2 rounded-lg p-4 cursor-pointer transition ${telemetrySyncMode === 'direct' ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-gray-400'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg">⚡ Direct Sync</h3>
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Rapide</span>
                </div>
                <p className="text-sm text-gray-700 mb-3">Télécharge depuis PUBG, capture et traite en une seule opération.</p>
                <ul className="text-xs text-gray-600 space-y-1 mb-3">
                  <li>✓ Résultat immédiat</li>
                  <li>✓ Pas de fichiers locaux</li>
                  <li>⚠ Peut timeout si gros batch</li>
                </ul>
                <div className="text-xs text-gray-500">Reco: &lt;50 matchs</div>
              </div>

              <div
                onClick={() => setTelemetrySyncMode('capture')}
                className={`border-2 rounded-lg p-4 cursor-pointer transition ${telemetrySyncMode === 'capture' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg">📁 Capture seule</h3>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Stockage</span>
                </div>
                <p className="text-sm text-gray-700 mb-3">Télécharge et sauvegarde localement (sans traitement).</p>
                <ul className="text-xs text-gray-600 space-y-1 mb-3">
                  <li>✓ Non-bloquant</li>
                  <li>✓ Fichiers conservés</li>
                  <li>✓ Rejouer anytime</li>
                </ul>
                <div className="text-xs text-gray-500">Reco: 50-1000 matchs</div>
              </div>

              <div
                onClick={() => setTelemetrySyncMode('queue')}
                className={`border-2 rounded-lg p-4 cursor-pointer transition ${telemetrySyncMode === 'queue' ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-gray-400'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg">🔄 Queue Resync</h3>
                  <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Worker</span>
                </div>
                <p className="text-sm text-gray-700 mb-3">Traite fichiers capturés (worker asynchrone).</p>
                <ul className="text-xs text-gray-600 space-y-1 mb-3">
                  <li>✓ Non-bloquant</li>
                  <li>✓ Scalable</li>
                  <li>✓ Reprise auto</li>
                </ul>
                <div className="text-xs text-gray-500">Reco: 100+ matchs</div>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              {runtimeStatus ? (
                <>
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
                    Serveur dev actif - PID {runtimeStatus.pid} - uptime {formatRuntimeUptime(runtimeStatus.uptimeSec)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700">
                    {runtimeStatus.nodeVersion} - {runtimeStatus.hostname}
                  </span>
                </>
              ) : null}
              {runtimeStatusError ? (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">{runtimeStatusError}</span>
              ) : null}
            </div>

            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-gray-700">{selectedMatchIds.length} match(s) sélectionné(s)</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={selectAllSessionMatches} className="app-btn app-btn--sm app-btn--secondary"
                  disabled={telemetrySyncLoading || telemetryFetchFilesLoading || telemetryFileSyncLoading || sessionMatches.length === 0}>
                  Tout sélectionner
                </button>
                <button type="button" onClick={clearSelectedSessionMatches} className="app-btn app-btn--sm app-btn--secondary"
                  disabled={telemetrySyncLoading || telemetryFetchFilesLoading || telemetryFileSyncLoading || selectedMatchIds.length === 0}>
                  Vider sélection
                </button>
                <Link href={`/clans/${clanId}/telemetry/recoveries`} className="app-btn app-btn--sm app-btn--secondary">
                  Suivi récupérations
                </Link>
              </div>
            </div>

            {telemetrySyncMode === 'direct' && (
              <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-4">
                <h3 className="font-semibold text-green-900 mb-2">Mode Direct Sync</h3>
                <p className="text-sm text-green-800 mb-3">
                  Télécharge les matchs sélectionnés depuis PUBG API, les capture localement ET les traite en une seule opération.
                </p>
                <button type="button" onClick={runManualTelemetrySync} className="app-btn app-btn--md app-btn--primary"
                  disabled={telemetrySyncLoading || telemetryFetchFilesLoading || telemetryClearLoading || telemetryFileSyncLoading || selectedMatchIds.length === 0}>
                  {telemetrySyncLoading ? 'Resync URL en cours...' : `Direct Sync (${selectedMatchIds.length} matchs)`}
                </button>
                <label className="mt-3 inline-flex items-start gap-2 text-xs text-green-700">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    checked={forceResync} onChange={(e) => setForceResync(e.target.checked)} disabled={telemetrySyncLoading} />
                  <span>Forcer le resync même si déjà Parser OK (mode dev)</span>
                </label>
              </div>
            )}

            {telemetrySyncMode === 'capture' && (
              <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Mode Capture seule</h3>
                <p className="text-sm text-blue-800 mb-3">
                  Télécharge et sauvegarde les matchs localement dans <code className="bg-white px-1 rounded text-xs">.telemetry-captured/</code> sans les traiter.
                </p>
                <button type="button" onClick={runFetchTelemetryFilesFromPubg} className="app-btn app-btn--md app-btn--primary"
                  disabled={telemetrySyncLoading || telemetryFetchFilesLoading || telemetryClearLoading || telemetryFileSyncLoading || selectedMatchIds.length === 0 || telemetryFileStatusLoading || importEligibleIds.length === 0}>
                  {telemetryFetchFilesLoading ? 'Capture en cours...' : `Capturer fichiers (${importEligibleIds.length})`}
                </button>
                <p className="mt-2 text-xs text-blue-700">Ensuite: utilisez le mode "Queue Resync" pour traiter les fichiers capturés.</p>
              </div>
            )}

            {telemetrySyncMode === 'queue' && (
              <div className="mb-4 rounded-lg bg-purple-50 border border-purple-200 p-4">
                <h3 className="font-semibold text-purple-900 mb-2">Mode File (Queue) Resync</h3>
                <p className="text-sm text-purple-800 mb-3">Ajoute les matchs dans une file traitée en asynchrone par le worker. Non bloquant et scalable.</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button type="button" onClick={enqueueResyncTelemetryFromImportedFiles} className="app-btn app-btn--md app-btn--primary"
                    disabled={telemetrySyncLoading || telemetryFetchFilesLoading || telemetryClearLoading || telemetryFileSyncLoading || telemetryFileQueueLoading || selectedMatchIds.length === 0}>
                    {telemetryFileQueueLoading ? 'Mise en file...' : `Mettre en file (${selectedMatchIds.length})`}
                  </button>
                  <button type="button" onClick={runResyncTelemetryFromImportedFiles} className="app-btn app-btn--md app-btn--secondary"
                    disabled={telemetrySyncLoading || telemetryFetchFilesLoading || telemetryClearLoading || telemetryFileSyncLoading || selectedMatchIds.length === 0}>
                    {telemetryFileSyncLoading ? 'Resync fichiers en cours...' : `Resync immédiat (${selectedMatchIds.length})`}
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-start gap-2 text-xs text-purple-700">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      checked={resetBeforeResync} onChange={(e) => setResetBeforeResync(e.target.checked)}
                      disabled={telemetrySyncLoading || telemetryFetchFilesLoading || telemetryClearLoading || telemetryFileSyncLoading} />
                    <span>Réinitialiser DB avant resync (recommandé en dev)</span>
                  </label>
                  <label className="inline-flex items-start gap-2 text-xs text-purple-700">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      checked={forceResync} onChange={(e) => setForceResync(e.target.checked)}
                      disabled={telemetrySyncLoading || telemetryFetchFilesLoading || telemetryClearLoading || telemetryFileSyncLoading} />
                    <span>Forcer le resync même si déjà Parser OK</span>
                  </label>
                </div>
                <p className="mt-2 text-xs text-purple-700">
                  Lancez <code className="bg-white px-1 rounded">npm run telemetry:worker</code> dans un terminal séparé pour traiter les jobs.
                </p>

                <div className="mt-3 rounded-lg border border-purple-200 bg-white/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-purple-900">Etat de la file en direct</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] text-purple-700">Actualisation auto: 5s</p>
                      <button
                        type="button"
                        onClick={runQueueCleanup}
                        disabled={queueCleanupLoading}
                        className="text-[11px] rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                      >
                        {queueCleanupLoading ? 'Nettoyage...' : 'Annuler jobs bloqués'}
                      </button>
                    </div>
                  </div>
                  {queueCleanupMessage ? (
                    <p className="mt-1 text-[11px] text-rose-700">{queueCleanupMessage}</p>
                  ) : null}
                  {queueLiveStatusLoading && !queueLiveStatus ? <p className="mt-2 text-xs text-purple-700">Chargement du statut...</p> : null}
                  {queueLiveStatus ? (
                    <>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded border border-purple-200 bg-purple-50 px-2 py-1 text-purple-900">Restants: <strong>{queueLiveStatus.remaining}</strong></div>
                        <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-sky-900">En attente: <strong>{queueLiveStatus.queued}</strong></div>
                        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">En cours: <strong>{queueLiveStatus.running}</strong></div>
                        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-900">Succès: <strong>{queueLiveStatus.success}</strong></div>
                        <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-rose-900">Echecs: <strong>{queueLiveStatus.failed}</strong></div>
                        <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-900">Total: <strong>{queueLiveStatus.total}</strong></div>
                      </div>
                      <p className="mt-2 text-[11px] text-purple-700">Derniere mise a jour: {new Date(queueLiveStatus.updatedAt).toLocaleTimeString('fr-FR')}</p>
                      {queueLiveStatus.recentJobs.length > 0 ? (
                        <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[11px] text-purple-800">
                          {queueLiveStatus.recentJobs.map((job) => (
                            <li key={job.id} className="rounded border border-purple-100 bg-purple-50/60 px-2 py-1">
                              <span className="font-medium">{job.status.toUpperCase()}</span>{' - '}{job.message ?? 'Sans message'}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                  {queueLiveStatusError ? <p className="mt-2 text-xs text-amber-800">{queueLiveStatusError}</p> : null}
                </div>
              </div>
            )}

            {telemetryFetchFilesMessage && telemetrySyncMode === 'capture' ? (
              <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm text-blue-800">{telemetryFetchFilesMessage}</p>
              </div>
            ) : null}

            {telemetryFileQueueMessage && telemetrySyncMode === 'queue' ? (
              <div className="mb-4 p-3 rounded-lg bg-purple-50 border border-purple-200">
                <p className="text-sm text-purple-800">{telemetryFileQueueMessage}</p>
              </div>
            ) : null}

            {telemetrySyncMessage && telemetrySyncMode === 'direct' ? (
              <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-sm text-green-800">{telemetrySyncMessage}</p>
              </div>
            ) : null}

            {telemetryFileSyncMessage && telemetrySyncMode === 'queue' ? (
              <div className={`mb-4 p-3 rounded-lg border ${telemetryFileSyncTone === 'success' ? 'bg-emerald-50 border-emerald-200' : telemetryFileSyncTone === 'error' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className={`text-sm ${telemetryFileSyncTone === 'success' ? 'text-emerald-800 font-medium' : telemetryFileSyncTone === 'error' ? 'text-rose-800' : 'text-amber-800'}`}>
                  {telemetryFileSyncMessage}
                </p>
              </div>
            ) : null}

            {telemetryClearMessage ? (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-sm text-amber-800">{telemetryClearMessage}</p>
              </div>
            ) : null}

            {telemetrySyncCaptureNotes.length > 0 && telemetrySyncMode === 'direct' ? (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs font-medium text-amber-900 mb-2">Notes de capture:</p>
                <ul className="text-xs text-amber-800 space-y-1 list-disc pl-5">
                  {telemetrySyncCaptureNotes.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            ) : null}

            {telemetrySyncErrors.length > 0 && telemetrySyncMode === 'direct' ? (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200">
                <p className="text-xs font-medium text-rose-900 mb-2">Erreurs:</p>
                <ul className="text-xs text-rose-800 space-y-1 list-disc pl-5">
                  {telemetrySyncErrors.slice(0, 5).map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            ) : null}

            {telemetryFileSyncProgress && telemetrySyncMode === 'queue' ? (
              <div className="mb-4 p-3 rounded-lg bg-sky-50 border border-sky-200">
                <p className="text-xs text-sky-900">
                  Progression: {telemetryFileSyncProgress.completed}/{telemetryFileSyncProgress.total}
                  {' '}| ✓ {telemetryFileSyncProgress.success} | ✗ {telemetryFileSyncProgress.failed}
                </p>
                {telemetryFileSyncProgress.currentMatchId ? (
                  <p className="text-xs font-medium text-sky-900 mt-1">En cours: {telemetryFileSyncProgress.currentMatchId}</p>
                ) : null}
              </div>
            ) : null}

            {telemetryFileSyncLogs.length > 0 && telemetrySyncMode === 'queue' ? (
              <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-xs font-medium text-gray-900 mb-2">Logs:</p>
                <ul className="text-xs text-gray-700 space-y-1 max-h-40 overflow-y-auto list-disc pl-5">
                  {telemetryFileSyncLogs.slice(-20).map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
                </ul>
              </div>
            ) : null}

            {telemetryFileSyncErrors.length > 0 && telemetrySyncMode === 'queue' ? (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                <p className="text-xs font-medium text-rose-900 mb-2">Erreurs:</p>
                <ul className="text-xs text-rose-800 space-y-1 list-disc pl-5">
                  {telemetryFileSyncErrors.slice(0, 5).map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            ) : null}

            <div className="mt-6 pt-6 border-t border-gray-200">
              <button type="button" onClick={runClearTelemetryOk} className="app-btn app-btn--md app-btn--danger"
                disabled={telemetrySyncLoading || telemetryFetchFilesLoading || telemetryClearLoading || telemetryFileSyncLoading || selectedMatchIds.length === 0}>
                {telemetryClearLoading ? 'Suppression en cours...' : `⚠ Effacer télémétrie (${selectedMatchIds.length})`}
              </button>
              <p className="mt-2 text-xs text-gray-600">
                Supprime les fichiers capturés ET les données télémétrie de la sélection. Cette action est irréversible.
              </p>
            </div>
          </section>
        </>
      ) : null}

      {!loading && !error && sessionMatches.length === 0 ? (
        <section className="app-panel p-4">
          <p className="text-sm text-slate-600">Aucun match trouvé pour cette date avec les filtres actuels.</p>
        </section>
      ) : null}
    </main>
  )
}
