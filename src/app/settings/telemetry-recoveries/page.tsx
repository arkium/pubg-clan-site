'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HardDriveDownload,
  ListOrdered,
  Play,
  RefreshCw,
  Server,
  Zap,
} from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

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
  { value: '24h', label: '24 heures' },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: 'all', label: 'Tout' },
]

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
  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60
  return `${hours}h ${remainingMins}m`
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '-'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

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
  const [recalculating, setRecalculating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [reloadToken, setReloadToken] = useState(0)

  // Redirection si non authentifié
  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.replace('/login?redirect=/settings/telemetry-recoveries')
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

  // Action : Enqueuer tout le backlog ou les urgences
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
        text: `Mise en file effectuée : ${queuedCount} match(s) ajouté(s) à la file live-sync (${alreadyCount} déjà en file).`,
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

  // Action : Recalcul des agrégats
  const handleRecalculateAggregates = async () => {
    try {
      setRecalculating(true)
      setActionMessage(null)

      const res = await fetch('/api/clans/1/telemetry/recalc-aggregates-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all-clans' }),
      })

      if (!res.ok) {
        throw new Error('Échec du recalcul des agrégats')
      }

      setActionMessage({
        type: 'success',
        text: 'Job de recalcul des agrégats envoyé avec succès.',
      })
      setReloadToken((prev) => prev + 1)
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur lors du recalcul des agrégats',
      })
    } finally {
      setRecalculating(false)
    }
  }

  // Rendu de sécurité Auth / SuperUser
  if (authLoading) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Vérification des droits d&apos;accès...</p>
      </main>
    )
  }

  if (!authenticated) return null

  if (!isSuperUser) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
        <NavigationTrail
          currentLabel="Recoveries Télémétrie Cross-clans"
          currentHref="/settings/telemetry-recoveries"
          fallbackParent={{ href: '/settings/superuser', label: 'SuperUser' }}
        />
        <section className="app-panel p-6">
          <h1 className="text-xl font-bold text-amber-800 dark:text-amber-200">Accès restreint</h1>
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Cette page est réservée aux SuperUsers.</p>
          <Link href="/" className="mt-5 app-btn app-btn--md app-btn--secondary">
            Retour à l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  const worker = statusData?.worker
  const queue = statusData?.queue
  const scheduler = statusData?.scheduler
  const isWorkerActive = Boolean(worker?.alive)

  return (
    <main className="app-container app-main flex-1 space-y-4 pb-12">
      <NavigationTrail
        currentLabel="Recoveries Télémétrie Cross-clans"
        currentHref="/settings/telemetry-recoveries"
        fallbackParent={{ href: '/settings/superuser', label: 'SuperUser' }}
      />

      <section className="app-panel p-4">
        <SettingsPageHeader
          title="Télémétrie — Vue cross-clans & Pilotage"
          subtitle="Supervision du pipeline, complétion réelle, résorption du backlog et pilotage de la file d'attente."
        />
      </section>

      {/* Message de notification d'action */}
      {actionMessage && (
        <div
          className={`flex items-center justify-between rounded-xl p-3.5 text-sm font-medium border shadow-sm transition-all ${
            actionMessage.type === 'success'
              ? 'border-emerald-400 bg-emerald-50 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-100'
              : 'border-rose-400 bg-rose-50 text-rose-950 dark:border-rose-600 dark:bg-rose-950/60 dark:text-rose-100'
          }`}
        >
          <p className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertOctagon className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            {actionMessage.text}
          </p>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-xs font-bold underline opacity-80 hover:opacity-100"
          >
            Fermer
          </button>
        </div>
      )}

      {/* --- VOLET 1 : STATUT DU WORKER & FILE D'ATTENTE (Affichage immédiat) --- */}
      <section className="app-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Moteur de récupération télémétrie & File d&apos;attente
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings/cron"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200 underline flex items-center gap-1"
            >
              Console Cron & Workers
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {loadingStatus ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/50 p-3" />
            <div className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/50 p-3" />
            <div className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/50 p-3" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Statut Worker */}
            <div
              className={`app-panel-muted p-3.5 border-l-4 transition-colors ${
                isWorkerActive
                  ? 'border-l-emerald-500 border-emerald-300/40 dark:border-emerald-500/30'
                  : 'border-l-amber-500 border-amber-300/40 dark:border-amber-500/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Worker d&apos;ingestion
                </span>
                <span className={`status-pill ${isWorkerActive ? 'status-pill--online' : 'status-pill--pending'}`}>
                  <span
                    className={`status-dot ${
                      isWorkerActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`}
                  />
                  {isWorkerActive ? 'Actif' : 'Inactif'}
                </span>
              </div>
              <p className="mt-2 text-base font-extrabold text-slate-900 dark:text-white">
                {isWorkerActive ? `PID ${worker?.pid} en cours` : 'Arrêté'}
              </p>
              <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                {isWorkerActive
                  ? 'Traite les matchs de la file en continu.'
                  : 'Lancez "npm run telemetry:worker" pour dépiler.'}
              </p>
            </div>

            {/* État de la File live-sync */}
            <div className="app-panel-muted p-3.5 border-l-4 border-l-indigo-500 border-indigo-200/40 dark:border-indigo-500/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  File en direct (Queue)
                </span>
                <span className="app-meta-pill">
                  <ListOrdered className="h-3.5 w-3.5 opacity-70" />
                  {queue?.remaining ?? 0} restant(s)
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="text-2xl font-black text-slate-900 dark:text-white">{queue?.queued ?? 0}</span>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">en attente</span>
                <span className="text-xl font-black text-indigo-700 dark:text-indigo-300 ml-2">{queue?.running ?? 0}</span>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">en cours</span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                {isWorkerActive && (statusData?.etaSeconds ?? 0) > 0
                  ? `Fin estimée dans ~${formatDuration(statusData?.etaSeconds ?? null)}`
                  : `${queue?.success ?? 0} traités avec succès · ${queue?.failed ?? 0} échoués`}
              </p>
            </div>

            {/* Planification Automatique */}
            <div className="app-panel-muted p-3.5 border-l-4 border-l-blue-500 border-slate-200/60 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Planification (Cron)
                </span>
                <span className={`status-pill ${scheduler?.syncEnabled ? 'status-pill--online' : 'status-pill--offline'}`}>
                  <span
                    className={`status-dot ${
                      scheduler?.syncEnabled ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                  {scheduler?.syncEnabled ? 'Sync Auto Activée' : 'Sync Désactivée'}
                </span>
              </div>
              <p className="mt-2 text-sm font-extrabold text-slate-900 dark:text-white">
                Prochain cron : ~{formatTime(scheduler?.nextDailySyncEstimate ?? null)}
              </p>
              <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                Quota auto : max {scheduler?.maxMatchesPerRun ?? 50} matchs / clan / nuit.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* --- VOLET 2 : COMPLÉTION RÉELLE & BACKLOG RESTANT (Progressive loading) --- */}
      <section className="app-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <HardDriveDownload className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Complétion Globale & Reste à Récupérer (Backlog)
              </h2>
            </div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">
              Analyse complète des matchs joués par les clans vs télémétries réellement ingérées.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Bouton d'urgence : Sauver les matchs proches de 14j */}
            {backlogData && backlogData.urgentBacklog > 0 && (
              <button
                type="button"
                onClick={() => handleEnqueueBacklog({ urgentOnly: true })}
                disabled={enqueuing || refreshing}
                className="app-btn app-btn--sm bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 gap-1.5 shadow-sm font-bold"
              >
                <AlertTriangle className={`h-3.5 w-3.5 ${enqueuing ? 'animate-spin' : ''}`} />
                {enqueuing ? 'Enqueuement...' : `Sauver les ${backlogData.urgentBacklog} urgents (<14j)`}
              </button>
            )}

            {/* Bouton pour enqueuer tout le backlog récupérable */}
            <button
              type="button"
              onClick={() => handleEnqueueBacklog({ urgentOnly: false })}
              disabled={enqueuing || refreshing || !backlogData || backlogData.toQueueCount === 0}
              className="app-btn app-btn--sm app-btn--primary gap-1.5 font-bold"
            >
              <Zap className={`h-3.5 w-3.5 ${enqueuing ? 'animate-spin' : ''}`} />
              {enqueuing
                ? 'Mise en file...'
                : backlogData && backlogData.toQueueCount > 0
                ? `Enqueuer tout le restant (${backlogData.toQueueCount})`
                : 'Tout le backlog est en file'}
            </button>

            {/* Recalculer agrégats */}
            <button
              type="button"
              onClick={handleRecalculateAggregates}
              disabled={recalculating || refreshing}
              className="app-btn app-btn--sm app-btn--secondary gap-1.5 font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${recalculating ? 'animate-spin' : ''}`} />
              {recalculating ? 'Recalcul...' : 'Recalculer Agrégats'}
            </button>

            {/* Rafraîchir tout */}
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={refreshing || enqueuing || recalculating}
              className="app-btn app-btn--sm app-btn--secondary gap-1.5 font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Rafraîchissement...' : 'Rafraîchir'}
            </button>
          </div>
        </div>

        {/* Alerte Urgence PUBG 14 jours */}
        {backlogData && backlogData.urgentBacklog > 0 && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/50 p-4 text-rose-950 dark:text-rose-100 shadow-sm">
            <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-extrabold text-sm text-rose-900 dark:text-rose-100">
                Attention : {backlogData.urgentBacklog} match(s) risquent d&apos;expirer définitivement !
              </p>
              <p className="text-rose-800 dark:text-rose-200 leading-relaxed font-medium">
                L&apos;API PUBG purge les fichiers de télémétrie après 14 jours. Ces matchs datent de 7 à
                13 jours : enclenchez leur récupération immédiatement avant qu&apos;ils ne soient perdus.
              </p>
            </div>
          </div>
        )}

        {/* KPIs de complétion globale */}
        {loadingBacklog ? (
          <div className="space-y-3">
            <div className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/50" />
            <div className="grid gap-3 sm:grid-cols-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/50 p-3" />
              ))}
            </div>
          </div>
        ) : backlogData ? (
          <div className="space-y-4">
            {/* Jauge globale en grand */}
            <div className="app-panel-muted p-4 border border-slate-200 dark:border-slate-700/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Taux de complétion réel cross-clans
                  </span>
                  <div className="flex items-baseline gap-2.5 mt-1">
                    <span className="text-3xl sm:text-4xl font-black text-indigo-700 dark:text-indigo-300">
                      {formatPercent(backlogData.completionRate)}
                    </span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      ({backlogData.completedMatches.toLocaleString()} /{' '}
                      {(backlogData.totalMatches - backlogData.expiredMatches).toLocaleString()}{' '}
                      matchs récupérables)
                    </span>
                  </div>
                </div>

                <div className="text-right text-xs">
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                    <strong>{backlogData.recoverableBacklog}</strong> match(s) restant(s) à récupérer
                  </p>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                    {backlogData.inQueueCount} en file active · {backlogData.toQueueCount} à enqueuer
                  </p>
                </div>
              </div>

              {/* Barre de progression multiniveaux */}
              <div className="mt-3.5 flex h-3.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                {/* Complétés avec succès */}
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${
                      backlogData.totalMatches > 0
                        ? (backlogData.completedMatches / backlogData.totalMatches) * 100
                        : 0
                    }%`,
                  }}
                  title={`Complétés: ${backlogData.completedMatches}`}
                />
                {/* En file active */}
                <div
                  className="h-full bg-indigo-500 transition-all duration-500"
                  style={{
                    width: `${
                      backlogData.totalMatches > 0
                        ? (backlogData.inQueueCount / backlogData.totalMatches) * 100
                        : 0
                    }%`,
                  }}
                  title={`En file active: ${backlogData.inQueueCount}`}
                />
                {/* À enqueuer */}
                <div
                  className="h-full bg-amber-400 transition-all duration-500"
                  style={{
                    width: `${
                      backlogData.totalMatches > 0
                        ? (backlogData.toQueueCount / backlogData.totalMatches) * 100
                        : 0
                    }%`,
                  }}
                  title={`À enqueuer: ${backlogData.toQueueCount}`}
                />
                {/* Expirés PUBG (>14j) */}
                <div
                  className="h-full bg-slate-400 dark:bg-slate-500 transition-all duration-500"
                  style={{
                    width: `${
                      backlogData.totalMatches > 0
                        ? (backlogData.expiredMatches / backlogData.totalMatches) * 100
                        : 0
                    }%`,
                  }}
                  title={`Expirés >14j (non récupérables): ${backlogData.expiredMatches}`}
                />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                  {backlogData.completedMatches} complétés
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shrink-0" />
                  {backlogData.inQueueCount} en file
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0" />
                  {backlogData.toQueueCount} à enqueuer
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                  {backlogData.expiredMatches} expirés PUBG (&gt;14j)
                </span>
              </div>
            </div>

            {/* Cartes métriques détaillées selon le pattern design system .app-panel-muted avec bordures accentuées */}
            <div className="grid gap-2.5 sm:grid-cols-5 text-sm">
              <div className="app-panel-muted p-3.5 border-l-4 border-l-blue-500 border-slate-200/60 dark:border-slate-700">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Total Matchs Éligibles</p>
                <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{backlogData.totalMatches}</p>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-0.5">Historique non casual</p>
              </div>

              <div className="app-panel-muted p-3.5 border-l-4 border-l-emerald-500 border-emerald-300/40 dark:border-emerald-500/30">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Télémétries Validées</p>
                <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-200">
                  {backlogData.completedMatches}
                </p>
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mt-0.5">
                  {formatPercent(backlogData.completionRate)} des vivants
                </p>
              </div>

              <div className="app-panel-muted p-3.5 border-l-4 border-l-indigo-500 border-indigo-300/40 dark:border-indigo-500/30">
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">Dans la File (Queue)</p>
                <p className="mt-1 text-2xl font-black text-indigo-700 dark:text-indigo-200">
                  {backlogData.inQueueCount}
                </p>
                <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 mt-0.5">En cours de dépilage</p>
              </div>

              <div className="app-panel-muted p-3.5 border-l-4 border-l-amber-500 border-amber-300/40 dark:border-amber-500/30">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Reste à Enqueuer</p>
                <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-200">
                  {backlogData.toQueueCount}
                </p>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mt-0.5">Matchs vivants &lt; 14 jours</p>
              </div>

              <div className="app-panel-muted p-3.5 border-l-4 border-l-slate-400 border-slate-200/60 dark:border-slate-700">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Expirés Définitifs</p>
                <p className="mt-1 text-2xl font-black text-slate-800 dark:text-slate-200">
                  {backlogData.expiredMatches}
                </p>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-0.5">Plus de 14 jours PUBG</p>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* --- VOLET 3 : RÉPARTITION PAR CLAN & HISTORIQUE RÉCENT --- */}
      <section className="app-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Répartition par Clan & Activité Récente
            </h2>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">
              Complétion du clan et détail des tentatives sur la fenêtre sélectionnée.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Fenêtre d&apos;activité :</span>
            <SegmentedControl
              size="sm"
              value={window}
              onChange={(value) => setWindow(value)}
              options={WINDOW_OPTIONS}
            />
          </div>
        </div>

        {/* Liste des clans */}
        <div className="space-y-3">
          {loadingBacklog && loadingOverview ? (
            <div className="space-y-2">
              <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />
              <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />
            </div>
          ) : !backlogData || backlogData.clans.length === 0 ? (
            <p className="app-panel-muted p-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Aucun clan suivi n&apos;a été trouvé.
            </p>
          ) : (
            backlogData.clans.map((clan) => {
              // Réconciliation avec la fenêtre récente
              const windowStat = windowClans.find((w) => w.clanId === clan.clanId)
              const hasUrgent = clan.urgentBacklog > 0
              const isLowCompletion =
                clan.completionRate !== null && clan.completionRate < 80

              return (
                <div
                  key={clan.clanId}
                  className={`app-panel-muted p-4 text-sm transition-all border border-slate-200 dark:border-slate-700/80 ${
                    hasUrgent
                      ? 'border-l-4 border-l-rose-500 border-rose-300/50 dark:border-rose-800/60'
                      : isLowCompletion
                      ? 'border-l-4 border-l-amber-500 border-amber-300/40 dark:border-amber-800/50'
                      : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-black text-slate-900 dark:text-white text-base">
                        {hasUrgent ? (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        ) : null}
                        {clan.clanName}{' '}
                        <span className="text-slate-600 dark:text-slate-300 font-normal">[{clan.clanTag}]</span>
                      </p>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1">
                        Complétion :{' '}
                        <strong className="text-slate-900 dark:text-white font-bold">
                          {clan.completedMatches} / {clan.totalMatches - clan.expiredMatches}
                        </strong>{' '}
                        matchs ({formatPercent(clan.completionRate)}) ·{' '}
                        <span className="text-indigo-700 dark:text-indigo-300 font-extrabold">
                          {clan.recoverableBacklog} restant(s)
                        </span>{' '}
                        ({clan.inQueueCount} en file, <span className="text-amber-700 dark:text-amber-300 font-bold">{clan.toQueueCount} à enqueuer</span>)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {/* Badge Urgent */}
                      {clan.urgentBacklog > 0 && (
                        <span className="status-pill status-pill--error">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {clan.urgentBacklog} urgent(s) (&lt;14j)
                        </span>
                      )}

                      {/* Action enqueuer ce clan */}
                      {clan.toQueueCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            handleEnqueueBacklog({ clanId: clan.clanId, urgentOnly: false })
                          }
                          disabled={enqueuing}
                          className="app-btn app-btn--xs app-btn--primary gap-1"
                        >
                          <Play className="h-3 w-3" />
                          Enqueuer {clan.toQueueCount}
                        </button>
                      )}

                      {/* Lien détail clan */}
                      <Link
                        href={`/clans/${clan.clanId}/telemetry/recoveries`}
                        className="app-btn app-btn--xs app-btn--secondary gap-1"
                      >
                        Détail clan
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>

                  {/* Barre de complétion du clan */}
                  <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                    <div
                      className="h-full bg-emerald-500"
                      style={{
                        width: `${
                          clan.totalMatches > 0
                            ? (clan.completedMatches / clan.totalMatches) * 100
                            : 0
                        }%`,
                      }}
                    />
                    <div
                      className="h-full bg-indigo-500"
                      style={{
                        width: `${
                          clan.totalMatches > 0
                            ? (clan.inQueueCount / clan.totalMatches) * 100
                            : 0
                        }%`,
                      }}
                    />
                    <div
                      className="h-full bg-amber-400"
                      style={{
                        width: `${
                          clan.totalMatches > 0
                            ? (clan.toQueueCount / clan.totalMatches) * 100
                            : 0
                        }%`,
                      }}
                    />
                    <div
                      className="h-full bg-slate-400 dark:bg-slate-500"
                      style={{
                        width: `${
                          clan.totalMatches > 0
                            ? (clan.expiredMatches / clan.totalMatches) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  {/* Activité récente sur la fenêtre sélectionnée */}
                  {windowStat ? (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-700/80 pt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span>
                        Activité fenêtre <strong className="text-slate-900 dark:text-white">{window}</strong> : {windowStat.total}{' '}
                        tentative(s) (taux de succès {formatPercent(windowStat.successRate)})
                      </span>
                      <div className="flex items-center gap-1.5">
                        {windowStat.failed > 0 && (
                          <span className="status-pill status-pill--error" style={{ padding: '0.125rem 0.5rem', fontSize: '0.7rem' }}>
                            <span className="status-dot bg-rose-500" style={{ width: '0.375rem', height: '0.375rem' }} />
                            {windowStat.failed} échec(s)
                          </span>
                        )}
                        {windowStat.expired > 0 && (
                          <span className="status-pill status-pill--offline" style={{ padding: '0.125rem 0.5rem', fontSize: '0.7rem' }}>
                            <span className="status-dot bg-slate-400" style={{ width: '0.375rem', height: '0.375rem' }} />
                            {windowStat.expired} expiré(s)
                          </span>
                        )}
                        <span className="status-pill status-pill--online" style={{ padding: '0.125rem 0.5rem', fontSize: '0.7rem' }}>
                          <span className="status-dot bg-emerald-500" style={{ width: '0.375rem', height: '0.375rem' }} />
                          {windowStat.success} succès
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2.5 border-t border-slate-200 dark:border-slate-700/80 pt-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                      Aucune tentative sur la fenêtre {window}.
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </section>
    </main>
  )
}
