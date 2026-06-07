'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ClanSectionNav from '@/components/ClanSectionNav'
import SquadMatchList from '@/components/SquadMatchList'
import TeamModeBadge, { teamModeFromMemberCount, type TeamMode } from '@/components/ui/TeamModeBadge'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useSquadMatches } from '@/hooks/useSquadMatches'
import type { SquadMatch, SquadPeriod } from '@/types/squad-matches'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): SquadPeriod {
  return value === 'month' ? 'month' : 'week'
}

function parseGameMode(value: string | null) {
  return value === 'duo' || value === 'trio' || value === 'squad' ? value : undefined
}

function isValidDateSegment(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return false
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  return date.toLocaleDateString('fr-FR', { dateStyle: 'full' })
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

function buildSessionStats(matches: SquadMatch[]) {
  return matches.reduce(
    (acc, match) => {
      acc.totalKills += match.totalKills
      acc.totalDamage += match.totalDamage
      acc.matchCount += 1
      acc.wins += match.isWin ? 1 : 0
      return acc
    },
    {
      totalKills: 0,
      totalDamage: 0,
      matchCount: 0,
      wins: 0,
    }
  )
}

function buildModePerformance(matches: SquadMatch[]) {
  const modes = {
    duo: {
      key: 'duo',
      mode: 'duo' as TeamMode,
      label: 'Duo',
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
      matches: 0,
      kills: 0,
      wins: 0,
      damage: 0,
      durationSeconds: 0,
    },
    trio: {
      key: 'trio',
      mode: 'trio' as TeamMode,
      label: 'Trio',
      tone: 'border-violet-200 bg-violet-50 text-violet-800',
      matches: 0,
      kills: 0,
      wins: 0,
      damage: 0,
      durationSeconds: 0,
    },
    squad: {
      key: 'squad',
      mode: 'squad' as TeamMode,
      label: 'Squad',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      matches: 0,
      kills: 0,
      wins: 0,
      damage: 0,
      durationSeconds: 0,
    },
  }

  for (const match of matches) {
    const mode = modes[teamModeFromMemberCount(match.members.length)]
    mode.matches += 1
    mode.kills += match.totalKills
    mode.damage += match.totalDamage
    mode.durationSeconds += match.durationSeconds
    mode.wins += match.isWin ? 1 : 0
  }

  return [modes.duo, modes.trio, modes.squad]
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function summarizeAggregateWarning(rawWarning: string): { summary: string; details: string | null } {
  const normalized = compactWhitespace(rawWarning)
  if (normalized.length === 0) {
    return {
      summary: 'Recalcul des agrégats en échec.',
      details: null,
    }
  }

  const unknownArgumentMatch = rawWarning.match(/Unknown argument\s+[`']?([A-Za-z0-9_]+)[`']?/)
  if (unknownArgumentMatch) {
    return {
      summary: `Recalcul des agrégats en échec: client Prisma non synchronisé (${unknownArgumentMatch[1]}).`,
      details: rawWarning,
    }
  }

  if (normalized.length <= 220) {
    return {
      summary: normalized.endsWith('.') ? normalized : `${normalized}.`,
      details: null,
    }
  }

  return {
    summary: `${normalized.slice(0, 217)}...`,
    details: rawWarning,
  }
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

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} Ko`
  }

  return `${bytes} o`
}

function formatRuntimeUptime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
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

type FileImportResponse = {
  ok?: boolean
  error?: string
  successCount?: number
  failedCount?: number
  capturedCount?: number
  skippedExistingCount?: number
  alreadyCapturedMatchIds?: string[]
  captureEnabled?: boolean
}

type FileResyncQueueResponse = {
  ok?: boolean
  error?: string
  queuedCount?: number
  alreadyQueuedCount?: number
  queuedMatchIds?: string[]
  alreadyQueuedMatchIds?: string[]
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

const SAFE_RESYNC_BATCH_LIMIT = 1

function getResyncResumeStorageKey(
  clanId: number,
  date: string,
  period: string,
  gameMode?: string
) {
  return `telemetry-resync-resume:${clanId}:${date}:${period}:${gameMode ?? 'all'}`
}

function isNonRetryableResyncError(message: string | null | undefined) {
  const normalized = (message ?? '').toLowerCase()
  return (
    normalized.includes('invalid json object event') ||
    normalized.includes('argumentpath.concat is not a constructor')
  )
}

export default function ClanSessionDatePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const period = useMemo(() => parsePeriod(searchParams.get('period')), [searchParams])
  const gameMode = useMemo(() => parseGameMode(searchParams.get('gameMode')), [searchParams])
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

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  const validDate = isValidDateSegment(params.date)
  const date = validDate && typeof params.date === 'string' ? params.date : null

  const { clanName, mapLabels, squads, loading, error, refresh } = useSquadMatches(
    clanId,
    period,
    gameMode
  )

  const sessionMatches = useMemo(() => {
    if (!date) {
      return []
    }

    return squads.filter((match) => match.createdAt.slice(0, 10) === date)
  }, [date, squads])

  const sessionMatchIds = useMemo(() => sessionMatches.map((match) => match.id), [sessionMatches])

  const resyncEligibleCount = useMemo(
    () =>
      sessionMatches.filter((match) => {
        const status = telemetryFileStatusByMatchId[match.id] ?? 'unknown'
        return status !== 'missing' && status !== 'oversized'
      }).length,
    [sessionMatches, telemetryFileStatusByMatchId]
  )

  const importEligibleIds = useMemo(
    () =>
      selectedMatchIds.filter((matchId) => {
        const status = telemetryFileStatusByMatchId[matchId] ?? 'unknown'
        return status === 'missing'
      }),
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
  }, [date, gameMode, period])

  useEffect(() => {
    if (!clanId || !date || typeof window === 'undefined') {
      return
    }

    const key = getResyncResumeStorageKey(clanId, date, period, gameMode)
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return
    }

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
      setTelemetryFileSyncMessage(
        `Reprise détectée après interruption: ${validIds.length} match(s) restant(s) présélectionné(s).`
      )
      setTelemetryFileSyncTone('warning')
    } catch {
      window.localStorage.removeItem(key)
    }
  }, [clanId, date, gameMode, period])

  useEffect(() => {
    if (!clanId || sessionMatchIds.length === 0) {
      setTelemetryFileStatusByMatchId({})
      return
    }

    let cancelled = false

    async function loadLocalTelemetryFileStatuses() {
      setTelemetryFileStatusLoading(true)
      const initialStatusMap = Object.fromEntries(
        sessionMatchIds.map((matchId) => [matchId, 'unknown' as const])
      )
      setTelemetryFileStatusByMatchId(initialStatusMap)

      try {
        const response = await fetch(`/api/clans/${clanId}/telemetry/resync-files-selected`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            squadMatchIds: sessionMatchIds,
            validateOnly: true,
            recalculateAggregates: false,
          }),
        })

        const payload = (await response.json().catch(() => null)) as FileResyncResponse | null

        if (cancelled || !response.ok || !payload?.ok) {
          return
        }

        const nextStatusMap: Record<string, 'available' | 'missing' | 'oversized' | 'unknown'> = {
          ...initialStatusMap,
        }

        for (const result of payload.results ?? []) {
          if (result.status === 'success') {
            nextStatusMap[result.squadMatchId] = 'available'
          }
        }

        for (const missingId of payload.missingFiles ?? []) {
          nextStatusMap[missingId] = 'missing'
        }

        for (const oversizedId of payload.oversizedFiles ?? []) {
          nextStatusMap[oversizedId] = 'oversized'
        }

        setTelemetryFileStatusByMatchId(nextStatusMap)
      } catch {
        // Keep unknown statuses on preflight failure.
      } finally {
        if (!cancelled) {
          setTelemetryFileStatusLoading(false)
        }
      }
    }

    void loadLocalTelemetryFileStatuses()

    return () => {
      cancelled = true
    }
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
        const response = await fetch(`/api/clans/${clanId}/dev/runtime-status`, {
          method: 'GET',
          cache: 'no-store',
        })

        const payload = (await response.json().catch(() => null)) as RuntimeStatusResponse | null
        if (cancelled) {
          return
        }

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
        if (!cancelled) {
          setRuntimeStatusError('Statut runtime indisponible')
        }
      }
    }

    void loadRuntimeStatus()
    const timer = window.setInterval(() => {
      void loadRuntimeStatus()
    }, 20000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [clanId])

  const sessionStats = useMemo(() => buildSessionStats(sessionMatches), [sessionMatches])
  const modePerformance = useMemo(() => buildModePerformance(sessionMatches), [sessionMatches])

  const sortedSessionDates = useMemo(
    () => Array.from(new Set(squads.map((match) => match.createdAt.slice(0, 10)))).sort((a, b) => b.localeCompare(a)),
    [squads]
  )

  const currentDateIndex = useMemo(() => sortedSessionDates.findIndex((value) => value === date), [date, sortedSessionDates])

  const previousDate = currentDateIndex >= 0 ? sortedSessionDates[currentDateIndex + 1] : undefined
  const nextDate = currentDateIndex > 0 ? sortedSessionDates[currentDateIndex - 1] : undefined

  const backHref = useMemo(() => {
    if (!clanId) {
      return '/clans'
    }

    const paramsBuilder = new URLSearchParams({ period })
    if (gameMode) {
      paramsBuilder.set('gameMode', gameMode)
    }

    return `/clans/${clanId}/matches?${paramsBuilder.toString()}`
  }, [clanId, gameMode, period])

  const sessionHref = useMemo(() => {
    if (!clanId) {
      return (targetDate: string) => `/clans`
    }

    return (targetDate: string) => {
      const paramsBuilder = new URLSearchParams({ period })
      if (gameMode) {
        paramsBuilder.set('gameMode', gameMode)
      }

      return `/clans/${clanId}/matches/session/${targetDate}?${paramsBuilder.toString()}`
    }
  }, [clanId, gameMode, period])

  async function runManualTelemetrySync() {
    if (!clanId || selectedMatchIds.length === 0) {
      return
    }

    setTelemetrySyncLoading(true)
    setTelemetrySyncMessage(null)
    setTelemetrySyncErrors([])
    setTelemetrySyncCaptureNotes([])

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/sync-selected`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          squadMatchIds: selectedMatchIds,
          recalculateAggregates: true,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
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
          }
        | null

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

      const captureNotes: string[] = []
      const captureMaxBytesLabel = payload.captureMaxBytes
        ? `${(payload.captureMaxBytes / (1024 * 1024)).toFixed(1)} Mo`
        : 'limite inconnue'

      captureNotes.push(
        `Captures: ${capturedEntries.length} réussie(s), ${captureNotAttemptedCount + captureDisabledCount} non tentée(s), ${captureFailedCount} en erreur.`
      )

      if (truncatedEntries.length > 0) {
        captureNotes.push(`Fichiers tronqués: ${truncatedEntries.length} (limite ${captureMaxBytesLabel}).`)
      }

      if (captureDisabledCount > 0) {
        captureNotes.push('Raison non tentée: capture désactivée (TELEMETRY_CAPTURE_FIXTURES=false).')
      } else if (captureNotAttemptedCount > 0) {
        captureNotes.push('Raison non tentée: capture non lancée pour certains matchs (échec en amont du flux telemetry).')
      }

      if (captureErrorEntries.length > 0) {
        captureNotes.push(...captureErrorEntries.slice(0, 10))
      }

      let aggregateDetails: string | null = null

      const aggregatePart = payload.aggregatesRecalculated
        ? payload.aggregates
          ? ` Agrégats recalculés: ${payload.aggregates.memberWeaponRows ?? 0} lignes armes membre, ${payload.aggregates.memberTelemetryRows ?? 0} lignes membres, ${payload.aggregates.clanSynergyRows ?? 0} lignes synergies (${payload.aggregates.periodsUpdated ?? 0} période(s)).`
          : payload.aggregatesWarning
            ? (() => {
                const warning = summarizeAggregateWarning(payload.aggregatesWarning)
                aggregateDetails = warning.details
                return ` ${warning.summary}`
              })()
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
    } catch (error) {
      setTelemetrySyncMessage(
        buildNetworkAwareErrorMessage('Echec du resync URL télémétrie.', error)
      )
      setTelemetrySyncAggregateDetails(null)
    } finally {
      setTelemetrySyncLoading(false)
    }
  }

  async function runClearTelemetryOk() {
    if (!clanId || selectedMatchIds.length === 0) {
      return
    }

    setTelemetryClearLoading(true)
    setTelemetryClearMessage(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/clear-selected`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          squadMatchIds: selectedMatchIds,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean
            error?: string
            deletedCount?: number
            deletedFileCount?: number
            alreadyMissingCount?: number
            outOfScopeCount?: number
          }
        | null

      if (!response.ok || !payload?.ok) {
        setTelemetryClearMessage(payload?.error ?? 'Echec de la suppression télémétrie OK.')
        return
      }

      setTelemetryClearMessage(
        `Suppression terminée: ${payload.deletedCount ?? 0} télémétrie OK effacée(s), ${payload.deletedFileCount ?? 0} fichier(s) capturé(s) supprimé(s), ${payload.alreadyMissingCount ?? 0} déjà absente(s), ${payload.outOfScopeCount ?? 0} hors périmètre.`
      )
      setTelemetrySyncMessage(null)
      setTelemetrySyncAggregateDetails(null)
      setTelemetrySyncErrors([])
      setTelemetrySyncCaptureNotes([])
      refresh()
    } catch (error) {
      setTelemetryClearMessage(
        buildNetworkAwareErrorMessage('Echec de la suppression télémétrie OK.', error)
      )
    } finally {
      setTelemetryClearLoading(false)
    }
  }

  async function runResyncTelemetryFromImportedFiles() {
    if (!clanId || !date) {
      return
    }

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
      setTelemetryFileSyncMessage(
        'Aucun match à resync: la sélection est déjà en Parser OK. Activez "Forcer le resync" pour retraiter en mode développement.'
      )
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
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          squadMatchIds: runBatchIds,
          validateOnly: true,
          recalculateAggregates: false,
        }),
      })

      const preflightPayload = (await preflightResponse.json().catch(() => null)) as
        | FileResyncResponse
        | null

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

      setTelemetryFileSyncProgress({
        total: runBatchIds.length,
        completed: 0,
        currentMatchId: runBatchIds[0] ?? null,
        success: 0,
        failed: 0,
      })

      for (let index = 0; index < runBatchIds.length; index += 1) {
        const squadMatchId = runBatchIds[index]
        setTelemetryFileSyncProgress((current) =>
          current
            ? {
                ...current,
                currentMatchId: squadMatchId,
              }
            : current
        )

          try {
            const response = await fetch(`/api/clans/${clanId}/telemetry/resync-files-selected`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                squadMatchIds: [squadMatchId],
                recalculateAggregates: false,
                resetBeforeSync: resetBeforeResync,
              }),
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
                if (nonRetryable) {
                  failedIdsNonRetryable.push(squadMatchId)
                } else {
                  failedIdsRetriable.push(squadMatchId)
                }
                const line = `${squadMatchId}: ${errorMessage}`
                allErrors.push(line)
                runLogs.push(`${nonRetryable ? 'KO DEFINITIF' : 'KO'} ${line}`)
                if (result) {
                  allResults.push(result)
                }
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
          current
            ? {
                ...current,
                completed: index + 1,
                success: successCount,
                failed: failedCount,
              }
            : current
        )

        await new Promise((resolve) => setTimeout(resolve, 600))
      }

      const unprocessedIds = runBatchIds.slice(lastProcessedIndex + 1)
      const remainingIds = Array.from(
        new Set([...failedIdsRetriable, ...unprocessedIds, ...deferredIds])
      )

      let aggregatePayload: FileResyncResponse | null = null
      if (!interruptedReason && successCount > 0 && remainingIds.length === 0) {
        const aggregateResponse = await fetch(`/api/clans/${clanId}/telemetry/resync-files-selected`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            onlyRecalculateAggregates: true,
          }),
        })

        aggregatePayload = (await aggregateResponse.json().catch(() => null)) as
          | FileResyncResponse
          | null
      }

      const totalBytes = allResults
        .filter((entry) => entry.status === 'success')
        .reduce((acc, entry) => acc + (entry.bytesDownloaded ?? 0), 0)
      const bytesPart = totalBytes > 0 ? ` Total parsé: ${formatBytes(totalBytes)}.` : ''

      const aggPart = aggregatePayload?.aggregates
        ? ` Agrégats: ${aggregatePayload.aggregates.periodsUpdated} période(s), ${aggregatePayload.aggregates.memberTelemetryRows} lignes membre, ${aggregatePayload.aggregates.memberWeaponRows} lignes arme.`
        : aggregatePayload?.aggregatesWarning
          ? ` Recalcul agrégats en warning: ${aggregatePayload.aggregatesWarning}`
          : ''

      const remainingPart = remainingIds.length > 0
        ? ` Restants à traiter: ${remainingIds.length}.`
        : ''
      const deferredPart = deferredIds.length > 0
        ? ` Lot sécurisé: ${runBatchIds.length}/${candidateIds.length} traité(s) sur ce lancement.`
        : ''
      const forcePart = forceResync ? ' Mode forcé actif.' : ''
      const resetPart = resetBeforeResync ? ' Réinitialisation DB avant chaque match active.' : ''
      const nonRetryablePart = failedIdsNonRetryable.length > 0
        ? ` ${failedIdsNonRetryable.length} erreur(s) non relançable(s) retirée(s) de la reprise auto.`
        : ''
      const aggregateDeferredPart = !interruptedReason && successCount > 0 && remainingIds.length > 0
        ? ' Recalcul des agrégats différé jusqu\'à la fin de tous les lots.'
        : ''

      if (interruptedReason) {
        setTelemetryFileSyncMessage(
          `Resync interrompu: ${successCount} succès, ${failedCount} échec(s) avant interruption.${remainingPart}${forcePart}${resetPart}${nonRetryablePart} Relancez pour reprendre.`
        )
        setTelemetryFileSyncTone('error')
      } else {
        setTelemetryFileSyncMessage(
          `Resync fichiers terminé: ${successCount} succès, ${failedCount} échec(s).${bytesPart}${aggPart}${deferredPart}${remainingPart}${aggregateDeferredPart}${forcePart}${resetPart}${nonRetryablePart}`
        )
        setTelemetryFileSyncTone(failedCount > 0 || remainingIds.length > 0 ? 'warning' : 'success')
      }
      setTelemetryFileSyncErrors(allErrors)
      setTelemetryFileSyncLogs([...runLogs])

      if (remainingIds.length > 0) {
        setSelectedMatchIds(remainingIds)
        if (typeof window !== 'undefined') {
          const key = getResyncResumeStorageKey(clanId, date, period, gameMode)
          window.localStorage.setItem(key, JSON.stringify({ remainingIds }))
        }
      } else if (typeof window !== 'undefined') {
        const key = getResyncResumeStorageKey(clanId, date, period, gameMode)
        window.localStorage.removeItem(key)
      }

      setTelemetrySyncMessage(null)
      setTelemetrySyncAggregateDetails(null)
      setTelemetrySyncErrors([])
      setTelemetrySyncCaptureNotes([])
      setTelemetryClearMessage(null)
      setTelemetryFileSyncProgress((current) =>
        current
          ? {
              ...current,
              currentMatchId: null,
            }
          : current
      )
      if (!interruptedReason) {
        refresh()
      }
    } catch (error) {
      setTelemetryFileSyncMessage(
        buildNetworkAwareErrorMessage('Echec du resync fichiers telemetry.', error)
      )
      setTelemetryFileSyncTone('error')
    } finally {
      setTelemetryFileSyncProgress((current) =>
        current
          ? {
              ...current,
              currentMatchId: null,
            }
          : current
      )
      setTelemetryFileSyncLoading(false)
    }
  }

  async function enqueueResyncTelemetryFromImportedFiles() {
    if (!clanId || !date) {
      return
    }

    if (selectedMatchIds.length === 0) {
      setTelemetryFileQueueMessage('Selectionnez au moins 1 match avant la mise en file worker.')
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
      setTelemetryFileQueueMessage(
        'Aucun match a enfiler: la selection est deja en Parser OK. Activez "Forcer le resync" pour retraiter.'
      )
      return
    }

    try {
      setTelemetryFileQueueLoading(true)
      setTelemetryFileQueueMessage(null)

      const preflightResponse = await fetch(`/api/clans/${clanId}/telemetry/resync-files-selected`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          squadMatchIds: candidateIds,
          validateOnly: true,
          recalculateAggregates: false,
        }),
      })

      const preflightPayload = (await preflightResponse.json().catch(() => null)) as
        | FileResyncResponse
        | null

      if (!preflightResponse.ok || !preflightPayload?.ok) {
        setTelemetryFileQueueMessage(
          preflightPayload?.error ?? 'Echec de la prevalidation avant mise en file worker.'
        )
        return
      }

      const preflightMissing = preflightPayload.missingFiles ?? []
      const preflightOversized = preflightPayload.oversizedFiles ?? []

      if (preflightMissing.length > 0 || preflightOversized.length > 0) {
        const missingPart = preflightMissing.length > 0
          ? `Fichiers manquants: ${preflightMissing.length}. `
          : ''
        const oversizedPart = preflightOversized.length > 0
          ? `Fichiers trop volumineux: ${preflightOversized.length}${preflightPayload.maxResyncFileBytes ? `, limite ${formatBytes(preflightPayload.maxResyncFileBytes)}` : ''}.`
          : ''

        setTelemetryFileQueueMessage(`Mise en file bloquee. ${missingPart}${oversizedPart}`.trim())
        return
      }

      const queueResponse = await fetch(`/api/clans/${clanId}/telemetry/resync-files-queue`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          squadMatchIds: candidateIds,
          resetBeforeSync: resetBeforeResync,
          recalculateAggregates: true,
        }),
      })

      const queuePayload = (await queueResponse.json().catch(() => null)) as
        | FileResyncQueueResponse
        | null

      if (!queueResponse.ok || !queuePayload?.ok) {
        setTelemetryFileQueueMessage(queuePayload?.error ?? 'Echec de la mise en file worker.')
        return
      }

      const queuedCount = queuePayload.queuedCount ?? 0
      const alreadyQueuedCount = queuePayload.alreadyQueuedCount ?? 0
      const resetPart = resetBeforeResync ? ' reset DB actif.' : ''

      setTelemetryFileQueueMessage(
        `Queue worker: ${queuedCount} job(s) ajoute(s), ${alreadyQueuedCount} deja en cours/file.${resetPart} Lancez \`npm run telemetry:worker\` pour traiter hors serveur web.`
      )
      setTelemetryFileSyncMessage(null)
    } catch (error) {
      setTelemetryFileQueueMessage(
        buildNetworkAwareErrorMessage('Echec de la mise en file worker.', error)
      )
    } finally {
      setTelemetryFileQueueLoading(false)
    }
  }

  async function runFetchTelemetryFilesFromPubg() {
    if (!clanId || selectedMatchIds.length === 0) {
      return
    }

    if (importEligibleIds.length === 0) {
      setTelemetryFetchFilesMessage('Import bloqué: aucun match sélectionné sans fichier local manquant.')
      return
    }

    try {
      setTelemetryFetchFilesLoading(true)
      setTelemetryFetchFilesMessage(null)

      const response = await fetch(`/api/clans/${clanId}/telemetry/fetch-files-selected`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          squadMatchIds: importEligibleIds,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | FileImportResponse
        | null

      if (!response.ok || !payload?.ok) {
        setTelemetryFetchFilesMessage(payload?.error ?? 'Echec du téléchargement des fichiers telemetry depuis PUBG.')
        return
      }

      const disabledPart = payload.captureEnabled === false
        ? ' Capture désactivée (TELEMETRY_CAPTURE_FIXTURES=false).'
        : ''
      const skippedExistingPart = (payload.skippedExistingCount ?? 0) > 0
        ? ` ${payload.skippedExistingCount} fichier(s) déjà présent(s) ignoré(s).`
        : ''

      setTelemetryFetchFilesMessage(
        `Téléchargement PUBG terminé: ${payload.successCount ?? 0} succès, ${payload.failedCount ?? 0} échec(s), ${payload.capturedCount ?? 0} fichier(s) capturé(s).${skippedExistingPart}${disabledPart}`
      )
      setTelemetryFileSyncMessage(null)
      refresh()
    } catch (error) {
      setTelemetryFetchFilesMessage(
        buildNetworkAwareErrorMessage(
          'Echec du téléchargement des fichiers telemetry depuis PUBG.',
          error
        )
      )
    } finally {
      setTelemetryFetchFilesLoading(false)
    }
  }

  function toggleMatchSelection(matchId: string) {
    setSelectedMatchIds((current) =>
      current.includes(matchId)
        ? current.filter((id) => id !== matchId)
        : [...current, matchId]
    )
  }

  function selectAllSessionMatches() {
    setSelectedMatchIds(sessionMatches.map((match) => match.id))
  }

  function clearSelectedSessionMatches() {
    setSelectedMatchIds([])
  }

  if (!clanId || !date) {
    return null
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <header className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Détail par date</p>
          <h1 className="text-2xl font-bold text-gray-900">
            {clanName || `Clan #${clanId}`} | {formatDateLabel(date)}
          </h1>
          <p className="text-sm text-gray-600">
            Détail complet des matchs détectés pour cette date, sur la période {period === 'week' ? 'semaine' : 'mois'}.
          </p>
          <ClanSectionNav clanId={clanId} />
        </div>
      </header>

      <section className="mb-6 rounded border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            href={backHref}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:w-auto"
          >
            Retour aux matchs
          </Link>

          <div className="grid w-full grid-cols-2 gap-2 md:w-auto md:grid-cols-1 md:grid-flow-col md:justify-end">
            {previousDate ? (
              <Link
                href={sessionHref(previousDate)}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
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
              <Link
                href={sessionHref(nextDate)}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
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

      {loading ? <p className="mb-6 text-sm text-gray-600">Chargement de la soirée...</p> : null}
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && sessionMatches.length > 0 ? (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Éliminations soirée</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">{sessionStats.totalKills}</p>
            </article>
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Dégâts soirée</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">{Math.round(sessionStats.totalDamage)}</p>
            </article>
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Taux de victoire</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">
                {sessionStats.matchCount > 0 ? `${((sessionStats.wins / sessionStats.matchCount) * 100).toFixed(1)}%` : '0.0%'}
              </p>
            </article>
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Matchs de la soirée</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">{sessionStats.matchCount}</p>
            </article>
          </section>

          <section className="mb-6 rounded border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Performances duo/trio/squad</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {modePerformance.map((mode) => (
                <article key={mode.key} className={`rounded border p-3 ${mode.tone}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <TeamModeBadge mode={mode.mode} label={mode.label} size="sm" className="shadow-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Matchs</span>
                      <span className="text-right font-semibold tabular-nums">{mode.matches}</span>
                    </p>
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Éliminations</span>
                      <span className="text-right font-semibold tabular-nums">{mode.kills}</span>
                    </p>
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Victoires</span>
                      <span className="text-right font-semibold tabular-nums">{mode.wins}</span>
                    </p>
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Dégâts</span>
                      <span className="text-right font-semibold tabular-nums">{Math.round(mode.damage)}</span>
                    </p>
                    <p className="col-span-2 flex items-baseline justify-between gap-2">
                      <span>Durée</span>
                      <span className="text-right font-semibold tabular-nums">{formatDuration(mode.durationSeconds)}</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <SquadMatchList
            clanId={clanId}
            period={period}
            matches={sessionMatches}
            mapLabels={mapLabels}
            title="Matchs de la soirée"
            description={`Liste complete des ${sessionMatches.length} matchs détectés pour le ${formatDateLabel(date)}.`}
            emptyMessage="Aucun match trouvé pour cette date."
            limit={sessionMatches.length}
            selectable
            selectedMatchIds={selectedMatchIds}
            onToggleMatchSelection={toggleMatchSelection}
            telemetryFileStatusByMatchId={telemetryFileStatusByMatchId}
          />

          <section className="mt-6 rounded border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Récupération télémétrie manuelle</h2>
            <p className="mt-1 text-sm text-gray-600">
              Deux modes: resync fichiers (import local) ou resync URL PUBG sans chargement fichier via stream.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {runtimeStatus ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
                  Serveur dev actif - PID {runtimeStatus.pid} - uptime {formatRuntimeUptime(runtimeStatus.uptimeSec)}
                </span>
              ) : null}
              {runtimeStatus ? (
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700">
                  {runtimeStatus.nodeVersion} - {runtimeStatus.hostname}
                </span>
              ) : null}
              {runtimeStatusError ? (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                  {runtimeStatusError}
                </span>
              ) : null}
            </div>
            <div className="mt-3">
              <Link
                href={`/clans/${clanId}/telemetry/recoveries`}
                className="app-btn app-btn--md app-btn--secondary"
              >
                Ouvrir le suivi des récupérations
              </Link>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllSessionMatches}
                className="app-btn app-btn--md app-btn--secondary"
                disabled={
                  telemetrySyncLoading ||
                  telemetryFetchFilesLoading ||
                  telemetryFileSyncLoading ||
                  sessionMatches.length === 0
                }
              >
                Tout sélectionner
              </button>
              <button
                type="button"
                onClick={clearSelectedSessionMatches}
                className="app-btn app-btn--md app-btn--secondary"
                disabled={
                  telemetrySyncLoading ||
                  telemetryFetchFilesLoading ||
                  telemetryFileSyncLoading ||
                  selectedMatchIds.length === 0
                }
              >
                Vider sélection
              </button>
              <button
                type="button"
                onClick={runFetchTelemetryFilesFromPubg}
                className="app-btn app-btn--md app-btn--secondary"
                disabled={
                  telemetrySyncLoading ||
                  telemetryFetchFilesLoading ||
                  telemetryClearLoading ||
                  telemetryFileSyncLoading ||
                  selectedMatchIds.length === 0 ||
                  telemetryFileStatusLoading ||
                  importEligibleIds.length === 0
                }
              >
                {telemetryFetchFilesLoading
                  ? 'Import PUBG en cours...'
                  : `Import fichiers (${importEligibleIds.length})`}
              </button>
              <button
                type="button"
                onClick={runResyncTelemetryFromImportedFiles}
                className="app-btn app-btn--md app-btn--primary"
                disabled={
                  telemetrySyncLoading ||
                  telemetryFetchFilesLoading ||
                  telemetryClearLoading ||
                  telemetryFileSyncLoading ||
                  selectedMatchIds.length === 0
                }
              >
                {telemetryFileSyncLoading
                  ? 'Resync fichiers en cours...'
                  : `Resync sélection (${selectedMatchIds.length})`}
              </button>
              <button
                type="button"
                onClick={enqueueResyncTelemetryFromImportedFiles}
                className="app-btn app-btn--md app-btn--secondary"
                disabled={
                  telemetrySyncLoading ||
                  telemetryFetchFilesLoading ||
                  telemetryClearLoading ||
                  telemetryFileSyncLoading ||
                  telemetryFileQueueLoading ||
                  selectedMatchIds.length === 0
                }
              >
                {telemetryFileQueueLoading
                  ? 'Mise en file worker...'
                  : `Queue worker (${selectedMatchIds.length})`}
              </button>
              <button
                type="button"
                onClick={runManualTelemetrySync}
                className="app-btn app-btn--md app-btn--secondary"
                disabled={
                  telemetrySyncLoading ||
                  telemetryFetchFilesLoading ||
                  telemetryClearLoading ||
                  telemetryFileSyncLoading ||
                  selectedMatchIds.length === 0
                }
              >
                {telemetrySyncLoading
                  ? 'Resync URL en cours...'
                  : `Resync URL (${selectedMatchIds.length})`}
              </button>
              <button
                type="button"
                onClick={runClearTelemetryOk}
                className="app-btn app-btn--md app-btn--danger"
                disabled={
                  telemetrySyncLoading ||
                  telemetryFetchFilesLoading ||
                  telemetryClearLoading ||
                  telemetryFileSyncLoading ||
                  selectedMatchIds.length === 0
                }
              >
                {telemetryClearLoading
                  ? 'Suppression en cours...'
                  : `Effacer fichiers télémétrie (${selectedMatchIds.length})`}
              </button>
            </div>

            <label className="mt-2 inline-flex items-start gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={forceResync}
                onChange={(event) => setForceResync(event.target.checked)}
                disabled={
                  telemetrySyncLoading ||
                  telemetryFetchFilesLoading ||
                  telemetryClearLoading ||
                  telemetryFileSyncLoading
                }
              />
              <span>
                Forcer le resync des matchs déjà Parser OK (mode développement). La sécurité reste active: lot max {SAFE_RESYNC_BATCH_LIMIT} + reprise automatique.
              </span>
            </label>

            <label className="mt-2 inline-flex items-start gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={resetBeforeResync}
                onChange={(event) => setResetBeforeResync(event.target.checked)}
                disabled={
                  telemetrySyncLoading ||
                  telemetryFetchFilesLoading ||
                  telemetryClearLoading ||
                  telemetryFileSyncLoading
                }
              />
              <span>
                Réinitialiser la ligne télémétrie DB avant resync (recommandé en développement pour éviter les updates cumulés). Les fichiers locaux capturés sont conservés.
              </span>
            </label>

            <p className="mt-2 text-xs text-gray-600">
              Matchs resyncables (fichier local disponible ou inconnu): {resyncEligibleCount}/{sessionMatches.length}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              Resync sécurisé: traitement par lot max {SAFE_RESYNC_BATCH_LIMIT} et reprise automatique sur les restants.
            </p>
            {telemetryFileQueueMessage ? (
              <p className="mt-2 text-xs text-gray-700">{telemetryFileQueueMessage}</p>
            ) : null}
            <p className="mt-1 text-xs text-gray-600">
              Matchs importables (fichier local manquant): {sessionMatches.filter((match) => (telemetryFileStatusByMatchId[match.id] ?? 'unknown') === 'missing').length}/{sessionMatches.length}
            </p>

            {telemetryFetchFilesMessage ? (
              <p className="mt-3 text-sm text-amber-700">{telemetryFetchFilesMessage}</p>
            ) : null}

            {telemetryFileSyncMessage ? (
              <p
                className={`mt-3 text-sm ${
                  telemetryFileSyncTone === 'success'
                    ? 'font-medium text-emerald-700'
                    : telemetryFileSyncTone === 'error'
                      ? 'text-rose-700'
                      : 'text-amber-700'
                }`}
              >
                {telemetryFileSyncMessage}
              </p>
            ) : null}

            {telemetryFileSyncLoading && telemetryFileSyncProgress ? (
              <div className="mt-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                <p>
                  Progression: {telemetryFileSyncProgress.completed}/{telemetryFileSyncProgress.total}
                  {' '}| OK {telemetryFileSyncProgress.success} | KO {telemetryFileSyncProgress.failed}
                </p>
                {telemetryFileSyncProgress.currentMatchId ? (
                  <p className="mt-1 font-medium">
                    Match en cours: {telemetryFileSyncProgress.currentMatchId}
                  </p>
                ) : null}
              </div>
            ) : null}

            {telemetryFileSyncLogs.length > 0 ? (
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs text-gray-700">
                {telemetryFileSyncLogs.slice(-30).map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            ) : null}

            {telemetryFileSyncErrors.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-700">
                {telemetryFileSyncErrors.slice(0, 10).map((errorLine) => (
                  <li key={errorLine}>{errorLine}</li>
                ))}
              </ul>
            ) : null}

            {telemetryClearMessage ? (
              <p className="mt-3 text-sm text-amber-700">{telemetryClearMessage}</p>
            ) : null}

            {telemetrySyncMessage ? (
              <p className="mt-3 text-sm text-gray-700">{telemetrySyncMessage}</p>
            ) : null}

            {telemetrySyncAggregateDetails ? (
              <details className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                <summary className="cursor-pointer font-medium text-gray-800">Voir détail technique</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
                  {telemetrySyncAggregateDetails}
                </pre>
              </details>
            ) : null}

            {telemetrySyncErrors.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-700">
                {telemetrySyncErrors.slice(0, 10).map((errorLine) => (
                  <li key={errorLine}>{errorLine}</li>
                ))}
              </ul>
            ) : null}

            {telemetrySyncCaptureNotes.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
                {telemetrySyncCaptureNotes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}

      {!loading && !error && sessionMatches.length === 0 ? (
        <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-600">Aucun match trouvé pour cette date avec les filtres actuels.</p>
        </section>
      ) : null}
    </main>
  )
}
