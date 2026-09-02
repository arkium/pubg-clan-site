'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertOctagon, CheckCircle2, RotateCw, Trash2, Users } from 'lucide-react'

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

interface ManualActionConfig {
  action: CronAction
  label: string
  cronKey: string
  cronLabel: string
  description: string
}

const MANUAL_ACTIONS_CONFIG: ManualActionConfig[] = [
  {
    action: 'sync_matches',
    label: 'Synchroniser les matchs',
    cronKey: 'daily_sync',
    cronLabel: 'Sync quotidien clans',
    description:
      "Interroge l'API PUBG pour découvrir et importer les nouveaux matchs du clan, et les mettre en file d'attente télémétrie.",
  },
  {
    action: 'sync_stats',
    label: 'Recalculer les stats globales',
    cronKey: 'daily_stats_recalc',
    cronLabel: 'Recalcul stats quotidien',
    description:
      "Recalcule l'ensemble des totaux, moyennes, scores et synergies du clan à partir des matchs déjà présents en base.",
  },
  {
    action: 'sync_telemetry_aggregates',
    label: 'Recalculer agrégats télémétrie',
    cronKey: 'telemetry:aggregates:worker',
    cronLabel: 'Worker agrégats télémétrie',
    description:
      "Reconstruit les tables de statistiques avancées de télémétrie (synergies d'escouade, positions de largage, armes).",
  },
  {
    action: 'sync_lifetime_stats',
    label: 'Synchroniser stats lifetime',
    cronKey: 'daily_lifetime_stats_sync',
    cronLabel: 'Sync lifetime quotidienne',
    description:
      "Récupère via l'API PUBG les statistiques de carrière globale (lifetime toutes saisons confondues) de chaque membre.",
  },
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
  encountered_player_clan_resolution: 'Résolution clans joueurs rencontrés',
}

const SCHEDULE_DESCRIPTIONS: Record<string, string> = {
  daily_sync:
    'Découverte et synchronisation des nouveaux matchs PUBG pour tous les clans actifs. Si activé, met en file jusqu\'à 50 matchs par clan pour la télémétrie.',
  daily_stats_recalc:
    'Recalcul global des agrégats du clan (scores, moyennes, classements, synergies, armes) à partir des matchs déjà en base.',
  daily_lifetime_stats_sync:
    'Mise à jour des statistiques de carrière globale (lifetime) de chaque joueur du clan via l\'API PUBG.',
  daily_season_stats_sync:
    'Mise à jour des statistiques de la saison PUBG en cours pour les membres actifs de chaque plateforme/shard.',
  clan_online_reminder:
    'Notification automatique rappelant aux membres les créneaux ou événements programmés du clan.',
  weekly_report_reminder:
    'Notification rappelant la disponibilité ou la clôture du rapport de performance hebdomadaire.',
  weekly_report_auto:
    'Génération et archivage automatique du bilan de performance hebdomadaire du clan.',
  monthly_report_auto:
    'Génération et archivage automatique du bilan de performance mensuel du clan.',
  challenge_processing:
    'Contrôle d\'avancement des défis de clan, validation des objectifs complétés et activation des nouveaux challenges.',
  encountered_player_clan_resolution:
    'Résolution et identification des clans des adversaires rencontrés dans les matchs récents.',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusPill({
  status,
  customLabel,
}: {
  status: 'ok' | 'warning' | 'error' | 'running' | 'success' | 'partial' | 'failed'
  customLabel?: string
}) {
  let variant = 'status-pill--offline'
  let dotColor = 'bg-slate-400'
  let defaultLabel = status as string

  if (status === 'ok' || status === 'success') {
    variant = 'status-pill--online'
    dotColor = 'bg-emerald-500'
    defaultLabel = status === 'ok' ? 'Opérationnel' : 'Succès'
  } else if (status === 'running') {
    variant = 'status-pill--pending'
    dotColor = 'bg-amber-500 animate-pulse'
    defaultLabel = 'En cours'
  } else if (status === 'warning' || status === 'partial') {
    variant = 'status-pill--pending'
    dotColor = 'bg-amber-500'
    defaultLabel = status === 'partial' ? 'Partiel' : 'Attention'
  } else if (status === 'error' || status === 'failed') {
    variant = 'status-pill--error'
    dotColor = 'bg-rose-500'
    defaultLabel = status === 'failed' ? 'Échec' : 'Erreur'
  }

  return (
    <span className={`status-pill ${variant}`}>
      <span className={`status-dot ${dotColor}`} />
      {customLabel ?? defaultLabel}
    </span>
  )
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
        <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <div className="app-table-shell overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Variable</th>
              <th className="px-3 py-2">État</th>
              <th className="px-3 py-2">Valeur</th>
              <th className="px-3 py-2">Info</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key} className="app-table-row align-top">
                <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-900 dark:text-white">{item.label}</td>
                <td className="px-3 py-2">
                  <StatusPill status={item.status} />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">{item.value}</td>
                <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{item.hint ?? '-'}</td>
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
    return <p className="text-xs text-slate-500 dark:text-slate-400">Chargement des schedules...</p>
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-white">Schedules cron</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Expressions cron actives (fuseau {schedules[0]?.timezone ?? 'UTC'}). Modifiable sans redémarrage —
          appliqué immédiatement au process courant.
        </p>
      </div>
      <div className="app-table-shell overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2.5">Tâche & Description</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Expression</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((entry) => {
              const draft = drafts[entry.key] ?? entry.expression
              const isBusy = busyKey === entry.key
              const rowFeedback = feedback[entry.key]
              return (
                <tr key={entry.key} className="app-table-row align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {SCHEDULE_LABELS[entry.key] ?? entry.key}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
                      {SCHEDULE_DESCRIPTIONS[entry.key] ?? 'Tâche planifiée automatique.'}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`status-pill ${
                        entry.source === 'db' ? 'status-pill--online' : 'status-pill--offline'
                      }`}
                    >
                      <span
                        className={`status-dot ${
                          entry.source === 'db' ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                      {entry.source === 'db' ? 'personnalisé' : '.env'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => onDraftChange(entry.key, e.target.value)}
                      disabled={isBusy}
                      className="w-36 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-mono text-xs text-slate-900 dark:text-white"
                    />
                    {rowFeedback && (
                      <p
                        className={`mt-1 text-xs font-semibold ${
                          rowFeedback.type === 'error'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {rowFeedback.message}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onApply(entry.key)}
                        disabled={isBusy || draft.trim() === entry.expression.trim()}
                        className="app-btn app-btn--xs app-btn--primary"
                      >
                        {isBusy ? '...' : 'Appliquer'}
                      </button>
                      {entry.source === 'db' && (
                        <button
                          type="button"
                          onClick={() => onReset(entry.key)}
                          disabled={isBusy}
                          className="app-btn app-btn--xs app-btn--secondary"
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
        <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      <div>
        <StatusPill status={badgeStatus} customLabel={badge} />
      </div>
      <dl className="space-y-1.5 pt-1">
        {details.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-2 text-xs">
            <dt className="text-slate-500 dark:text-slate-400 shrink-0">{row.label}</dt>
            <dd className="font-semibold text-slate-900 dark:text-white text-right">{row.value}</dd>
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
  const { clanId, hydrated: clanHydrated, setClanId } = useSelectedClan()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingAction, setPendingAction] = useState<CronAction | null>(null)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const [progressPercent, setProgressPercent] = useState<number | null>(null)
  const [clansList, setClansList] = useState<{ id: number; name: string; tag?: string | null }[]>([])
  const [selectedScope, setSelectedScope] = useState<string | null>(null)
  const targetScope = selectedScope ?? (clanId ? String(clanId) : 'all')
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
  const [purging, setPurging] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)

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

  const loadClans = useCallback(async () => {
    try {
      const response = await fetch('/api/clans', { cache: 'no-store' })
      const data = (await response.json().catch(() => null)) as { id: number; name: string; tag?: string | null }[] | null
      if (Array.isArray(data)) {
        setClansList(data.map((c) => ({ id: c.id, name: c.name, tag: c.tag ?? null })))
      }
    } catch {
      // Non-bloquant
    }
  }, [])

  useEffect(() => {
    if (authLoading || !authenticated || !isSuperUser) return
    if (!clanHydrated) return

    if (!clanId) {
      queueMicrotask(() => setLoading(false))
      return
    }

    let isMounted = true
    const init = async () => {
      if (!isMounted) return
      await Promise.allSettled([
        loadStatus(clanId),
        loadWorkers(),
        loadSchedules(),
        loadClans(),
      ])
    }
    void init()

    return () => {
      isMounted = false
    }
  }, [authLoading, authenticated, isSuperUser, clanId, clanHydrated, loadStatus, loadWorkers, loadSchedules, loadClans])

  const handleScopeChange = (newScope: string) => {
    setSelectedScope(newScope)
    if (newScope !== 'all') {
      const nextId = Number(newScope)
      if (nextId && nextId !== clanId) {
        setClanId(nextId)
        setRefreshing(true)
        void loadStatus(nextId)
      }
    }
  }

  async function runActionOnSingle(action: CronAction, targetId: number) {
    setPendingAction(action)
    setError(null)
    setInfo(null)

    const actionCfg = MANUAL_ACTIONS_CONFIG.find((a) => a.action === action)
    const actionLabel = actionCfg?.label ?? action
    const targetClan = clansList.find((c) => c.id === targetId)
    const clanDisplayName = targetClan ? `"${targetClan.name}" (#${targetId})` : `clan #${targetId}`

    setProgressPercent(null)
    setProgressMessage(`Exécution de "${actionLabel}" pour ${clanDisplayName} en cours...`)

    try {
      const response = await fetch(`/api/clans/${targetId}/cron-control`, {
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
        await loadStatus(targetId)
        return
      }

      const parts = [result.message ?? 'Action terminée']
      if (result.warning) parts.push(result.warning)
      setInfo(parts.join(' — '))
      setRefreshing(true)
      await loadStatus(targetId)
    } catch {
      setError("Erreur de communication lors de l'exécution de l'action.")
    } finally {
      setPendingAction(null)
      setProgressMessage(null)
      setProgressPercent(null)
    }
  }

  async function runActionOnAll(action: CronAction) {
    if (clansList.length === 0) return
    setPendingAction(action)
    setError(null)
    setInfo(null)

    const actionCfg = MANUAL_ACTIONS_CONFIG.find((a) => a.action === action)
    const actionLabel = actionCfg?.label ?? action
    const total = clansList.length
    let succeeded = 0
    let failed = 0

    try {
      for (let i = 0; i < total; i++) {
        const clanItem = clansList[i]
        const pct = Math.round(((i + 1) / total) * 100)
        setProgressPercent(pct)
        setProgressMessage(
          `[${i + 1}/${total}] ${actionLabel} : traitement de "${clanItem.name}" (#${clanItem.id})...`
        )

        try {
          const response = await fetch(`/api/clans/${clanItem.id}/cron-control`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action }),
          })
          const res = (await response.json().catch(() => null)) as { ok?: boolean } | null
          if (response.ok && res?.ok) {
            succeeded++
          } else {
            failed++
          }
        } catch {
          failed++
        }
      }

      setInfo(
        `Action globale "${actionLabel}" terminée : ${succeeded} clan(s) avec succès${
          failed > 0 ? `, ${failed} échec(s)` : ''
        }.`
      )
      if (clanId) {
        setRefreshing(true)
        await loadStatus(clanId)
      }
    } catch {
      setError("Erreur imprévue lors de l'exécution globale.")
    } finally {
      setPendingAction(null)
      setProgressMessage(null)
      setProgressPercent(null)
    }
  }

  async function runAction(action: CronAction) {
    if (pendingAction) return

    if (targetScope === 'all') {
      await runActionOnAll(action)
    } else {
      const targetId = Number(targetScope) || clanId
      if (targetId) {
        await runActionOnSingle(action, targetId)
      }
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

  async function handlePurgeHistory() {
    if (!clanId || purging) return
    setPurging(true)
    setError(null)
    setInfo(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/cron-control`, {
        method: 'DELETE',
      })
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean
        message?: string
        deletedCount?: number
        error?: string
      } | null

      if (response.ok && data?.ok) {
        setInfo(data.message ?? 'Historique purgé avec succès.')
        setConfirmPurge(false)
        setRefreshing(true)
        await loadStatus(clanId)
      } else {
        setError(data?.error ?? 'Échec de la purge de l’historique.')
      }
    } catch {
      setError('Erreur de communication lors de la purge de l’historique.')
    } finally {
      setPurging(false)
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
          <StatusPill status={cronWorkerHealth.status} customLabel={cronWorkerHealth.label} />
          {payload && (
            <>
              {payload.checks.errors > 0 && (
                <StatusPill
                  status="error"
                  customLabel={`${payload.checks.errors} erreur${payload.checks.errors > 1 ? 's' : ''} config`}
                />
              )}
              {payload.checks.warnings > 0 && (
                <StatusPill
                  status="warning"
                  customLabel={`${payload.checks.warnings} warning${payload.checks.warnings > 1 ? 's' : ''} config`}
                />
              )}
            </>
          )}
          <span className="app-meta-pill">
            Clan actif : #{clanId}
          </span>
          {refreshing && <span className="text-xs text-slate-400">Actualisation...</span>}
        </div>
      </section>

      {error && (
        <section className="telemetry-toast-error flex items-center justify-between rounded-xl p-3.5 text-sm font-semibold shadow-sm">
          <p className="flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 shrink-0" />
            {error}
          </p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-bold underline opacity-80 hover:opacity-100 ml-4 shrink-0"
          >
            Fermer
          </button>
        </section>
      )}

      {info && (
        <section className="telemetry-toast-success flex items-center justify-between rounded-xl p-3.5 text-sm font-semibold shadow-sm">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            {info}
          </p>
          <button
            type="button"
            onClick={() => setInfo(null)}
            className="text-xs font-bold underline opacity-90 hover:opacity-100 ml-4 shrink-0"
          >
            Fermer
          </button>
        </section>
      )}

      {/* --- Cards métriques --- */}
      {payload && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <article className="app-panel p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Taux de succès</p>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {payload.health.successRate === null ? '-' : `${payload.health.successRate}%`}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">sur {payload.health.completedRecent} terminées</p>
          </article>
          <article className="app-panel p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Exécutions récentes</p>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{payload.health.totalRecent}</p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{payload.health.completedRecent} terminées</p>
          </article>
          <article className="app-panel p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">En cours</p>
            <p className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">{payload.health.runningCount}</p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Jobs actifs</p>
          </article>
          <article className="app-panel p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Échecs récents</p>
            <p className="mt-2 text-2xl font-black text-rose-600 dark:text-rose-400">{payload.health.failedCount}</p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">À surveiller</p>
          </article>
        </section>
      )}

      {/* --- Statut des 3 workers --- */}
      <section className="app-panel p-4 space-y-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Statut des workers</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Ces trois processus sont indépendants. Le cron scheduler tourne dans le process Next.js.
            Les deux workers télémétrie sont des processus Node.js séparés à démarrer manuellement
            (<code className="text-xs font-mono">npm run telemetry:worker</code> et{' '}
            <code className="text-xs font-mono">npm run telemetry:aggregates:worker</code>).
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
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Dernière exécution par action</h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Vue synthétique du dernier run connu pour chaque type d&apos;action. Les actions automatiques
              (préfixe <code className="text-xs font-mono">daily_</code>, <code className="text-xs font-mono">weekly_</code>,{' '}
              <code className="text-xs font-mono">monthly_</code>) sont déclenchées par le scheduler ; les autres sont des
              exécutions manuelles.
            </p>
          </div>
          <div className="app-table-shell overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Début</th>
                  <th className="px-3 py-2">Durée</th>
                  <th className="px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {KNOWN_ACTIONS.map((action) => {
                  const entry = payload.latestByAction.find((e) => e.action === action)
                  const label = payload.actionLabels[action] ?? action
                  return (
                    <tr key={action} className="app-table-row align-middle">
                      <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{label}</td>
                      <td className="px-3 py-2">
                        {entry ? (
                          <StatusPill status={entry.status} />
                        ) : (
                          <span className="text-xs text-slate-400">Aucune</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{entry ? formatDate(entry.startedAt) : '-'}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{entry ? getDurationLabel(entry.durationMs) : '-'}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{entry?.source ?? '-'}</td>
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
        <section className="app-panel p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Actions manuelles</h2>
                <span className="app-meta-pill text-xs">Exécution immédiate</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Déclencheur instantané de la logique des crons. Choisissez le clan cible ou lancez en lot sur tous les clans.
              </p>
            </div>

            {/* Sélecteur de clan mis en évidence */}
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 pl-1">
                <Users className="h-4 w-4 text-indigo-500" />
                Cible :
              </span>
              <select
                value={targetScope}
                onChange={(e) => handleScopeChange(e.target.value)}
                disabled={pendingAction !== null}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              >
                {clansList.length > 0 && (
                  <option value="all">⚡ Tous les clans ({clansList.length} clans actifs)</option>
                )}
                <optgroup label="Sélectionner un clan">
                  {clansList.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      Clan #{c.id} — {c.name} {c.tag ? `[${c.tag}]` : ''} {c.id === clanId ? '(actif)' : ''}
                    </option>
                  ))}
                  {clansList.length === 0 && (
                    <option value={String(clanId)}>Clan actif #{clanId}</option>
                  )}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Bandeau d'avancement dynamique */}
          {pendingAction && (
            <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-indigo-800 dark:text-indigo-200">
                <span className="flex items-center gap-2">
                  <RotateCw className="h-4 w-4 animate-spin text-indigo-500 shrink-0" />
                  {progressMessage ?? 'Exécution en cours...'}
                </span>
                {progressPercent !== null && <span>{progressPercent}%</span>}
              </div>
              {progressPercent !== null && (
                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 dark:bg-indigo-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Grille des cartes avec badges de liaison cron */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MANUAL_ACTIONS_CONFIG.map((actionCfg) => {
              const isBusy = pendingAction === actionCfg.action
              const isAnyBusy = pendingAction !== null
              const isAll = targetScope === 'all'

              return (
                <div
                  key={actionCfg.action}
                  className="app-panel-muted rounded-xl p-3.5 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    {/* Badge de liaison cron */}
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                        {actionCfg.cronKey}
                      </span>
                    </div>

                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      {actionCfg.label}
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {actionCfg.description}
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => void runAction(actionCfg.action)}
                      disabled={isAnyBusy}
                      className={`app-btn app-btn--sm w-full font-semibold ${
                        isBusy
                          ? 'app-btn--primary'
                          : isAll
                          ? 'app-btn--primary'
                          : 'app-btn--secondary'
                      }`}
                    >
                      {isBusy ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <RotateCw className="h-3.5 w-3.5 animate-spin" />
                          Traitement...
                        </span>
                      ) : isAll ? (
                        'Lancer pour tous les clans'
                      ) : (
                        `Lancer pour #${targetScope === 'current' ? clanId : targetScope}`
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* --- Configuration --- */}
      {payload && (
        <section className="app-panel p-4 space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Configuration</h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Vérification des variables d&apos;environnement critiques et des expressions cron actives.
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
              <p className="text-sm font-bold text-slate-900 dark:text-white">Rate limit PUBG API</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Snapshot du dernier appel observé.</p>
            </div>
            <div className="app-panel-muted rounded-xl p-3.5 grid gap-x-6 gap-y-1 sm:grid-cols-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Limite</span><span className="font-semibold text-slate-900 dark:text-white">{payload.pubgApi.latestRateLimit?.limit ?? '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Restant</span><span className="font-semibold text-slate-900 dark:text-white">{payload.pubgApi.latestRateLimit?.remaining ?? '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Reset</span><span className="font-semibold text-slate-900 dark:text-white">{formatDate(payload.pubgApi.latestRateLimit?.resetAt ?? null)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Observé</span><span className="font-semibold text-slate-900 dark:text-white">{formatDate(payload.pubgApi.latestRateLimit?.observedAt ?? null)}</span></div>
            </div>
          </div>
        </section>
      )}

      {/* --- Historique --- */}
      {payload && (
        <section className="app-panel p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Historique des exécutions</h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Dernières exécutions enregistrées (cron scheduler + actions manuelles + workers télémétrie).
              </p>
            </div>

            {/* Bouton de purge d'historique */}
            {confirmPurge ? (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-2 text-xs">
                <span className="font-semibold text-rose-700 dark:text-rose-300">
                  Purger tous les logs terminés ?
                </span>
                <button
                  type="button"
                  onClick={() => void handlePurgeHistory()}
                  disabled={purging}
                  className="app-btn app-btn--xs app-btn--danger"
                >
                  {purging ? 'Purge...' : 'Confirmer la purge'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPurge(false)}
                  disabled={purging}
                  className="app-btn app-btn--xs app-btn--secondary"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmPurge(true)}
                className="app-btn app-btn--xs app-btn--secondary gap-1.5"
                title="Supprimer les exécutions terminées pour nettoyer la base"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                Purger l&apos;historique
              </button>
            )}
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setHistoryPage(1) }}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-medium"
            >
              <option value="">Toutes les actions</option>
              {historyDistinctActions.map((a) => (
                <option key={a} value={a}>{payload.actionLabels[a] ?? a}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setHistoryPage(1) }}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-medium"
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
                className="app-btn app-btn--xs app-btn--secondary"
              >
                Réinitialiser
              </button>
            )}
            <span className="ml-auto app-meta-pill">
              {filteredHistory.length} résultat{filteredHistory.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Tableau */}
          <div className="app-table-shell overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 w-6"></th>
                  <th className="px-3 py-2.5">Action</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5">Début</th>
                  <th className="px-3 py-2.5">Durée</th>
                  <th className="px-3 py-2.5">Source</th>
                  <th className="px-3 py-2.5">Message</th>
                </tr>
              </thead>
              <tbody>
                {pagedHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-slate-500 dark:text-slate-400 text-xs">
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
                          <td className="px-3 py-2.5">
                            {hasDetails && (
                              <button
                                type="button"
                                onClick={() => toggleRow(item.id)}
                                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
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
                          <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">
                            {payload.actionLabels[item.action] ?? item.action}
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusPill status={item.status} />
                          </td>
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300 text-xs">{formatDate(item.startedAt)}</td>
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300 text-xs">{getDurationLabel(item.durationMs)}</td>
                          <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 text-xs">{item.source}</td>
                          <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 text-xs">{item.message ?? '-'}</td>
                        </tr>
                        {isExpanded && snippet && (
                          <tr className="bg-slate-100/60 dark:bg-slate-900/80">
                            <td />
                            <td colSpan={6} className="px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-800">
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
            <div className="flex items-center justify-between gap-4 pt-2">
              <button
                type="button"
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyPage_ <= 1}
                className="app-btn app-btn--xs app-btn--secondary"
              >
                Précédent
              </button>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Page {historyPage_} / {historyPageCount}
              </span>
              <button
                type="button"
                onClick={() => setHistoryPage((p) => Math.min(historyPageCount, p + 1))}
                disabled={historyPage_ >= historyPageCount}
                className="app-btn app-btn--xs app-btn--secondary"
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
