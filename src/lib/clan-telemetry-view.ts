/**
 * Lecture des files du worker de télémétrie pour les pages « Données » d'un clan (docs/TODO/administration.md §8).
 * Calcul pur, partagé par « Santé des données » et « Récupérations », sans dépendance serveur.
 *
 * Deux files distinctes, consommées par le même worker :
 * - récupération PUBG (`telemetry_live_sync`) : télécharge le fichier chez PUBG puis l'analyse ;
 * - retraitement de fichiers (`telemetry_resync_file`) : réanalyse un fichier déjà capturé sur le serveur.
 */

// ── Fenêtres ────────────────────────────────────────────────────────────────────────────────────

export type TelemetryWindow = '24h' | '7d' | '30d' | 'all'

export const TELEMETRY_WINDOW_OPTIONS: Array<{ value: TelemetryWindow; label: string }> = [
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 j' },
  { value: '30d', label: '30 j' },
  { value: 'all', label: 'Tout' },
]

const WINDOW_MS: Record<Exclude<TelemetryWindow, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

// ── File de récupération PUBG : observabilité (`GET …/telemetry/observability`) ─────────────────

export type LiveSyncJob = {
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

export type TelemetryObservability = {
  summary: { runs: number; success: number; failed: number; expired: number; bytesDownloaded: number }
  health: {
    ratedRuns: number
    successRate: number
    failedRate: number
    alerts: Array<{ key: string; label: string; value: number; threshold: number; status: 'ok' | 'warning' }>
  }
  latency: { p95DurationMs: number }
  series: LiveSyncJob[]
}

/** La route renvoie ses données à la racine et sous `data` (contrat de l'API de télémétrie) : on accepte les deux. */
export function pickObservability(payload: unknown): TelemetryObservability | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Partial<TelemetryObservability> & { ok?: boolean; data?: Partial<TelemetryObservability> }
  if (root.ok === false) return null
  const summary = root.data?.summary ?? root.summary
  const health = root.data?.health ?? root.health
  const latency = root.data?.latency ?? root.latency
  const series = root.data?.series ?? root.series
  if (!summary || !health || !latency || !Array.isArray(series)) return null
  return { summary, health, latency, series }
}

/** Libellés des alertes de seuil, en français (la route les renvoie sans accents). */
export const OBSERVABILITY_ALERT_LABELS: Record<string, string> = {
  failed_rate: 'Taux d’échec des jobs',
  duration_p95_ms: 'Durée p95 des jobs',
}

// ── File de retraitement de fichiers (`GET …/telemetry/sync-batch-manual`) ──────────────────────

export type ResyncFileQueue = {
  queue: { queued: number; running: number; success: number; failed: number; total: number }
  recentJobs: Array<{ id: string; status: string; message: string | null; createdAt: string; finishedAt: string | null }>
}

export function pickResyncFileQueue(payload: unknown): ResyncFileQueue | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Partial<ResyncFileQueue>
  if (!root.queue) return null
  return { queue: root.queue, recentJobs: Array.isArray(root.recentJobs) ? root.recentJobs : [] }
}

// ── Échecs des deux files, en une seule liste ───────────────────────────────────────────────────

export type TelemetryFailure =
  | {
      queue: 'pubg'
      jobId: string
      squadMatchId: string
      pubgMatchId: string | null
      at: string
      code: string | null
      message: string | null
    }
  | { queue: 'file'; jobId: string; at: string; code: null; message: string | null }

/**
 * Échecs de récupération à relancer : le **dernier** job de chaque partie, s'il a échoué pour une autre raison que
 * l'expiration chez PUBG (fichier perdu, rien à relancer). Une partie relancée puis réussie disparaît de la liste.
 * `series` est trié du plus récent au plus ancien, comme la route le renvoie.
 */
export function pubgFailures(series: readonly LiveSyncJob[]): TelemetryFailure[] {
  const seen = new Set<string>()
  const failures: TelemetryFailure[] = []
  for (const job of series) {
    if (!job.squadMatchId || seen.has(job.squadMatchId)) continue
    seen.add(job.squadMatchId)
    if (job.status !== 'failed' || job.expired) continue
    failures.push({
      queue: 'pubg',
      jobId: job.id,
      squadMatchId: job.squadMatchId,
      pubgMatchId: job.pubgMatchId,
      at: job.finishedAt ?? job.startedAt,
      code: job.errorCode,
      message: job.errorMessage,
    })
  }
  return failures
}

/** Échecs de retraitement parmi les derniers jobs de la file, dans la fenêtre choisie. */
export function fileFailures(jobs: ResyncFileQueue['recentJobs'], window: TelemetryWindow, now: number): TelemetryFailure[] {
  return jobs
    .filter((job) => job.status === 'failed')
    .map((job) => ({ queue: 'file' as const, jobId: job.id, at: job.finishedAt ?? job.createdAt, code: null, message: job.message }))
    .filter((failure) => window === 'all' || now - new Date(failure.at).getTime() < WINDOW_MS[window])
}

/** Au plus 50 relances par file et par appel, comme les routes de relance. */
export const RETRY_BATCH_MAX = 50

/** Relance : les parties pour la file PUBG (nouvelle mise en file), les jobs pour la file de retraitement. */
export function retryTargets(failures: readonly TelemetryFailure[]) {
  const squadMatchIds = [...new Set(failures.flatMap((failure) => (failure.queue === 'pubg' ? [failure.squadMatchId] : [])))]
  const jobIds = failures.flatMap((failure) => (failure.queue === 'file' ? [failure.jobId] : []))
  return { squadMatchIds: squadMatchIds.slice(0, RETRY_BATCH_MAX), jobIds: jobIds.slice(0, RETRY_BATCH_MAX) }
}

// ── Formats ─────────────────────────────────────────────────────────────────────────────────────

const percentFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export function formatPercent(value: number | null) {
  return value === null || !Number.isFinite(value) ? '—' : `${percentFormat.format(value)} %`
}

export function formatMilliseconds(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return '—'
  return value < 1000 ? `${Math.round(value)} ms` : `${percentFormat.format(value / 1000)} s`
}
