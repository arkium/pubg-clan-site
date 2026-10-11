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
  HardDriveDownload,
  History,
  ListOrdered,
  type LucideIcon,
  Play,
  RefreshCw,
  Server,
  Swords,
  Terminal,
  Wrench,
  X,
  XCircle,
} from 'lucide-react'

import DataSectionHeader, { BANNER_GLASS_BUTTON } from '@/components/clan-settings/DataSectionHeader'
import TelemetryFailuresSection from '@/components/clan-settings/data/TelemetryFailuresSection'
import { Callout, ChoiceMenu, EmptyState, ErrorState, ListSkeleton, SectionCard, Tag, type Tone } from '@/components/ui/CharteKit'
import Pagination from '@/components/ui/Pagination'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SortableTh from '@/components/ui/SortableTh'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { DATA_ANCHORS, dataSessionHref } from '@/lib/clan-data-section'
import { formatPercent } from '@/lib/clan-telemetry-view'
import { resolveGameMode } from '@/lib/pubg-assets'
import { isTelemetryDataExpiredError } from '@/lib/pubg-telemetry/telemetry-error-presentation'

/**
 * Récupérations de la télémétrie d'un clan (onglet de « Données », SuperUser seul — docs/TODO/administration.md §8) :
 * couverture et mises en file en masse, échecs des deux files avec relance, échantillon récent et historique. Le moteur
 * et la file commune sont sur `/settings/telemetry`.
 */

const HISTORY_PAGE_SIZE_OPTIONS = [10, 15, 25] as const

type ClanBacklogStat = {
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
  rows: TelemetryRecoveryRow[]
}

type SortKey = 'updatedAt' | 'status' | 'bytesDownloaded'
type SortDirection = 'asc' | 'desc'

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
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null)
  // Relance la lecture des Échecs (bouton « Actualiser », réparation des JSON).
  const [failuresToken, setFailuresToken] = useState(0)

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
      setFailuresToken((current) => current + 1)
    } catch {
      setBackfillMessage('Échec du backfill telemetry null JSON.')
    } finally {
      setBackfillLoading(false)
    }
  }, [clanId, loadRecoveries])

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      if (!isMounted) return
      await Promise.allSettled([loadClans(), clanId ? loadRecoveries(clanId) : Promise.resolve()])
    }
    void init()

    return () => {
      isMounted = false
    }
  }, [clanId, loadClans, loadRecoveries])

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

  function changeSort(key: SortKey) {
    if (key === primarySortKey) {
      setPrimarySortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
    } else {
      setPrimarySortKey(key)
      setPrimarySortDirection(key === 'status' ? 'asc' : 'desc')
    }
    setHistoryPage(1)
  }

  // Ancre d'arrivée (`#echecs` depuis l'ancien onglet « Erreurs », `#couverture` depuis Santé) : les blocs n'existent
  // qu'une fois les données chargées, le navigateur ne peut donc pas s'y placer seul.
  useEffect(() => {
    if (loading) return
    const target = window.location.hash.slice(1)
    if (target) document.getElementById(target)?.scrollIntoView({ block: 'start' })
  }, [loading])

  function refreshAll() {
    if (!clanId) return
    setRefreshing(true)
    void loadRecoveries(clanId)
    setFailuresToken((current) => current + 1)
  }

  if (!clanId) return null

  const backlog = payload?.backlog

  const header = (
    <DataSectionHeader
      clanId={clanId}
      title="Récupérations"
      subtitle="Téléchargement des fichiers de télémétrie PUBG du clan : couverture et mises en file, échecs à relancer, historique."
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
          <Link href="/settings/telemetry" className="app-btn app-btn--sm app-btn--secondary gap-1.5">
            <Server className="h-4 w-4" aria-hidden="true" />
            Moteur et tous les clans
          </Link>
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

      {backlog ? (
        <SectionCard
          id={DATA_ANCHORS.coverage}
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

          <p className="t-meta m-0 flex flex-wrap items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5 shrink-0 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
            Tout le clan en ligne de commande :
            <code className="font-mono text-xs">npm run telemetry:batch -- --clan {clanId} --all-matches</code>
          </p>
        </SectionCard>
      ) : null}

      <TelemetryFailuresSection clanId={clanId} refreshToken={failuresToken} />

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
                            <RecoveryMatchCell clanId={clanId} row={row} now={refreshedAt} />
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
                      <RecoveryMatchCell clanId={clanId} row={row} now={refreshedAt} />
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

/** Partie d'une ligne, avec sa soirée dans les Données : c'est là qu'on agit sur elle (mise en file, retraitement). */
function RecoveryMatchCell({ clanId, row, now }: { clanId: number; row: TelemetryRecoveryRow; now: number }) {
  const sessionHref = dataSessionHref(clanId, row.squadCreatedAt, new Date(now))
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="m-0 truncate font-mono text-xs font-bold text-gray-900">{row.pubgMatchId}</p>
      <p className="t-meta m-0">{formatDateTime(row.squadCreatedAt)}</p>
      {sessionHref ? (
        <span className="flex flex-wrap gap-2 text-xs">
          <Link href={sessionHref} className="app-link font-semibold">
            Soirée
          </Link>
          <Link href={`${sessionHref}#match-${row.squadMatchId}`} className="app-link font-semibold">
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
