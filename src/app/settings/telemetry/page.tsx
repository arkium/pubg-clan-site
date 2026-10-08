'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  HardDriveDownload,
  Hourglass,
  ListOrdered,
  Play,
  RadioTower,
  RefreshCw,
  Server,
  Users,
  XCircle,
  Zap,
} from 'lucide-react'

import { KpiGrid, type Kpi } from '@/components/matches/MatchesUi'
import AdminPageBanner, { BANNER_GLASS_BUTTON } from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, AdminPageLoading, AdminPageRestricted } from '@/components/settings/AdminPageStates'
import { Callout, EmptyState, ListSkeleton, SectionCard, Tag, ToastStack, type Toast } from '@/components/ui/CharteKit'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useAuthSession } from '@/hooks/useAuthSession'

type TelemetryWindow = '24h' | '7d' | '30d' | 'all'

type ClanWindowStat = {
  clanId: number
  clanName: string
  clanTag: string
  total: number
  success: number
  failed: number
  expired: number
  pending: number
  withParsedPayload: number
  successRate: number | null
}

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

type GlobalBacklogSummary = {
  totalMatches: number
  completedMatches: number
  expiredMatches: number
  recoverableBacklog: number
  urgentBacklog: number
  inQueueCount: number
  toQueueCount: number
  completionRate: number | null
  clans: ClanBacklogStat[]
  auditedAt: string
}

type StatusPayload = {
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

const WINDOW_OPTIONS: Array<{ value: TelemetryWindow; label: string }> = [
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: 'all', label: 'Tous' },
]

const WINDOW_LABELS: Record<TelemetryWindow, string> = {
  '24h': 'les dernières 24 h',
  '7d': 'les 7 derniers jours',
  '30d': 'les 30 derniers jours',
  all: 'tout l’historique',
}

/** Segments de la barre de complétion : validés, en file, à mettre en file, expirés (jetons de jeu). */
const SEGMENT_COLORS = {
  completed: 'var(--game-pos)',
  inQueue: 'var(--game-sky)',
  toQueue: 'var(--game-warn)',
  expired: 'color-mix(in srgb, var(--theme-ui-text-muted) 55%, transparent)',
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—'
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const remainingSecs = seconds % 60
  if (minutes < 60) return `${minutes} min${remainingSecs > 0 ? ` ${remainingSecs} s` : ''}`
  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60
  return `${hours} h ${remainingMins} min`
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '—'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function formatCount(value: number) {
  return value.toLocaleString('fr-FR')
}

/** Barre empilée de complétion d'un ensemble de matchs, rapportée à leur total. */
function CompletionBar({
  total,
  completed,
  inQueue,
  toQueue,
  expired,
  thick = false,
}: {
  total: number
  completed: number
  inQueue: number
  toQueue: number
  expired: number
  thick?: boolean
}) {
  const pct = (value: number) => (total > 0 ? (value / total) * 100 : 0)
  const segments = [
    { key: 'completed', value: completed, label: 'validés' },
    { key: 'inQueue', value: inQueue, label: 'en file' },
    { key: 'toQueue', value: toQueue, label: 'à mettre en file' },
    { key: 'expired', value: expired, label: 'expirés' },
  ] as const
  return (
    <span className={`flex w-full overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)] ${thick ? 'h-3' : 'h-2'}`}>
      {segments.map((segment) => (
        <span
          key={segment.key}
          className="h-full transition-all duration-500"
          style={{ width: `${pct(segment.value)}%`, backgroundColor: SEGMENT_COLORS[segment.key] }}
          title={`${formatCount(segment.value)} ${segment.label}`}
        />
      ))}
    </span>
  )
}

function LegendDot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {children}
    </span>
  )
}

function StatusTile({
  label,
  tag,
  value,
  detail,
}: {
  label: string
  tag: React.ReactNode
  value: React.ReactNode
  detail: React.ReactNode
}) {
  return (
    <div className="app-panel-muted flex flex-col gap-1 px-3.5 py-3">
      <span className="flex items-center justify-between gap-2">
        <span className="t-label">{label}</span>
        {tag}
      </span>
      <span className="t-card-title">{value}</span>
      <span className="t-meta">{detail}</span>
    </div>
  )
}

/**
 * Télémétrie de tous les clans (SuperUser), selon la charte UI (docs/ui/index.html) : moteur de récupération et file,
 * complétion réelle et reste à récupérer (les fichiers PUBG expirent après 14 jours), puis détail par clan.
 */
export default function TelemetryRecoveriesOverviewPage() {
  const router = useRouter()
  const { loading: authLoading, authenticated, isSuperUser } = useAuthSession()

  // Filtre temporel pour l'historique récent
  const [window, setWindow] = useState<TelemetryWindow>('7d')

  // Données de statut (ultra-rapides)
  const [statusData, setStatusData] = useState<StatusPayload | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)

  // Données de fenêtre récente (rapides)
  const [windowClans, setWindowClans] = useState<ClanWindowStat[]>([])
  const [loadingOverview, setLoadingOverview] = useState(true)

  // Données de backlog & complétion globale (asynchrones / progressives)
  const [backlogData, setBacklogData] = useState<GlobalBacklogSummary | null>(null)
  const [loadingBacklog, setLoadingBacklog] = useState(true)

  // États d'action
  const [enqueuing, setEnqueuing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [reloadToken, setReloadToken] = useState(0)

  // Redirection si non authentifié
  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.replace('/login?redirect=/settings/telemetry')
    }
  }, [authenticated, authLoading, router])

  // Déclenchement en parallèle des 3 sources de données avec chargement progressif
  useEffect(() => {
    if (authLoading || !authenticated || !isSuperUser) return

    let cancelled = false

    async function loadStatus() {
      try {
        const res = await fetch('/api/settings/telemetry-recoveries/status', { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!cancelled && res.ok && json?.ok) {
          setStatusData(json.data ?? json.legacy ?? null)
        }
      } catch {
        // Silencieux
      } finally {
        if (!cancelled) {
          setLoadingStatus(false)
        }
      }
    }

    async function loadOverview() {
      try {
        const res = await fetch(`/api/settings/telemetry-recoveries?window=${window}`, {
          cache: 'no-store',
        })
        const json = await res.json().catch(() => null)
        if (!cancelled && res.ok && json?.ok) {
          setWindowClans(json.data?.clans ?? json.clans ?? [])
        }
      } catch {
        // Silencieux
      } finally {
        if (!cancelled) {
          setLoadingOverview(false)
        }
      }
    }

    async function loadBacklog() {
      try {
        const res = await fetch('/api/settings/telemetry-recoveries/backlog', { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!cancelled && res.ok && json?.ok) {
          setBacklogData(json.data ?? json.legacy ?? null)
        }
      } catch {
        // Silencieux
      } finally {
        if (!cancelled) {
          setLoadingBacklog(false)
        }
      }
    }

    void loadStatus()
    void loadOverview()
    void loadBacklog()

    return () => {
      cancelled = true
    }
  }, [authLoading, authenticated, isSuperUser, reloadToken, window])

  // Rafraîchir tout
  const handleRefreshAll = () => {
    setRefreshing(true)
    setActionMessage(null)
    setLoadingOverview(true)
    setLoadingBacklog(true)
    setReloadToken((prev) => prev + 1)
    setTimeout(() => setRefreshing(false), 500)
  }

  // Action : mettre en file tout le reste à récupérer, ou seulement les urgences
  const handleEnqueueBacklog = async (options: { clanId?: number; urgentOnly?: boolean }) => {
    try {
      setEnqueuing(true)
      setActionMessage(null)

      const res = await fetch('/api/settings/telemetry-recoveries/enqueue-backlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message ?? json?.error ?? 'Erreur lors de la mise en file')
      }

      const data = json.data ?? json.legacy ?? {}
      const queuedCount = data.queuedCount ?? 0
      const alreadyCount = data.alreadyQueuedCount ?? 0

      setActionMessage({
        type: 'success',
        text: `${queuedCount} match(s) mis en file de récupération (${alreadyCount} y étaient déjà).`,
      })

      // Rafraîchir le statut et le backlog
      setReloadToken((prev) => prev + 1)
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur inconnue lors de la mise en file',
      })
    } finally {
      setEnqueuing(false)
    }
  }

  // Rendu de sécurité Auth / SuperUser
  if (authLoading) {
    return <AdminPageLoading />
  }

  if (!authenticated) return null

  if (!isSuperUser) {
    return <AdminPageRestricted />
  }

  const worker = statusData?.worker
  const queue = statusData?.queue
  const scheduler = statusData?.scheduler
  const isWorkerActive = Boolean(worker?.alive)
  const toasts: Toast[] = actionMessage ? [{ id: 1, text: actionMessage.text, tone: actionMessage.type }] : []

  const backlogKpis: Kpi[] = backlogData
    ? [
        {
          label: 'Matchs éligibles',
          value: formatCount(backlogData.totalMatches),
          detail: 'historique hors parties casual',
          icon: ListOrdered,
          color: 'var(--theme-ui-text-muted)',
        },
        {
          label: 'Télémétries validées',
          value: formatCount(backlogData.completedMatches),
          detail: `${formatPercent(backlogData.completionRate)} des matchs encore disponibles`,
          icon: CheckCircle2,
          color: SEGMENT_COLORS.completed,
        },
        {
          label: 'Dans la file',
          value: formatCount(backlogData.inQueueCount),
          detail: 'en cours de traitement',
          icon: Hourglass,
          color: SEGMENT_COLORS.inQueue,
        },
        {
          label: 'À mettre en file',
          value: formatCount(backlogData.toQueueCount),
          detail: 'matchs de moins de 14 jours',
          icon: Zap,
          color: SEGMENT_COLORS.toQueue,
        },
        {
          label: 'Expirés',
          value: formatCount(backlogData.expiredMatches),
          detail: 'plus de 14 jours, perdus côté PUBG',
          icon: XCircle,
          color: 'var(--theme-ui-text-muted)',
        },
      ]
    : []

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Télémétrie, tous les clans"
        subtitle="Moteur de récupération, complétion réelle et reste à récupérer, clan par clan."
        icon={RadioTower}
        image="/cartographie-tactique.jpg"
        currentHref="/settings/telemetry"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          <span key="worker" className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: isWorkerActive ? 'var(--game-pos)' : 'var(--game-warn)' }}
              aria-hidden="true"
            />
            {loadingStatus ? 'Worker…' : isWorkerActive ? 'Worker actif' : 'Worker arrêté'}
          </span>,
          'Réservé au SuperUser',
        ]}
        action={
          <button type="button" onClick={handleRefreshAll} disabled={refreshing || enqueuing} className={BANNER_GLASS_BUTTON}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualiser
          </button>
        }
      />

      <SectionCard
        id="telemetry-engine"
        icon={Server}
        title="Moteur de récupération"
        meta="Worker d’ingestion, file de récupération et synchronisation automatique."
        aside={
          <Link href="/settings/cron" className="app-link inline-flex items-center gap-1 text-xs font-semibold">
            Tâches planifiées
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        }
      >
        {loadingStatus ? (
          <ListSkeleton rows={2} />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-3">
            <StatusTile
              label="Worker d’ingestion"
              tag={<Tag tone={isWorkerActive ? 'pos' : 'warn'}>{isWorkerActive ? 'Actif' : 'Arrêté'}</Tag>}
              value={isWorkerActive ? `PID ${worker?.pid}` : 'Arrêté'}
              detail={
                isWorkerActive ? (
                  'Traite la file en continu.'
                ) : (
                  <>
                    Lancer <code className="font-mono">npm run telemetry:worker</code> pour vider la file.
                  </>
                )
              }
            />
            <StatusTile
              label="File de récupération"
              tag={<Tag tone="neutral">{formatCount(queue?.remaining ?? 0)} restant(s)</Tag>}
              value={
                <span className="t-num">
                  {formatCount(queue?.queued ?? 0)} en attente · {formatCount(queue?.running ?? 0)} en cours
                </span>
              }
              detail={
                isWorkerActive && (statusData?.etaSeconds ?? 0) > 0
                  ? `Fin estimée dans ~${formatDuration(statusData?.etaSeconds ?? null)}`
                  : `${formatCount(queue?.success ?? 0)} réussis · ${formatCount(queue?.failed ?? 0)} échoués`
              }
            />
            <StatusTile
              label="Synchronisation"
              tag={<Tag tone={scheduler?.syncEnabled ? 'pos' : 'neutral'}>{scheduler?.syncEnabled ? 'Automatique' : 'Désactivée'}</Tag>}
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-gray-500" aria-hidden="true" />
                  Prochain passage ~{formatTime(scheduler?.nextDailySyncEstimate ?? null)}
                </span>
              }
              detail={`Au plus ${scheduler?.maxMatchesPerRun ?? 50} matchs par clan et par nuit.`}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard
        id="telemetry-backlog"
        icon={HardDriveDownload}
        title="Complétion et reste à récupérer"
        meta="Matchs joués par les clans suivis, comparés aux télémétries réellement analysées."
        aside={
          <>
            {backlogData && backlogData.urgentBacklog > 0 ? (
              <button
                type="button"
                onClick={() => handleEnqueueBacklog({ urgentOnly: true })}
                disabled={enqueuing || refreshing}
                className="app-btn app-btn--sm app-btn--danger gap-1.5"
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {enqueuing ? 'Mise en file…' : `Sauver les ${formatCount(backlogData.urgentBacklog)} urgents`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => handleEnqueueBacklog({ urgentOnly: false })}
              disabled={enqueuing || refreshing || !backlogData || backlogData.toQueueCount === 0}
              className="app-btn app-btn--sm app-btn--primary gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              {enqueuing
                ? 'Mise en file…'
                : backlogData && backlogData.toQueueCount > 0
                  ? `Mettre en file le reste (${formatCount(backlogData.toQueueCount)})`
                  : 'Tout est déjà en file'}
            </button>
          </>
        }
      >
        {backlogData && backlogData.urgentBacklog > 0 ? (
          <Callout tone="warn" icon={AlertTriangle} title={`${formatCount(backlogData.urgentBacklog)} match(s) risquent d’expirer`}>
            PUBG supprime les fichiers de télémétrie après 14 jours. Ces matchs ont entre 7 et 13 jours : les mettre en file
            maintenant, avant qu’ils ne soient perdus.
          </Callout>
        ) : null}

        {loadingBacklog ? (
          <ListSkeleton rows={3} />
        ) : backlogData ? (
          <>
            <div className="app-panel-muted flex flex-col gap-2.5 px-3.5 py-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <span className="flex flex-col gap-0.5">
                  <span className="t-label">Taux de complétion réel</span>
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="t-hero t-hero--md text-gray-900">{formatPercent(backlogData.completionRate)}</span>
                    <span className="t-meta t-num">
                      {formatCount(backlogData.completedMatches)} / {formatCount(backlogData.totalMatches - backlogData.expiredMatches)} matchs
                      récupérables
                    </span>
                  </span>
                </span>
                <span className="t-meta t-num text-right">
                  <span className="font-semibold text-gray-900">{formatCount(backlogData.recoverableBacklog)}</span> restant(s) ·{' '}
                  {formatCount(backlogData.inQueueCount)} en file · {formatCount(backlogData.toQueueCount)} à mettre en file
                </span>
              </div>
              <CompletionBar
                total={backlogData.totalMatches}
                completed={backlogData.completedMatches}
                inQueue={backlogData.inQueueCount}
                toQueue={backlogData.toQueueCount}
                expired={backlogData.expiredMatches}
                thick
              />
              <span className="t-meta t-num flex flex-wrap gap-x-4 gap-y-1">
                <LegendDot color={SEGMENT_COLORS.completed}>{formatCount(backlogData.completedMatches)} validés</LegendDot>
                <LegendDot color={SEGMENT_COLORS.inQueue}>{formatCount(backlogData.inQueueCount)} en file</LegendDot>
                <LegendDot color={SEGMENT_COLORS.toQueue}>{formatCount(backlogData.toQueueCount)} à mettre en file</LegendDot>
                <LegendDot color={SEGMENT_COLORS.expired}>{formatCount(backlogData.expiredMatches)} expirés (plus de 14 jours)</LegendDot>
              </span>
            </div>
            <KpiGrid items={backlogKpis} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" />
          </>
        ) : (
          <EmptyState icon={HardDriveDownload} title="Bilan indisponible" text="Le calcul du reste à récupérer n’a pas répondu ; réessayer avec « Actualiser »." />
        )}
      </SectionCard>

      <SectionCard
        id="telemetry-clans"
        icon={Users}
        title="Par clan"
        meta={`Complétion de chaque clan suivi et tentatives de récupération sur ${WINDOW_LABELS[window]}.`}
        aside={<SegmentedControl size="sm" value={window} onChange={(value) => setWindow(value)} options={WINDOW_OPTIONS} />}
      >
        {loadingBacklog && loadingOverview ? (
          <ListSkeleton rows={3} />
        ) : !backlogData || backlogData.clans.length === 0 ? (
          <EmptyState icon={Users} title="Aucun clan suivi" />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {backlogData.clans.map((clan) => {
              // Réconciliation avec la fenêtre récente
              const windowStat = windowClans.find((w) => w.clanId === clan.clanId)
              const hasUrgent = clan.urgentBacklog > 0
              const isLowCompletion = clan.completionRate !== null && clan.completionRate < 80

              return (
                <li
                  key={clan.clanId}
                  className="app-panel-muted flex flex-col gap-2 px-3.5 py-3"
                  style={
                    hasUrgent
                      ? { borderColor: 'color-mix(in srgb, var(--game-neg) 55%, transparent)' }
                      : isLowCompletion
                        ? { borderColor: 'color-mix(in srgb, var(--game-warn) 55%, transparent)' }
                        : undefined
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5">
                        {hasUrgent ? (
                          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--game-neg)' }} aria-hidden="true" />
                        ) : null}
                        <span className="shrink-0 font-mono font-bold text-gray-900">[{clan.clanTag}]</span>
                        <span className="t-card-title truncate">{clan.clanName}</span>
                      </span>
                      <span className="t-meta t-num">
                        {formatCount(clan.completedMatches)} / {formatCount(clan.totalMatches - clan.expiredMatches)} matchs (
                        {formatPercent(clan.completionRate)}) · {formatCount(clan.recoverableBacklog)} restant(s) dont{' '}
                        {formatCount(clan.inQueueCount)} en file et {formatCount(clan.toQueueCount)} à mettre en file
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {hasUrgent ? <Tag tone="neg">{formatCount(clan.urgentBacklog)} urgent(s)</Tag> : null}
                      {clan.toQueueCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleEnqueueBacklog({ clanId: clan.clanId, urgentOnly: false })}
                          disabled={enqueuing}
                          className="app-btn app-btn--xs app-btn--secondary gap-1"
                        >
                          <Play className="h-3 w-3" aria-hidden="true" />
                          Mettre en file {formatCount(clan.toQueueCount)}
                        </button>
                      ) : null}
                      <Link href={`/clans/${clan.clanId}/settings/data/recoveries`} className="app-btn app-btn--xs app-btn--secondary gap-1">
                        Détail du clan
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>

                  <CompletionBar
                    total={clan.totalMatches}
                    completed={clan.completedMatches}
                    inQueue={clan.inQueueCount}
                    toQueue={clan.toQueueCount}
                    expired={clan.expiredMatches}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-2">
                    {windowStat ? (
                      <>
                        <span className="t-meta t-num">
                          {formatCount(windowStat.total)} tentative(s) · taux de succès {formatPercent(windowStat.successRate)}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {windowStat.failed > 0 ? <Tag tone="neg">{formatCount(windowStat.failed)} échec(s)</Tag> : null}
                          {windowStat.expired > 0 ? <Tag tone="neutral">{formatCount(windowStat.expired)} expiré(s)</Tag> : null}
                          <Tag tone="pos">{formatCount(windowStat.success)} succès</Tag>
                        </span>
                      </>
                    ) : (
                      <span className="t-meta">Aucune tentative sur {WINDOW_LABELS[window]}.</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      <ToastStack toasts={toasts} onDismiss={() => setActionMessage(null)} />
    </div>
  )
}
