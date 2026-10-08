'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  History,
  Info,
  Loader2,
  Play,
  RefreshCw,
  ScrollText,
  Settings2,
  Trash2,
  XCircle,
} from 'lucide-react'

import { KpiGrid, type Kpi } from '@/components/matches/MatchesUi'
import AdminPageBanner, { BANNER_GLASS_BUTTON } from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, AdminPageLoading } from '@/components/settings/AdminPageStates'
import { Callout, ChoiceMenu, ConfirmDialog, EmptyState, SectionCard, Tag, ToastStack, type Toast, type Tone } from '@/components/ui/CharteKit'
import Pagination from '@/components/ui/Pagination'
import SortableTh from '@/components/ui/SortableTh'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

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
  clan_lifecycle_membership_sync: 'Appartenance de clan (cycle de vie)',
  db_maintenance: 'Maintenance de la base',
  resource_vehicle_spots: 'Véhicules observés (carte des ressources)',
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
  clan_lifecycle_membership_sync:
    'Vérifie chaque jour, joueur par joueur, si les membres suivis sont toujours dans leur clan PUBG. Un écart doit être confirmé plusieurs passages d\'affilée avant tout mouvement, et le passage s\'abandonne si trop de membres bougeraient d\'un coup. En mode observation (défaut), rien n\'est appliqué.',
  db_maintenance:
    'Clôture des exécutions restées « en cours » plus de 6 h après l\'arrêt de leur processus. Ne supprime aucune donnée : ni jobs échoués, ni captures de télémétrie.',
  resource_vehicle_spots:
    'Recalcule, carte par carte, les emplacements où des véhicules sont trouvés en début de partie (montées des 90 derniers jours) pour la carte des ressources. Remplace les emplacements de chaque carte ; tâche globale, sans ligne dans l\'historique par clan.',
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function getDurationLabel(durationMs: number | null | undefined) {
  if (durationMs === null || durationMs === undefined) return '—'
  if (durationMs < 1000) return `${durationMs} ms`
  return `${(durationMs / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
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
// Helpers
// ---------------------------------------------------------------------------

type StatusValue = 'ok' | 'warning' | 'error' | 'running' | 'success' | 'partial' | 'failed'

const STATUS_META: Record<StatusValue, { tone: Tone; label: string }> = {
  ok: { tone: 'pos', label: 'Opérationnel' },
  success: { tone: 'pos', label: 'Succès' },
  running: { tone: 'sky', label: 'En cours' },
  warning: { tone: 'warn', label: 'Attention' },
  partial: { tone: 'warn', label: 'Partiel' },
  error: { tone: 'neg', label: 'Erreur' },
  failed: { tone: 'neg', label: 'Échec' },
}

const HISTORY_STATUSES = ['running', 'success', 'partial', 'failed'] as const

/** Pastille d'état (jetons de jeu de la charte) : vert, bleu, orange ou rouge. */
function StatusTag({ status, customLabel }: { status: StatusValue; customLabel?: string }) {
  const meta = STATUS_META[status]
  return <Tag tone={meta.tone}>{customLabel ?? meta.label}</Tag>
}

/** Couleur d'un état pour un point ou une icône. */
function statusColor(status: 'ok' | 'warning' | 'error') {
  return status === 'ok' ? 'var(--game-pos)' : status === 'warning' ? 'var(--game-warn)' : 'var(--game-neg)'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SubsectionTitle({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="t-card-title m-0">{title}</h3>
      <p className="t-meta m-0">{description}</p>
    </div>
  )
}

function CheckGroup({ items, title, description }: { items: CronCheck[]; title: string; description: string }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <SubsectionTitle title={title} description={description} />
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map((item) => (
          <li
            key={item.key}
            className="app-panel-muted grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-3 py-2 md:grid-cols-[minmax(0,13rem)_auto_minmax(0,1fr)]"
          >
            <span className="break-all font-mono text-xs font-semibold text-gray-900">{item.label}</span>
            <span className="justify-self-end md:justify-self-start">
              <StatusTag status={item.status} />
            </span>
            <span className="col-span-2 flex min-w-0 flex-col gap-0.5 md:col-span-1">
              <span className="break-all font-mono text-xs text-gray-700">{item.value}</span>
              {item.hint ? <span className="t-meta">{item.hint}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ScheduleEditor({
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
  return (
    <div className="flex flex-col gap-2">
      <SubsectionTitle
        title="Horaires des tâches"
        description={`Expressions cron actives (fuseau ${schedules[0]?.timezone ?? 'UTC'}), modifiables sans redémarrage : appliquées aussitôt au processus en cours.`}
      />
      {schedules.length === 0 ? (
        <p className="t-meta m-0 flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Chargement des horaires…
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {schedules.map((entry) => {
            const draft = drafts[entry.key] ?? entry.expression
            const isBusy = busyKey === entry.key
            const rowFeedback = feedback[entry.key]
            return (
              <li key={entry.key} className="app-panel-muted flex flex-col gap-2 px-3 py-2.5 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 flex-col gap-0.5 md:max-w-[34rem]">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="t-body font-semibold text-gray-900">{SCHEDULE_LABELS[entry.key] ?? entry.key}</span>
                    <Tag tone={entry.source === 'db' ? 'pos' : 'neutral'}>{entry.source === 'db' ? 'personnalisé' : '.env'}</Tag>
                  </span>
                  <span className="t-meta">{SCHEDULE_DESCRIPTIONS[entry.key] ?? 'Tâche planifiée automatique.'}</span>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => onDraftChange(entry.key, e.target.value)}
                      disabled={isBusy}
                      aria-label={`Expression cron de « ${SCHEDULE_LABELS[entry.key] ?? entry.key} »`}
                      className="app-input w-40 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => onApply(entry.key)}
                      disabled={isBusy || draft.trim() === entry.expression.trim()}
                      className="app-btn app-btn--sm app-btn--secondary"
                    >
                      {isBusy ? 'Envoi…' : 'Appliquer'}
                    </button>
                    {entry.source === 'db' ? (
                      <button type="button" onClick={() => onReset(entry.key)} disabled={isBusy} className="app-btn app-btn--sm app-btn--secondary">
                        Réinitialiser
                      </button>
                    ) : null}
                  </span>
                  {rowFeedback ? (
                    <span className={`text-xs font-semibold ${rowFeedback.type === 'error' ? 't-neg' : 't-pos'}`}>{rowFeedback.message}</span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function WorkerTile({
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
    <article className="app-panel-muted flex flex-col gap-2 px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="break-all font-mono text-xs font-bold text-gray-900">{title}</span>
          <span className="t-meta">{subtitle}</span>
        </div>
        <span className="shrink-0">
          <StatusTag status={badgeStatus} customLabel={badge} />
        </span>
      </div>
      {details.length > 0 ? (
        <dl className="m-0 flex flex-col gap-1">
          {details.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-2 text-xs">
              <dt className="shrink-0 text-gray-500">{row.label}</dt>
              <dd className="t-num m-0 text-right font-semibold text-gray-900">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  )
}

function RateLimitStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="app-panel-muted flex flex-col gap-0.5 px-3 py-2.5">
      <span className="t-label">{label}</span>
      <span className="t-body t-num font-semibold text-gray-900">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

/**
 * Tâches planifiées de toute la plateforme (SuperUser), selon la charte UI (docs/ui/index.html) : santé du scheduler et
 * des workers de télémétrie, dernière exécution par action, actions manuelles (un clan ou tous), configuration et
 * horaires, historique des exécutions.
 */
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

  function handleRefreshAll() {
    if (!clanId) return
    setRefreshing(true)
    void Promise.allSettled([loadStatus(clanId), loadWorkers(), loadSchedules()])
  }

  if (authLoading || loading) {
    return <AdminPageLoading />
  }

  if (!authenticated || !isSuperUser) return null

  const banner = (
    <AdminPageBanner
      title="Tâches planifiées"
      subtitle="Tâches cron de toute la plateforme, workers de télémétrie et historique des exécutions."
      icon={Clock}
      image="/heatmap.jpg"
      currentHref="/settings/cron"
      parent={{ href: '/settings', label: 'Plateforme' }}
      pills={[
        <span key="health" className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(cronWorkerHealth.status) }} aria-hidden="true" />
          {cronWorkerHealth.label}
        </span>,
        ...(payload && payload.checks.errors > 0 ? [`${payload.checks.errors} erreur(s) de configuration`] : []),
        ...(payload && payload.checks.warnings > 0 ? [`${payload.checks.warnings} alerte(s) de configuration`] : []),
        'Réservé au SuperUser',
      ]}
      action={
        clanId ? (
          <button type="button" onClick={handleRefreshAll} disabled={refreshing || pendingAction !== null} className={BANNER_GLASS_BUTTON}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualiser
          </button>
        ) : undefined
      }
    />
  )

  if (!clanId) {
    return (
      <div className={ADMIN_PAGE_CLASS}>
        {banner}
        <Callout tone="sky" icon={Info} title="Aucun clan sélectionné">
          L’état des tâches se lit à travers un clan.{' '}
          <Link href="/clans" className="app-link font-semibold">
            Choisir un clan
          </Link>
        </Callout>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Full render
  // ---------------------------------------------------------------------------

  const toasts: Toast[] = [
    ...(error ? [{ id: 1, text: error, tone: 'error' as const }] : []),
    ...(info ? [{ id: 2, text: info, tone: 'success' as const }] : []),
  ]

  const kpis: Kpi[] = payload
    ? [
        {
          label: 'Taux de succès',
          value: payload.health.successRate === null ? '—' : `${payload.health.successRate} %`,
          detail: `sur ${payload.health.completedRecent} exécution(s) terminée(s)`,
          icon: CheckCircle2,
          color: 'var(--game-pos)',
        },
        {
          label: 'Exécutions récentes',
          value: String(payload.health.totalRecent),
          detail: `${payload.health.completedRecent} terminée(s)`,
          icon: Activity,
          color: 'var(--game-sky)',
        },
        {
          label: 'En cours',
          value: String(payload.health.runningCount),
          detail: 'tâches actives',
          icon: Loader2,
          color: 'var(--game-warn)',
        },
        {
          label: 'Échecs récents',
          value: String(payload.health.failedCount),
          detail: 'à surveiller',
          icon: XCircle,
          color: 'var(--game-neg)',
        },
      ]
    : []

  const targetClan = clansList.find((c) => String(c.id) === targetScope)
  const targetLabel = targetClan ? (targetClan.tag ? `[${targetClan.tag}]` : targetClan.name) : `#${targetScope === 'current' ? clanId : targetScope}`
  const scopeOptions = [
    ...(clansList.length > 0 ? [{ value: 'all', label: `Tous les clans (${clansList.length})` }] : []),
    ...(clansList.length > 0
      ? clansList.map((c) => ({
          value: String(c.id),
          label: `${c.tag ? `[${c.tag}] ` : ''}${c.name}${c.id === clanId ? ' (actif)' : ''}`,
        }))
      : [{ value: String(clanId), label: `Clan actif #${clanId}` }]),
  ]
  const actionFilterOptions = [
    { value: '', label: 'Toutes les actions' },
    ...historyDistinctActions.map((a) => ({ value: a, label: payload?.actionLabels[a] ?? a })),
  ]
  const statusFilterOptions = [
    { value: '', label: 'Tous les statuts' },
    ...HISTORY_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label })),
  ]

  return (
    <div className={ADMIN_PAGE_CLASS}>
      {banner}

      {payload ? <KpiGrid items={kpis} className="grid-cols-2 lg:grid-cols-4" /> : null}

      <SectionCard
        id="cron-workers"
        icon={Cpu}
        title="Workers"
        meta={
          <>
            Trois processus indépendants : le scheduler tourne dans le processus Next.js, les deux workers de télémétrie se lancent à
            part (<code className="font-mono">npm run telemetry:worker</code> et{' '}
            <code className="font-mono">npm run telemetry:aggregates:worker</code>).
          </>
        }
      >
        <div className="grid gap-2.5 md:grid-cols-3">
          <WorkerTile
            title="Scheduler cron (Next.js)"
            subtitle="Tâches planifiées dans le processus web"
            badge={cronWorkerHealth.status === 'ok' ? 'OK' : cronWorkerHealth.status === 'error' ? 'Inaccessible' : 'À vérifier'}
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
          <WorkerTile
            title="telemetry:worker"
            subtitle="Récupération des fichiers de télémétrie"
            badge={resyncWorkerPanel.badge}
            badgeStatus={resyncWorkerPanel.badgeStatus}
            details={resyncWorkerPanel.details}
          />
          <WorkerTile
            title="telemetry:aggregates:worker"
            subtitle="Recalcul des agrégats de télémétrie"
            badge={aggregateWorkerPanel.badge}
            badgeStatus={aggregateWorkerPanel.badgeStatus}
            details={aggregateWorkerPanel.details}
          />
        </div>
      </SectionCard>

      {payload ? (
        <SectionCard
          id="cron-latest"
          icon={History}
          title="Dernière exécution par action"
          meta={
            <>
              Les actions préfixées <code className="font-mono">daily_</code>, <code className="font-mono">weekly_</code> ou{' '}
              <code className="font-mono">monthly_</code> sont lancées par le scheduler ; les autres sont des exécutions manuelles.
            </>
          }
        >
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 md:hidden">
            {KNOWN_ACTIONS.map((action) => {
              const entry = payload.latestByAction.find((e) => e.action === action)
              return (
                <li key={action} className="app-panel-muted flex flex-col gap-1 px-3 py-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="t-body font-semibold text-gray-900">{payload.actionLabels[action] ?? action}</span>
                    {entry ? <StatusTag status={entry.status} /> : <span className="t-meta">Jamais</span>}
                  </span>
                  {entry ? (
                    <span className="t-meta">
                      {formatDate(entry.startedAt)} · {getDurationLabel(entry.durationMs)} · {entry.source}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <div className="app-table-shell hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="app-table-head">
                <tr>
                  <SortableTh align="left">Action</SortableTh>
                  <SortableTh align="left">Statut</SortableTh>
                  <SortableTh align="left">Début</SortableTh>
                  <SortableTh>Durée</SortableTh>
                  <SortableTh align="left">Source</SortableTh>
                </tr>
              </thead>
              <tbody>
                {KNOWN_ACTIONS.map((action) => {
                  const entry = payload.latestByAction.find((e) => e.action === action)
                  return (
                    <tr key={action} className="app-table-row">
                      <td className="px-[9px] py-2 font-semibold text-gray-900">{payload.actionLabels[action] ?? action}</td>
                      <td className="px-[9px] py-2">{entry ? <StatusTag status={entry.status} /> : <span className="t-meta">Jamais</span>}</td>
                      <td className="whitespace-nowrap px-[9px] py-2 text-gray-700">{entry ? formatDate(entry.startedAt) : '—'}</td>
                      <td className="t-num px-[9px] py-2 text-right text-gray-700">{entry ? getDurationLabel(entry.durationMs) : '—'}</td>
                      <td className="t-meta px-[9px] py-2">{entry?.source ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        id="cron-manual"
        icon={Play}
        title="Actions manuelles"
        meta="Lance tout de suite la logique d’une tâche, pour un clan ou pour tous les clans l’un après l’autre."
        aside={
          <div className={`flex w-full flex-col gap-1 sm:w-72 ${pendingAction !== null ? 'pointer-events-none opacity-60' : ''}`}>
            <span className="t-label">Cible</span>
            <ChoiceMenu<string> label="Cible" value={targetScope} onChange={handleScopeChange} options={scopeOptions} />
          </div>
        }
      >
        {pendingAction ? (
          <div className="app-panel-muted flex flex-col gap-2 px-3.5 py-3" role="status">
            <span className="flex items-center justify-between gap-2">
              <span className="t-body flex items-center gap-2 font-semibold text-gray-900">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: 'var(--game-sky)' }} aria-hidden="true" />
                {progressMessage ?? 'Exécution en cours…'}
              </span>
              {progressPercent !== null ? <span className="t-num font-bold text-gray-900">{progressPercent} %</span> : null}
            </span>
            {progressPercent !== null ? (
              <span className="h-2 w-full overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]">
                <span
                  className="block h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%`, backgroundColor: 'var(--game-sky)' }}
                />
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {MANUAL_ACTIONS_CONFIG.map((actionCfg) => {
            const isBusy = pendingAction === actionCfg.action
            const isAll = targetScope === 'all'
            return (
              <div key={actionCfg.action} className="app-panel-muted flex flex-col justify-between gap-3 px-3.5 py-3">
                <div className="flex flex-col gap-1.5">
                  <span>
                    <Tag tone="neutral">
                      <span className="font-mono">{actionCfg.cronKey}</span>
                    </Tag>
                  </span>
                  <span className="t-card-title">{actionCfg.label}</span>
                  <span className="t-meta">{actionCfg.description}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void runAction(actionCfg.action)}
                  disabled={pendingAction !== null}
                  className="app-btn app-btn--sm app-btn--secondary w-full gap-1.5"
                >
                  {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                  {isBusy ? 'Traitement…' : isAll ? 'Lancer pour tous les clans' : `Lancer pour ${targetLabel}`}
                </button>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {payload ? (
        <SectionCard
          id="cron-config"
          icon={Settings2}
          title="Configuration"
          meta="Variables d’environnement critiques et horaires actifs. Une erreur bloque le fonctionnement ; une alerte signale une configuration à revoir."
        >
          <CheckGroup items={checks.system} title="Système et API" description="Variables principales, adresses internes et clés d’accès." />
          <CheckGroup
            items={checks.telemetry}
            title="Télémétrie"
            description="Variables du pipeline de synchronisation et d’analyse des fichiers de télémétrie."
          />
          <ScheduleEditor
            schedules={schedules}
            drafts={scheduleDrafts}
            busyKey={scheduleBusyKey}
            feedback={scheduleFeedback}
            onDraftChange={(key, value) => setScheduleDrafts((prev) => ({ ...prev, [key]: value }))}
            onApply={(key) => void applySchedule(key)}
            onReset={(key) => void resetSchedule(key)}
          />
          <div className="flex flex-col gap-2">
            <SubsectionTitle title="Limite de débit de l’API PUBG" description="Dernier appel observé." />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <RateLimitStat label="Limite" value={payload.pubgApi.latestRateLimit?.limit ?? '—'} />
              <RateLimitStat label="Restant" value={payload.pubgApi.latestRateLimit?.remaining ?? '—'} />
              <RateLimitStat label="Remise à zéro" value={formatDate(payload.pubgApi.latestRateLimit?.resetAt ?? null)} />
              <RateLimitStat label="Observé" value={formatDate(payload.pubgApi.latestRateLimit?.observedAt ?? null)} />
            </div>
          </div>
        </SectionCard>
      ) : null}

      {payload ? (
        <SectionCard
          id="cron-history"
          icon={ScrollText}
          title="Historique des exécutions"
          meta="Dernières exécutions enregistrées : scheduler, actions manuelles et workers de télémétrie."
          aside={
            <button
              type="button"
              onClick={() => setConfirmPurge(true)}
              className="app-btn app-btn--sm app-btn--secondary gap-1.5"
              title="Supprimer les exécutions terminées"
            >
              <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--game-neg)' }} aria-hidden="true" />
              Purger l’historique
            </button>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-60">
              <ChoiceMenu<string>
                label="Action"
                value={filterAction}
                onChange={(value) => {
                  setFilterAction(value)
                  setHistoryPage(1)
                }}
                options={actionFilterOptions}
              />
            </div>
            <div className="w-full sm:w-44">
              <ChoiceMenu<string>
                label="Statut"
                value={filterStatus}
                onChange={(value) => {
                  setFilterStatus(value)
                  setHistoryPage(1)
                }}
                options={statusFilterOptions}
              />
            </div>
            {filterAction || filterStatus ? (
              <button type="button" onClick={resetFilters} className="app-link text-xs font-semibold">
                Réinitialiser
              </button>
            ) : null}
            <span className="sm:ml-auto">
              <Tag tone="neutral">
                {filteredHistory.length} résultat{filteredHistory.length !== 1 ? 's' : ''}
              </Tag>
            </span>
          </div>

          {pagedHistory.length === 0 ? (
            <EmptyState icon={ScrollText} title="Aucune exécution pour ces filtres" />
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 md:hidden">
                {pagedHistory.map((item) => {
                  const snippet = formatDetailsSnippet(item.details)
                  return (
                    <li key={item.id} className="app-panel-muted flex flex-col gap-1 px-3 py-2">
                      <span className="flex items-center justify-between gap-2">
                        <span className="t-body font-semibold text-gray-900">{payload.actionLabels[item.action] ?? item.action}</span>
                        <StatusTag status={item.status} />
                      </span>
                      <span className="t-meta">
                        {formatDate(item.startedAt)} · {getDurationLabel(item.durationMs)} · {item.source}
                      </span>
                      {item.message ? <span className="t-meta text-gray-700">{item.message}</span> : null}
                      {snippet ? <span className="t-meta font-mono">{snippet}</span> : null}
                    </li>
                  )
                })}
              </ul>
              <div className="app-table-shell hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <SortableTh align="left">
                        <span className="sr-only">Détails</span>
                      </SortableTh>
                      <SortableTh align="left">Action</SortableTh>
                      <SortableTh align="left">Statut</SortableTh>
                      <SortableTh align="left">Début</SortableTh>
                      <SortableTh>Durée</SortableTh>
                      <SortableTh align="left">Source</SortableTh>
                      <SortableTh align="left">Message</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedHistory.map((item) => {
                      const isExpanded = expandedRows.has(item.id)
                      const snippet = formatDetailsSnippet(item.details)
                      return (
                        <Fragment key={item.id}>
                          <tr className="app-table-row align-top">
                            <td className="w-8 px-[9px] py-2">
                              {snippet ? (
                                <button
                                  type="button"
                                  onClick={() => toggleRow(item.id)}
                                  aria-expanded={isExpanded}
                                  className="grid h-6 w-6 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                  title="Afficher les détails"
                                  aria-label="Afficher les détails"
                                >
                                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                                </button>
                              ) : null}
                            </td>
                            <td className="px-[9px] py-2 font-semibold text-gray-900">{payload.actionLabels[item.action] ?? item.action}</td>
                            <td className="px-[9px] py-2">
                              <StatusTag status={item.status} />
                            </td>
                            <td className="whitespace-nowrap px-[9px] py-2 text-xs text-gray-700">{formatDate(item.startedAt)}</td>
                            <td className="t-num whitespace-nowrap px-[9px] py-2 text-right text-xs text-gray-700">{getDurationLabel(item.durationMs)}</td>
                            <td className="t-meta px-[9px] py-2">{item.source}</td>
                            <td className="px-[9px] py-2 text-xs text-gray-700">{item.message ?? '—'}</td>
                          </tr>
                          {isExpanded && snippet ? (
                            <tr>
                              <td />
                              <td colSpan={6} className="border-t border-gray-200 px-[9px] py-2 font-mono text-xs text-gray-700">
                                {snippet}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <Pagination
            page={historyPage_}
            pageCount={historyPageCount}
            total={filteredHistory.length}
            pageSize={HISTORY_PAGE_SIZE}
            onPageChange={setHistoryPage}
            ariaLabel="Pages de l’historique des exécutions"
            itemLabel="Exécutions"
          />
        </SectionCard>
      ) : null}

      {confirmPurge ? (
        <ConfirmDialog
          icon={Trash2}
          title="Purger l’historique ?"
          confirmLabel="Purger"
          tone="danger"
          busy={purging}
          onCancel={() => setConfirmPurge(false)}
          onConfirm={() => void handlePurgeHistory()}
        >
          Toutes les exécutions terminées seront supprimées de l’historique ; les tâches en cours sont conservées.
        </ConfirmDialog>
      ) : null}

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => {
          if (id === 1) setError(null)
          else setInfo(null)
        }}
      />
    </div>
  )
}
