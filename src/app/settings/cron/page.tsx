'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CronAction =
  | 'sync_matches'
  | 'sync_stats'
  | 'sync_telemetry_aggregates'
  | 'sync_lifetime_stats'

type CronHistoryEntry = {
  id: string
  action: string
  status: 'running' | 'success' | 'partial' | 'failed'
  source: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  message: string | null
  details?: unknown
  triggeredBy: number | null
}

type CronCheck = {
  key: string
  label: string
  status: 'ok' | 'warning' | 'error'
  value: string
  hint?: string
}

type CronStatusPayload = {
  ok: boolean
  clanId: number
  actionLabels: Record<string, string>
  health: {
    successRate: number | null
    runningCount: number
    failedCount: number
    completedRecent: number
    totalRecent: number
  }
  checks: {
    total: number
    errors: number
    warnings: number
    items: CronCheck[]
  }
  runtime: {
    webWorker: { cronJobsEnabled: boolean; cronBootstrapEnabled: boolean }
    cronWorker: {
      probeEnabled?: boolean
      available: boolean
      initialized?: boolean
      cronJobsEnabled?: boolean
      reason?: string
    }
  }
  pubgApi: {
    latestRateLimit: {
      limit: number | null
      remaining: number | null
      resetAt: string | null
      observedAt: string
    } | null
  }
  latestByAction: CronHistoryEntry[]
  history: CronHistoryEntry[]
}

type WorkerQueueStats = {
  queued: number
  running: number
  remaining?: number
  success: number
  failed: number
  total: number
  lastSuccessAt?: string | null
}

type WorkerLockInfo = {
  pid: number
  acquiredAt: string
  alive: boolean
} | null

type WorkersPayload = {
  ok: boolean
  resyncWorker: { lock: WorkerLockInfo; queue: WorkerQueueStats; liveSyncQueue?: WorkerQueueStats }
  aggregateWorker: { lock: WorkerLockInfo; queue: WorkerQueueStats }
}

type CronScheduleEntry = {
  key: string
  expression: string
  timezone: string
  source: 'db' | 'env'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KNOWN_ACTIONS = [
  'daily_sync',
  'daily_stats_recalc',
  'daily_lifetime_stats_sync',
  'daily_season_stats_sync',
  'weekly_report_auto',
  'monthly_report_auto',
  'challenge_processing',
  'sync_matches',
  'sync_stats',
  'sync_telemetry_aggregates',
  'sync_lifetime_stats',
] as const

const ACTION_DESCRIPTIONS: Record<CronAction, string> = {
  sync_matches:
    'Récupère les derniers matchs depuis l\'API PUBG et déclenche automatiquement la télémétrie + les stats si de nouveaux matchs sont importés.',
  sync_stats:
    'Recalcule les agrégats de statistiques du clan à partir des matchs déjà en base, sans appel à l\'API PUBG.',
  sync_telemetry_aggregates:
    'Recalcule les périodes d\'agrégats télémétrie (positions, armes, synergies) à partir des données déjà parsées.',
  sync_lifetime_stats:
    'Récupère les statistiques lifetime (toutes saisons confondues) de chaque membre via l\'API PUBG.',
}

const MANUAL_ACTIONS: { action: CronAction; label: string }[] = [
  { action: 'sync_matches', label: 'Sync matchs' },
  { action: 'sync_stats', label: 'Recalcul stats' },
  { action: 'sync_telemetry_aggregates', label: 'Recalcul agrégats télémétrie' },
  { action: 'sync_lifetime_stats', label: 'Sync stats lifetime' },
]

const HISTORY_PAGE_SIZE = 10

const SCHEDULE_LABELS: Record<string, string> = {
  daily_sync: 'Sync quotidien clans',
  daily_stats_recalc: 'Recalcul stats quotidien',
  daily_lifetime_stats_sync: 'Sync lifetime quotidienne',
  daily_season_stats_sync: 'Sync season stats quotidienne',
  clan_online_reminder: 'Rappel présence en ligne',
  weekly_report_reminder: 'Rappel rapport hebdo',
  weekly_report_auto: 'Génération auto rapport hebdo',
  monthly_report_auto: 'Génération auto rapport mensuel',
  challenge_processing: 'Traitement des challenges',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusClass(status: 'ok' | 'warning' | 'error' | 'running' | 'success' | 'partial' | 'failed') {
  if (status === 'ok' || status === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'warning' || status === 'partial' || status === 'running') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-rose-200 bg-rose-50 text-rose-800'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function getDurationLabel(durationMs: number | null | undefined) {
  if (durationMs === null || durationMs === undefined) return '-'
  if (durationMs < 1000) return `${durationMs} ms`
  return `${(durationMs / 1000).toFixed(1)} s`
}

function getLockAgeLabel(acquiredAt: string) {
  const ms = Date.now() - new Date(acquiredAt).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`
  return `${Math.round(ms / 3_600_000)} h`
}

function partitionChecks(items: CronCheck[]) {
  return {
    system: items.filter((c) => !c.key.startsWith('telemetry_') && !c.key.endsWith('_cron')),
    telemetry: items.filter((c) => c.key.startsWith('telemetry_')),
  }
}

function looksLikeCronExpression(value: string) {
  const parts = value.trim().split(/\s+/)
  return parts.length === 5
}

function formatDetailsSnippet(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null
  const d = details as Record<string, unknown>
  const parts: string[] = []
  if (typeof d.importedMatches === 'number') parts.push(`matchs importés: ${d.importedMatches}`)
  if (typeof d.errorsCount === 'number' && d.errorsCount > 0) parts.push(`erreurs: ${d.errorsCount}`)
  if (typeof d.membersTotal === 'number') parts.push(`membres: ${d.membersTotal}`)
  if (typeof d.refreshedCount === 'number') parts.push(`rafraîchis: ${d.refreshedCount}`)
  if (typeof d.seasonRefreshed === 'number') parts.push(`season: ${d.seasonRefreshed}`)
  if (typeof d.masteryRefreshed === 'number') parts.push(`mastery: ${d.masteryRefreshed}`)

  const tele = d.telemetrySync as Record<string, unknown> | undefined
  if (tele && typeof tele === 'object') {
    if (typeof tele.parsed === 'number') parts.push(`télémétrie parsée: ${tele.parsed}`)
    if (typeof tele.failed === 'number' && tele.failed > 0) parts.push(`télémétrie échouée: ${tele.failed}`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CheckGroupTable({ items, title, description }: { items: CronCheck[]; title: string; description: string }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="app-table-shell overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Variable</th>
              <th className="px-2 py-2">État</th>
              <th className="px-2 py-2">Valeur</th>
              <th className="px-2 py-2">Info</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key} className="app-table-row align-top">
                <td className="px-2 py-2 font-mono text-xs font-medium text-slate-900">{item.label}</td>
                <td className="px-2 py-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(item.status)}`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-2 py-2 font-mono text-xs text-slate-700">{item.value}</td>
                <td className="px-2 py-2 text-xs text-slate-600">{item.hint ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScheduleEditorTable({
  schedules,
  drafts,
  busyKey,
  feedback,
  onDraftChange,
  onApply,
  onReset,
}: {
  schedules: CronScheduleEntry[]
  drafts: Record<string, string>
  busyKey: string | null
  feedback: Record<string, { type: 'error' | 'success'; message: string }>
  onDraftChange: (key: string, value: string) => void
  onApply: (key: string) => void
  onReset: (key: string) => void
}) {
  if (schedules.length === 0) {
    return <p className="text-xs text-slate-500">Chargement des schedules...</p>
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-slate-800">Schedules cron</p>
        <p className="text-xs text-slate-500">
          Expressions cron actives (fuseau {schedules[0]?.timezone ?? 'UTC'}). Modifiable sans redémarrage —
          appliqué immédiatement au process courant.
        </p>
      </div>
      <div className="app-table-shell overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Tâche</th>
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2">Expression</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((entry) => {
              const draft = drafts[entry.key] ?? entry.expression
              const isBusy = busyKey === entry.key
              const rowFeedback = feedback[entry.key]
              return (
                <tr key={entry.key} className="app-table-row align-top">
                  <td className="px-2 py-2 font-medium text-slate-900">
                    {SCHEDULE_LABELS[entry.key] ?? entry.key}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        entry.source === 'db'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {entry.source === 'db' ? 'personnalisé' : '.env'}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => onDraftChange(entry.key, e.target.value)}
                      disabled={isBusy}
                      className="w-40 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-700"
                    />
                    {rowFeedback && (
                      <p className={`mt-1 text-xs ${rowFeedback.type === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {rowFeedback.message}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onApply(entry.key)}
                        disabled={isBusy || draft.trim() === entry.expression.trim()}
                        className="app-btn app-btn--sm app-btn--secondary"
                      >
                        {isBusy ? '...' : 'Appliquer'}
                      </button>
                      {entry.source === 'db' && (
                        <button
                          type="button"
                          onClick={() => onReset(entry.key)}
                          disabled={isBusy}
                          className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                        >
                          Réinitialiser
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WorkerPanel({
  title,
  subtitle,
  badge,
  badgeStatus,
  details,
}: {
  title: string
  subtitle: string
  badge: string
  badgeStatus: 'ok' | 'warning' | 'error'
  details: { label: string; value: string }[]
}) {
  return (
    <article className="app-panel p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(badgeStatus)}`}>
        {badge}
      </span>
      <dl className="space-y-1">
        {details.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-2 text-xs">
            <dt className="text-slate-500 shrink-0">{row.label}</dt>
            <dd className="font-medium text-slate-900 text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CronSettingsPage() {
  const router = useRouter()
  const { loading: authLoading, authenticated, isSuperUser } = useAuthSession()
  const { clanId, hydrated: clanHydrated } = useSelectedClan()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingAction, setPendingAction] = useState<CronAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [payload, setPayload] = useState<CronStatusPayload | null>(null)
  const [workers, setWorkers] = useState<WorkersPayload | null>(null)
  const [schedules, setSchedules] = useState<CronScheduleEntry[]>([])
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({})
  const [scheduleBusyKey, setScheduleBusyKey] = useState<string | null>(null)
  const [scheduleFeedback, setScheduleFeedback] = useState<
    Record<string, { type: 'error' | 'success'; message: string }>
  >({})

  // Pagination + filters for history
  const [historyPage, setHistoryPage] = useState(1)
  const [filterAction, setFilterAction] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Auth guard
  useEffect(() => {
    if (authLoading) return
    if (!authenticated) {
      router.replace('/login?redirect=/settings/cron')
      return
    }
    if (!isSuperUser) {
      router.replace('/')
    }
  }, [authLoading, authenticated, isSuperUser, router])

  const loadWorkers = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/cron-workers-status', { cache: 'no-store' })
      const data = (await response.json().catch(() => null)) as WorkersPayload | null
      if (response.ok && data?.ok) {
        setWorkers(data)
      }
    } catch {
      // Non-bloquant — workers info est optionnelle
    }
  }, [])

  const loadSchedules = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/cron-schedules', { cache: 'no-store' })
      const data = (await response.json().catch(() => null)) as
        | { ok: boolean; schedules: CronScheduleEntry[] }
        | null
      if (response.ok && data?.ok) {
        setSchedules(data.schedules)
        setScheduleDrafts((prev) => {
          const next = { ...prev }
          for (const entry of data.schedules) {
            if (next[entry.key] === undefined) {
              next[entry.key] = entry.expression
            }
          }
          return next
        })
      }
    } catch {
      // Non-bloquant — schedules info est optionnelle
    }
  }, [])

  const loadStatus = useCallback(async (currentClanId: number) => {
    try {
      const response = await fetch(`/api/clans/${currentClanId}/cron-control`, { cache: 'no-store' })
      const data = (await response.json().catch(() => null)) as CronStatusPayload | { error?: string } | null

      if (!response.ok || !data || !('ok' in data) || !data.ok) {
        if (response.status === 401) {
          router.replace(`/login?redirect=${encodeURIComponent('/settings/cron')}`)
          return
        }
        setPayload(null)
        setError(data && 'error' in data && data.error ? data.error : 'Chargement des données cron impossible')
        return
      }

      setPayload(data)
      setError(null)
    } catch {
      setPayload(null)
      setError('Chargement des données cron impossible')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [router])

  useEffect(() => {
    if (authLoading || !authenticated || !isSuperUser) return
    if (!clanHydrated) return

    if (!clanId) {
      setLoading(false)
      return
    }

    void loadStatus(clanId)
    void loadWorkers()
    void loadSchedules()
  }, [authLoading, authenticated, isSuperUser, clanId, clanHydrated, loadStatus, loadWorkers, loadSchedules])

  async function runAction(action: CronAction) {
    if (!clanId || pendingAction) return
    setPendingAction(action)
    setError(null)
    setInfo(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/cron-control`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      type ActionResult = { ok?: boolean; message?: string; warning?: string; error?: string }
      let result: ActionResult | null = null
      let rawText = ''
      try {
        result = (await response.clone().json()) as ActionResult
      } catch {
        rawText = (await response.text().catch(() => '')).trim()
      }

      if (!response.ok || !result?.ok) {
        if (response.status === 401) {
          router.replace(`/login?redirect=${encodeURIComponent('/settings/cron')}`)
          return
        }
        const fallback = rawText
          ? `HTTP ${response.status}: ${rawText.slice(0, 180)}`
          : `HTTP ${response.status}: réponse invalide`
        setError(
          result?.error ?? result?.message ?? `${fallback}. L'action a peut-être été lancée ; vérifiez l'historique.`
        )
        setRefreshing(true)
        await loadStatus(clanId)
        return
      }

      const parts = [result.message ?? 'Action lancée']
      if (result.warning) parts.push(result.warning)
      setInfo(parts.join(' — '))
      setRefreshing(true)
      await loadStatus(clanId)
    } catch {
      setError("Réponse non reçue. L'action a peut-être été lancée ; vérifiez l'historique.")
      setRefreshing(true)
      await loadStatus(clanId)
    } finally {
      setPendingAction(null)
    }
  }

  async function applySchedule(key: string) {
    const expression = (scheduleDrafts[key] ?? '').trim()

    if (!looksLikeCronExpression(expression)) {
      setScheduleFeedback((prev) => ({
        ...prev,
        [key]: { type: 'error', message: 'Expression cron invalide (5 segments attendus)' },
      }))
      return
    }

    setScheduleBusyKey(key)
    setScheduleFeedback((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })

    try {
      const response = await fetch('/api/settings/cron-schedules', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, expression }),
      })
      const data = (await response.json().catch(() => null)) as
        | { ok: boolean; schedules?: CronScheduleEntry[]; error?: string }
        | null

      if (!response.ok || !data?.ok) {
        setScheduleFeedback((prev) => ({
          ...prev,
          [key]: { type: 'error', message: data?.error ?? `HTTP ${response.status}` },
        }))
        return
      }

      if (data.schedules) {
        setSchedules(data.schedules)
        const updated = data.schedules.find((entry) => entry.key === key)
        if (updated) {
          setScheduleDrafts((prev) => ({ ...prev, [key]: updated.expression }))
        }
      }
      setScheduleFeedback((prev) => ({ ...prev, [key]: { type: 'success', message: 'Appliqué' } }))
    } catch {
      setScheduleFeedback((prev) => ({
        ...prev,
        [key]: { type: 'error', message: 'Réponse non reçue' },
      }))
    } finally {
      setScheduleBusyKey(null)
    }
  }

  async function resetSchedule(key: string) {
    setScheduleBusyKey(key)
    setScheduleFeedback((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })

    try {
      const response = await fetch(`/api/settings/cron-schedules/${key}`, { method: 'DELETE' })
      const data = (await response.json().catch(() => null)) as
        | { ok: boolean; schedules?: CronScheduleEntry[]; error?: string }
        | null

      if (!response.ok || !data?.ok) {
        setScheduleFeedback((prev) => ({
          ...prev,
          [key]: { type: 'error', message: data?.error ?? `HTTP ${response.status}` },
        }))
        return
      }

      if (data.schedules) {
        setSchedules(data.schedules)
        const updated = data.schedules.find((entry) => entry.key === key)
        if (updated) {
          setScheduleDrafts((prev) => ({ ...prev, [key]: updated.expression }))
        }
      }
      setScheduleFeedback((prev) => ({ ...prev, [key]: { type: 'success', message: 'Réinitialisé' } }))
    } catch {
      setScheduleFeedback((prev) => ({
        ...prev,
        [key]: { type: 'error', message: 'Réponse non reçue' },
      }))
    } finally {
      setScheduleBusyKey(null)
    }
  }

  // Derived: cron worker health badge
  const cronWorkerHealth = useMemo(() => {
    if (!payload) return { label: 'Cron worker : inconnu', status: 'warning' as const }
    if (!payload.runtime.cronWorker.available) {
      if (payload.runtime.cronWorker.probeEnabled === false) {
        return { label: 'Cron worker : vérification non configurée', status: 'warning' as const }
      }
      return { label: 'Cron worker : inaccessible', status: 'error' as const }
    }
    if (!payload.runtime.cronWorker.initialized || !payload.runtime.cronWorker.cronJobsEnabled) {
      return { label: 'Cron worker : non initialisé', status: 'warning' as const }
    }
    return { label: 'Cron worker : OK', status: 'ok' as const }
  }, [payload])

  // Derived: history filtered + paginated
  const { filteredHistory, historyPageCount, historyDistinctActions } = useMemo(() => {
    const all = payload?.history ?? []
    const filtered = all.filter((row) => {
      if (filterAction && row.action !== filterAction) return false
      if (filterStatus && row.status !== filterStatus) return false
      return true
    })
    const distinctActions = [...new Set(all.map((r) => r.action))].sort()
    return {
      filteredHistory: filtered,
      historyPageCount: Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE)),
      historyDistinctActions: distinctActions,
    }
  }, [payload?.history, filterAction, filterStatus])

  const historyPage_ = Math.min(historyPage, historyPageCount)
  const pagedHistory = filteredHistory.slice(
    (historyPage_ - 1) * HISTORY_PAGE_SIZE,
    historyPage_ * HISTORY_PAGE_SIZE
  )

  function resetFilters() {
    setFilterAction('')
    setFilterStatus('')
    setHistoryPage(1)
  }

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  // Derived: checks partitioned
  const checks = useMemo(() => partitionChecks(payload?.checks.items ?? []), [payload])

  // Worker panels data
  const resyncWorkerPanel = useMemo(() => {
    const w = workers?.resyncWorker
    const lock = w?.lock
    const q = w?.queue
    const liveQ = w?.liveSyncQueue
    let badge = 'Inconnu'
    let badgeStatus: 'ok' | 'warning' | 'error' = 'warning'
    if (lock) {
      if (lock.alive) { badge = 'En cours'; badgeStatus = 'ok' }
      else { badge = 'Lock obsolète'; badgeStatus = 'warning' }
    } else {
      badge = 'Inactif'; badgeStatus = 'error'
    }
    const details = [
      { label: 'PID', value: lock ? String(lock.pid) : '-' },
      { label: 'Lock depuis', value: lock ? getLockAgeLabel(lock.acquiredAt) : '-' },
      { label: 'Resync fichier — en file', value: q ? String(q.queued) : '-' },
      { label: 'Resync fichier — en cours', value: q ? String(q.running) : '-' },
      { label: 'Resync fichier — échoués', value: q ? String(q.failed) : '-' },
      { label: 'Resync fichier — terminés', value: q ? String(q.success) : '-' },
      { label: 'Live sync — en file', value: liveQ ? String(liveQ.queued) : '-' },
      { label: 'Live sync — en cours', value: liveQ ? String(liveQ.running) : '-' },
      { label: 'Live sync — échoués', value: liveQ ? String(liveQ.failed) : '-' },
      { label: 'Live sync — terminés', value: liveQ ? String(liveQ.success) : '-' },
    ]
    return { badge, badgeStatus, details }
  }, [workers])

  const aggregateWorkerPanel = useMemo(() => {
    const w = workers?.aggregateWorker
    const lock = w?.lock
    const q = w?.queue
    let badge = 'Inconnu'
    let badgeStatus: 'ok' | 'warning' | 'error' = 'warning'
    if (lock) {
      if (lock.alive) { badge = 'En cours'; badgeStatus = 'ok' }
      else { badge = 'Lock obsolète'; badgeStatus = 'warning' }
    } else {
      badge = 'Inactif'; badgeStatus = 'error'
    }
    const details = [
      { label: 'PID', value: lock ? String(lock.pid) : '-' },
      { label: 'Lock depuis', value: lock ? getLockAgeLabel(lock.acquiredAt) : '-' },
      { label: 'En file', value: q ? String(q.queued) : '-' },
      { label: 'En cours', value: q ? String(q.running) : '-' },
      { label: 'Échoués', value: q ? String(q.failed) : '-' },
      { label: 'Terminés', value: q ? String(q.success) : '-' },
    ]
    return { badge, badgeStatus, details }
  }, [workers])

  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------

  if (authLoading || loading) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Ops Cron"
        currentHref="/settings/cron"
        fallbackParent={{ href: '/settings/superuser', label: 'SuperUser' }}
      />
        <p className="text-sm text-slate-600">Chargement...</p>
      </main>
    )
  }

  if (!authenticated || !isSuperUser) return null

  if (!clanId) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Ops Cron"
        currentHref="/settings/cron"
        fallbackParent={{ href: '/settings/superuser', label: 'SuperUser' }}
      />
        <section className="app-panel p-6">
          <SettingsPageHeader title="Ops Cron (global)" subtitle="Pilotage des tâches cron et statut des workers." />
          <p className="mt-4 text-sm text-slate-600">
            Aucun clan sélectionné. Rendez-vous sur la{' '}
            <Link href="/clans" className="font-semibold text-emerald-700 hover:underline">
              page des clans
            </Link>{' '}
            pour en sélectionner un.
          </p>
        </section>
      </main>
    )
  }

  // ---------------------------------------------------------------------------
  // Full render
  // ---------------------------------------------------------------------------

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Ops Cron"
        currentHref="/settings/cron"
        fallbackParent={{ href: '/settings/superuser', label: 'SuperUser' }}
      />

      {/* --- En-tête --- */}
      <section className="app-panel p-4">
        <SettingsPageHeader
          title="Ops Cron (global)"
          subtitle="Pilotage global des tâches cron, statut des workers et historique des exécutions."
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(cronWorkerHealth.status)}`}>
            {cronWorkerHealth.label}
          </span>
          {payload && (
            <>
              {payload.checks.errors > 0 && (
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass('error')}`}>
                  {payload.checks.errors} erreur{payload.checks.errors > 1 ? 's' : ''} config
                </span>
              )}
              {payload.checks.warnings > 0 && (
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass('warning')}`}>
                  {payload.checks.warnings} warning{payload.checks.warnings > 1 ? 's' : ''} config
                </span>
              )}
            </>
          )}
          <span className="text-xs text-slate-500">
            Clan actif : <strong className="text-slate-700">#{clanId}</strong>
          </span>
          {refreshing && <span className="text-xs text-slate-400">Actualisation...</span>}
        </div>
      </section>

      {error && <section className="app-panel p-4 text-sm text-rose-800">{error}</section>}
      {info && <section className="app-panel p-4 text-sm text-emerald-800">{info}</section>}

      {/* --- Cards métriques --- */}
      {payload && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <article className="app-panel p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Taux de succès</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {payload.health.successRate === null ? '-' : `${payload.health.successRate}%`}
            </p>
            <p className="mt-1 text-xs text-slate-500">sur {payload.health.completedRecent} terminées</p>
          </article>
          <article className="app-panel p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Exécutions récentes</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{payload.health.totalRecent}</p>
            <p className="mt-1 text-xs text-slate-500">{payload.health.completedRecent} terminées</p>
          </article>
          <article className="app-panel p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">En cours</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{payload.health.runningCount}</p>
          </article>
          <article className="app-panel p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Échecs récents</p>
            <p className="mt-2 text-2xl font-bold text-rose-700">{payload.health.failedCount}</p>
          </article>
        </section>
      )}

      {/* --- Statut des 3 workers --- */}
      <section className="app-panel p-4 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Statut des workers</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ces trois processus sont indépendants. Le cron scheduler tourne dans le process Next.js.
            Les deux workers télémétrie sont des processus Node.js séparés à démarrer manuellement
            (<code className="text-xs">npm run telemetry:worker</code> et{' '}
            <code className="text-xs">npm run telemetry:aggregates:worker</code>).
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Cron scheduler */}
          <WorkerPanel
            title="Cron scheduler (Next.js)"
            subtitle="Tâches planifiées dans le process web"
            badge={cronWorkerHealth.label}
            badgeStatus={cronWorkerHealth.status}
            details={
              payload
                ? [
                    { label: 'ENABLE_CRON_JOBS', value: payload.runtime.webWorker.cronJobsEnabled ? 'true' : 'false' },
                    { label: 'ENABLE_CRON_BOOTSTRAP', value: payload.runtime.webWorker.cronBootstrapEnabled ? 'true' : 'false' },
                    { label: 'Worker distant', value: payload.runtime.cronWorker.available ? 'disponible' : 'indisponible' },
                    { label: 'Initialisé', value: payload.runtime.cronWorker.initialized ? 'oui' : 'non' },
                  ]
                : []
            }
          />
          {/* Telemetry resync worker */}
          <WorkerPanel
            title="telemetry:worker"
            subtitle="npm run telemetry:worker · resync fichiers"
            badge={resyncWorkerPanel.badge}
            badgeStatus={resyncWorkerPanel.badgeStatus}
            details={resyncWorkerPanel.details}
          />
          {/* Aggregate worker */}
          <WorkerPanel
            title="telemetry:aggregates:worker"
            subtitle="npm run telemetry:aggregates:worker · recalcul agrégats"
            badge={aggregateWorkerPanel.badge}
            badgeStatus={aggregateWorkerPanel.badgeStatus}
            details={aggregateWorkerPanel.details}
          />
        </div>
      </section>

      {/* --- Dernière exécution par action --- */}
      {payload && (
        <section className="app-panel p-4 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Dernière exécution par action</h2>
            <p className="mt-1 text-sm text-slate-600">
              Vue synthétique du dernier run connu pour chaque type d'action. Les actions automatiques
              (préfixe <code className="text-xs">daily_</code>, <code className="text-xs">weekly_</code>,{' '}
              <code className="text-xs">monthly_</code>) sont déclenchées par le scheduler ; les autres sont des
              exécutions manuelles.
            </p>
          </div>
          <div className="app-table-shell overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">Action</th>
                  <th className="px-2 py-2">Statut</th>
                  <th className="px-2 py-2">Début</th>
                  <th className="px-2 py-2">Durée</th>
                  <th className="px-2 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {KNOWN_ACTIONS.map((action) => {
                  const entry = payload.latestByAction.find((e) => e.action === action)
                  const label = payload.actionLabels[action] ?? action
                  return (
                    <tr key={action} className="app-table-row align-middle">
                      <td className="px-2 py-2 font-medium text-slate-900">{label}</td>
                      <td className="px-2 py-2">
                        {entry ? (
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(entry.status)}`}>
                            {entry.status}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Aucune</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-slate-700">{entry ? formatDate(entry.startedAt) : '-'}</td>
                      <td className="px-2 py-2 text-slate-700">{entry ? getDurationLabel(entry.durationMs) : '-'}</td>
                      <td className="px-2 py-2 text-slate-500">{entry?.source ?? '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* --- Actions manuelles --- */}
      {clanId && (
        <section className="app-panel p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Actions manuelles</h2>
            <p className="mt-1 text-sm text-slate-600">
              Lance une action sur le clan actif (#{clanId}) et contrôle le résultat immédiatement dans l'historique.
              Voir aussi :{' '}
              <Link
                href={`/clans/${clanId}/telemetry/recoveries`}
                className="font-semibold text-emerald-700 underline-offset-2 hover:underline"
              >
                Console recoveries télémétrie
              </Link>
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MANUAL_ACTIONS.map(({ action, label }) => (
              <div key={action} className="app-panel-muted rounded-lg p-3 space-y-2">
                <button
                  type="button"
                  onClick={() => void runAction(action)}
                  disabled={pendingAction !== null}
                  className="app-btn app-btn--md app-btn--secondary w-full"
                >
                  {pendingAction === action ? 'Exécution...' : label}
                </button>
                <p className="text-xs text-slate-500">{ACTION_DESCRIPTIONS[action]}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- Configuration --- */}
      {payload && (
        <section className="app-panel p-4 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Configuration</h2>
            <p className="mt-1 text-sm text-slate-600">
              Vérification des variables d'environnement critiques et des expressions cron actives.
              Un statut <strong>error</strong> bloque le fonctionnement ; un statut <strong>warning</strong> indique une
              configuration sous-optimale.
            </p>
          </div>

          <CheckGroupTable
            items={checks.system}
            title="Système & API"
            description="Variables d'environnement principales, URLs internes et clés d'accès."
          />
          <CheckGroupTable
            items={checks.telemetry}
            title="Télémétrie"
            description="Variables contrôlant le pipeline de synchronisation et de parsing des fichiers télémétrie."
          />
          <ScheduleEditorTable
            schedules={schedules}
            drafts={scheduleDrafts}
            busyKey={scheduleBusyKey}
            feedback={scheduleFeedback}
            onDraftChange={(key, value) => setScheduleDrafts((prev) => ({ ...prev, [key]: value }))}
            onApply={(key) => void applySchedule(key)}
            onReset={(key) => void resetSchedule(key)}
          />

          {/* Rate limit PUBG API */}
          <div className="space-y-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">Rate limit PUBG API</p>
              <p className="text-xs text-slate-500">Snapshot du dernier appel observé.</p>
            </div>
            <div className="app-panel-muted rounded-lg p-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">Limite</span><span className="font-medium text-slate-800">{payload.pubgApi.latestRateLimit?.limit ?? '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Restant</span><span className="font-medium text-slate-800">{payload.pubgApi.latestRateLimit?.remaining ?? '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Reset</span><span className="font-medium text-slate-800">{formatDate(payload.pubgApi.latestRateLimit?.resetAt ?? null)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Observé</span><span className="font-medium text-slate-800">{formatDate(payload.pubgApi.latestRateLimit?.observedAt ?? null)}</span></div>
            </div>
          </div>
        </section>
      )}

      {/* --- Historique --- */}
      {payload && (
        <section className="app-panel p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Historique</h2>
            <p className="mt-1 text-sm text-slate-600">
              Dernières exécutions enregistrées, toutes actions confondues (cron scheduler + actions manuelles +
              workers télémétrie). Utilisez les filtres pour isoler une action ou un statut spécifique.
            </p>
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setHistoryPage(1) }}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
            >
              <option value="">Toutes les actions</option>
              {historyDistinctActions.map((a) => (
                <option key={a} value={a}>{payload.actionLabels[a] ?? a}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setHistoryPage(1) }}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
            >
              <option value="">Tous les statuts</option>
              {(['running', 'success', 'partial', 'failed'] as const).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {(filterAction || filterStatus) && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
              >
                Réinitialiser
              </button>
            )}
            <span className="ml-auto text-xs text-slate-500">
              {filteredHistory.length} résultat{filteredHistory.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Tableau */}
          <div className="app-table-shell overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2 w-4"></th>
                  <th className="px-2 py-2">Action</th>
                  <th className="px-2 py-2">Statut</th>
                  <th className="px-2 py-2">Début</th>
                  <th className="px-2 py-2">Durée</th>
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {pagedHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-3 text-slate-500">
                      Aucune exécution correspondant aux filtres.
                    </td>
                  </tr>
                ) : (
                  pagedHistory.map((item) => {
                    const isExpanded = expandedRows.has(item.id)
                    const snippet = formatDetailsSnippet(item.details)
                    const hasDetails = snippet !== null
                    return (
                      <Fragment key={item.id}>
                        <tr className="app-table-row align-top">
                          <td className="px-2 py-2">
                            {hasDetails && (
                              <button
                                type="button"
                                onClick={() => toggleRow(item.id)}
                                className="text-slate-400 hover:text-slate-700"
                                title="Afficher les détails"
                              >
                                <svg
                                  viewBox="0 0 20 20"
                                  className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  fill="currentColor"
                                >
                                  <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.12l3.71-3.9a.75.75 0 1 1 1.08 1.04l-4.25 4.46a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z" />
                                </svg>
                              </button>
                            )}
                          </td>
                          <td className="px-2 py-2 font-medium text-slate-900">
                            {payload.actionLabels[item.action] ?? item.action}
                          </td>
                          <td className="px-2 py-2">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(item.status)}`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-slate-700">{formatDate(item.startedAt)}</td>
                          <td className="px-2 py-2 text-slate-700">{getDurationLabel(item.durationMs)}</td>
                          <td className="px-2 py-2 text-slate-500">{item.source}</td>
                          <td className="px-2 py-2 text-slate-600">{item.message ?? '-'}</td>
                        </tr>
                        {isExpanded && snippet && (
                          <tr className="bg-slate-50">
                            <td />
                            <td colSpan={6} className="px-2 py-2 text-xs text-slate-600">
                              {snippet}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {historyPageCount > 1 && (
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyPage_ <= 1}
                className="app-btn app-btn--md app-btn--secondary"
              >
                Précédent
              </button>
              <span className="text-xs text-slate-500">
                Page {historyPage_} / {historyPageCount}
              </span>
              <button
                type="button"
                onClick={() => setHistoryPage((p) => Math.min(historyPageCount, p + 1))}
                disabled={historyPage_ >= historyPageCount}
                className="app-btn app-btn--md app-btn--secondary"
              >
                Suivant
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
