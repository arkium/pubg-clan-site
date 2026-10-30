/**
 * Fraîcheur des parties (docs/TODO/fraicheur-des-parties.md) — module pur, sans base.
 *
 * La synchronisation des parties se mesure elle-même : à chaque tour, le délai entre la fin de chaque partie importée et
 * son import, la durée du tour, les tours sautés, les parties dont la lecture a échoué (« en attente », retentées au tour
 * suivant) et les compteurs d'appels PUBG. L'état glissant de 24 h tient dans `AppConfig.match_sync_health` (une écriture
 * par tour, par le service cron seul) ; `/settings/cron`, la boîte « À traiter » et l'alerte Discord lisent son résumé.
 * Jamais de requête sur `Match` pour le recalculer dans une page : elle regroupe toute la table (~30 s).
 */

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

export const MATCH_SYNC_HEALTH_WINDOW_MS = 24 * HOUR_MS
/** Délais gardés au plus sur 24 h (~1 300 parties par jour en octobre 2026). */
export const MAX_STORED_DELAYS = 2_000
/** Au-delà, l'import n'est pas une partie récente mais un rattrapage (nouveau membre, historique) : hors délai. */
export const CATCH_UP_MINUTES = 24 * 60
/** En dessous, le délai s'affiche sans ton ni alerte (la nuit, une poignée de parties ne dit rien). */
export const MIN_MATCHES_FOR_DELAY_TONE = 20
/** Une partie en échec devient « perdue » 24 h après son premier échec, ou après 6 essais. */
export const PENDING_LOST_AFTER_MS = 24 * HOUR_MS
export const PENDING_MAX_ATTEMPTS = 6
/** Une partie perdue reste affichée 7 jours. */
export const LOST_KEPT_MS = 7 * 24 * HOUR_MS
export const MAX_PENDING = 200
/** Rappel d'une alerte Discord tant que l'état reste dégradé. */
export const ALERT_REMINDER_MS = 6 * HOUR_MS

/** Seuils du §3 du plan — la page, la boîte « À traiter » et Discord lisent les mêmes. */
export const MATCH_SYNC_THRESHOLDS = {
  /** Promesse affichée sur la page Discord du clan. */
  delayPromiseMinutes: 45,
  delayP90TodoMinutes: 60,
  delayP90UrgentMinutes: 120,
  /** Durée médiane d'un tour sur son intervalle. */
  passMarginOk: 0.6,
  passMarginTodo: 0.8,
  skippedUrgentConsecutive: 3,
  /** Dernier tour terminé il y a plus de 2 intervalles + 30 min : la synchronisation est arrêtée. */
  staleExtraMinutes: 30,
  quotaWarn: 0.85,
  quotaTodo: 0.95,
  http429Urgent: 20,
  transientLastHourTodo: 10,
} as const

export type MatchSyncHealthStatus = 'ok' | 'todo' | 'urgent'

export type MatchSyncPassRecord = {
  startedAt: string
  finishedAt: string
  clans: number
  failedClans: number
  importedMatches: number
  /** Minutes entre la fin de chaque partie importée et son import, par clan et par partie, hors rattrapages. */
  delays: number[]
  catchUps: number
}

/** Une ligne par membre : chaque membre a sa propre ligne `Match` de la partie. */
export type PendingMatch = {
  matchId: string
  clanId: number
  memberId: number
  firstFailedAt: string
  lastFailedAt: string
  attempts: number
  lastStatus: number | null
  lostAt: string | null
}

export type PubgCallCounts = {
  at: string
  limitedLastHour: number
  ceilingPerHour: number
  http429Last24h: number
  actionLast24h: number
  transientLastHour: number
}

export type MatchSyncHealthState = {
  version: 1
  passes: MatchSyncPassRecord[]
  skipped: string[]
  pending: PendingMatch[]
  calls: PubgCallCounts | null
  alert: { status: MatchSyncHealthStatus; lastAlertAt: string | null }
}

export function emptyMatchSyncHealthState(): MatchSyncHealthState {
  return { version: 1, passes: [], skipped: [], pending: [], calls: null, alert: { status: 'ok', lastAlertAt: null } }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Valeur de `AppConfig` (JSON) → état ; `null` si elle est illisible (jamais un état vide déguisé). */
export function parseMatchSyncHealthState(raw: string): MatchSyncHealthState | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || value.version !== 1) return null
  if (!Array.isArray(value.passes) || !Array.isArray(value.skipped) || !Array.isArray(value.pending)) return null
  const alert = isRecord(value.alert) ? value.alert : {}
  return {
    version: 1,
    passes: value.passes as MatchSyncPassRecord[],
    skipped: value.skipped.filter((entry): entry is string => typeof entry === 'string'),
    pending: value.pending as PendingMatch[],
    calls: isRecord(value.calls) ? (value.calls as PubgCallCounts) : null,
    alert: {
      status: alert.status === 'todo' || alert.status === 'urgent' ? alert.status : 'ok',
      lastAlertAt: typeof alert.lastAlertAt === 'string' ? alert.lastAlertAt : null,
    },
  }
}

const time = (iso: string) => new Date(iso).getTime()

/** Ajoute un tour et retire ce qui sort des 24 h ; les délais les plus anciens partent d'abord au-delà de 2 000. */
export function recordPass(state: MatchSyncHealthState, pass: MatchSyncPassRecord, now: Date): MatchSyncHealthState {
  const since = now.getTime() - MATCH_SYNC_HEALTH_WINDOW_MS
  const passes = [...state.passes, pass].filter((entry) => time(entry.finishedAt) >= since).map((entry) => ({ ...entry }))
  let excess = passes.reduce((sum, entry) => sum + entry.delays.length, 0) - MAX_STORED_DELAYS
  for (const entry of passes) {
    if (excess <= 0) break
    const removed = Math.min(excess, entry.delays.length)
    entry.delays = entry.delays.slice(removed)
    excess -= removed
  }
  return { ...state, passes, skipped: state.skipped.filter((at) => time(at) >= since) }
}

/** Un déclenchement tombé pendant un tour en cours (`clanSyncInProgress`). */
export function recordSkippedTrigger(state: MatchSyncHealthState, at: Date): MatchSyncHealthState {
  const since = at.getTime() - MATCH_SYNC_HEALTH_WINDOW_MS
  return { ...state, skipped: [...state.skipped.filter((entry) => time(entry) >= since), at.toISOString()] }
}

// ── Parties en attente ──────────────────────────────────────────────────────────────────────────────────────────────

/** Parties à retenter pour un membre, même absentes de la liste lue chez PUBG (les perdues ne le sont plus). */
export function pendingRetryIds(pending: readonly PendingMatch[], memberId: number): string[] {
  return pending.filter((entry) => entry.memberId === memberId && !entry.lostAt).map((entry) => entry.matchId)
}

export function notePendingFailure(
  pending: readonly PendingMatch[],
  failure: { matchId: string; clanId: number; memberId: number; status: number | null; at: Date }
): PendingMatch[] {
  const at = failure.at.toISOString()
  const existing = pending.find((entry) => entry.memberId === failure.memberId && entry.matchId === failure.matchId)
  if (existing) {
    return pending.map((entry) =>
      entry === existing ? { ...entry, attempts: entry.attempts + 1, lastFailedAt: at, lastStatus: failure.status } : entry
    )
  }
  const next = [
    ...pending,
    {
      matchId: failure.matchId,
      clanId: failure.clanId,
      memberId: failure.memberId,
      firstFailedAt: at,
      lastFailedAt: at,
      attempts: 1,
      lastStatus: failure.status,
      lostAt: null,
    },
  ]
  // Borne : les perdues les plus anciennes partent d'abord, puis les plus anciennes en attente.
  while (next.length > MAX_PENDING) {
    const lostIndex = next.findIndex((entry) => entry.lostAt)
    next.splice(lostIndex >= 0 ? lostIndex : 0, 1)
  }
  return next
}

export function clearPending(pending: readonly PendingMatch[], memberId: number, matchId: string): PendingMatch[] {
  return pending.filter((entry) => !(entry.memberId === memberId && entry.matchId === matchId))
}

/** Passe en « perdue » ce qui échoue depuis 24 h ou 6 essais ; oublie les perdues de plus de 7 jours. */
export function expirePending(pending: readonly PendingMatch[], now: Date): PendingMatch[] {
  return pending
    .map((entry) =>
      !entry.lostAt && (now.getTime() - time(entry.firstFailedAt) >= PENDING_LOST_AFTER_MS || entry.attempts >= PENDING_MAX_ATTEMPTS)
        ? { ...entry, lostAt: now.toISOString() }
        : entry
    )
    .filter((entry) => !entry.lostAt || now.getTime() - time(entry.lostAt) < LOST_KEPT_MS)
}

// ── Résumé ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type MatchSyncHealthReason = { key: string; tone: Exclude<MatchSyncHealthStatus, 'ok'>; text: string }

export type PendingMatchSummary = {
  matchId: string
  clanId: number
  firstFailedAt: string
  attempts: number
  lastStatus: number | null
  lost: boolean
}

export type MatchSyncHealthSummary = {
  generatedAt: string
  intervalMinutes: number | null
  /** Au moins un tour mesuré. Sans tour : « Pas encore de mesure », jamais un faux zéro. */
  measured: boolean
  delay: {
    count: number
    median: number | null
    p90: number | null
    underPromiseShare: number | null
    catchUps: number
    /** Assez de parties pour juger le délai. */
    toned: boolean
  }
  lastPass: {
    startedAt: string
    finishedAt: string
    durationMinutes: number
    clans: number
    failedClans: number
    importedMatches: number
  } | null
  passes: { count: number; medianDurationMinutes: number | null; maxDurationMinutes: number | null; marginRatio: number | null }
  skipped: { last24h: number; consecutive: number }
  pending: { waiting: number; lost: number; oldestFailedAt: string | null; entries: PendingMatchSummary[] }
  calls: (PubgCallCounts & { quotaRatio: number | null }) | null
  status: MatchSyncHealthStatus
  reasons: MatchSyncHealthReason[]
}

function quantile(sorted: readonly number[], q: number) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null
}

const round1 = (value: number) => Math.round(value * 10) / 10

function formatMinutes(minutes: number) {
  if (minutes < 120) return `${Math.round(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`
}

const plural = (count: number, singular: string, pluralForm: string) => (count > 1 ? pluralForm : singular)

/** Parties distinctes (une partie en échec pour quatre membres compte une fois). */
function distinctPending(pending: readonly PendingMatch[]): PendingMatchSummary[] {
  const byMatch = new Map<string, PendingMatchSummary>()
  for (const entry of pending) {
    const current = byMatch.get(entry.matchId)
    if (!current) {
      byMatch.set(entry.matchId, {
        matchId: entry.matchId,
        clanId: entry.clanId,
        firstFailedAt: entry.firstFailedAt,
        attempts: entry.attempts,
        lastStatus: entry.lastStatus,
        lost: Boolean(entry.lostAt),
      })
      continue
    }
    if (time(entry.firstFailedAt) < time(current.firstFailedAt)) current.firstFailedAt = entry.firstFailedAt
    current.attempts = Math.max(current.attempts, entry.attempts)
    current.lost = current.lost && Boolean(entry.lostAt)
  }
  return [...byMatch.values()].sort((a, b) => time(a.firstFailedAt) - time(b.firstFailedAt))
}

export function summarizeMatchSyncHealth(
  state: MatchSyncHealthState,
  options: { now: Date; intervalMinutes: number | null }
): MatchSyncHealthSummary {
  const { now, intervalMinutes } = options
  const since = now.getTime() - MATCH_SYNC_HEALTH_WINDOW_MS
  const passes = state.passes.filter((pass) => time(pass.finishedAt) >= since)
  const delays = passes.flatMap((pass) => pass.delays).sort((a, b) => a - b)
  const catchUps = passes.reduce((sum, pass) => sum + pass.catchUps, 0)
  const durations = passes.map((pass) => (time(pass.finishedAt) - time(pass.startedAt)) / MINUTE_MS).sort((a, b) => a - b)
  const medianDuration = quantile(durations, 0.5)
  const last = state.passes.at(-1) ?? null
  const skippedRecent = state.skipped.filter((at) => time(at) >= since)
  const consecutive = last ? state.skipped.filter((at) => time(at) > time(last.startedAt)).length : skippedRecent.length
  const entries = distinctPending(state.pending)
  const calls = state.calls
    ? { ...state.calls, quotaRatio: state.calls.ceilingPerHour > 0 ? state.calls.limitedLastHour / state.calls.ceilingPerHour : null }
    : null

  const p90 = quantile(delays, 0.9)
  const toned = delays.length >= MIN_MATCHES_FOR_DELAY_TONE
  const marginRatio = medianDuration !== null && intervalMinutes ? medianDuration / intervalMinutes : null
  const waiting = entries.filter((entry) => !entry.lost)
  const lost = entries.filter((entry) => entry.lost)
  const t = MATCH_SYNC_THRESHOLDS

  const reasons: MatchSyncHealthReason[] = []
  if (last && intervalMinutes) {
    const sinceLast = (now.getTime() - time(last.finishedAt)) / MINUTE_MS
    if (sinceLast > 2 * intervalMinutes + t.staleExtraMinutes) {
      reasons.push({ key: 'stale', tone: 'urgent', text: `Aucun tour terminé depuis ${formatMinutes(sinceLast)}` })
    }
  }
  if (calls && calls.actionLast24h > 0) {
    reasons.push({
      key: 'action',
      tone: 'urgent',
      text: `${calls.actionLast24h} ${plural(calls.actionLast24h, 'échec', 'échecs')} PUBG à traiter en 24 h (clé refusée ou appel mal formé)`,
    })
  }
  if (toned && p90 !== null && p90 > t.delayP90TodoMinutes) {
    reasons.push({
      key: 'delay',
      tone: p90 > t.delayP90UrgentMinutes ? 'urgent' : 'todo',
      text: `90 % des parties arrivent en ${formatMinutes(p90)} ou moins après leur fin (promesse : ${t.delayPromiseMinutes} min)`,
    })
  }
  if (consecutive >= t.skippedUrgentConsecutive) {
    reasons.push({ key: 'skipped', tone: 'urgent', text: `${consecutive} tours sautés de suite : le tour en cours ne finit pas` })
  } else if (skippedRecent.length > 0) {
    reasons.push({
      key: 'skipped',
      tone: 'todo',
      text: `${skippedRecent.length} ${plural(skippedRecent.length, 'tour sauté', 'tours sautés')} en 24 h (le tour précédent n'était pas fini)`,
    })
  }
  if (calls && calls.http429Last24h > 0) {
    reasons.push({
      key: 'http429',
      tone: calls.http429Last24h >= t.http429Urgent ? 'urgent' : 'todo',
      text: `${calls.http429Last24h} ${plural(calls.http429Last24h, 'réponse', 'réponses')} 429 de PUBG en 24 h`,
    })
  }
  if (lost.length > 0) {
    reasons.push({
      key: 'lost',
      tone: 'todo',
      text: `${lost.length} ${plural(lost.length, 'partie perdue', 'parties perdues')} : toujours pas ${plural(lost.length, 'importée', 'importées')} 24 h après le premier échec`,
    })
  }
  if (calls && calls.transientLastHour >= t.transientLastHourTodo) {
    reasons.push({ key: 'transient', tone: 'todo', text: `${calls.transientLastHour} échecs passagers de PUBG sur la dernière heure` })
  }
  if (calls?.quotaRatio != null && calls.quotaRatio >= t.quotaTodo) {
    reasons.push({ key: 'quota', tone: 'todo', text: `Quota PUBG à ${Math.round(calls.quotaRatio * 100)} % sur la dernière heure` })
  }
  if (marginRatio !== null && marginRatio > t.passMarginTodo && medianDuration !== null && intervalMinutes) {
    reasons.push({
      key: 'margin',
      tone: 'todo',
      text: `Un tour dure ${formatMinutes(medianDuration)} pour un intervalle de ${formatMinutes(intervalMinutes)} : des tours risquent d'être sautés`,
    })
  }
  reasons.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'urgent' ? -1 : 1))

  return {
    generatedAt: now.toISOString(),
    intervalMinutes,
    measured: passes.length > 0 || last !== null,
    delay: {
      count: delays.length,
      median: quantile(delays, 0.5),
      p90,
      underPromiseShare: delays.length
        ? Math.round((100 * delays.filter((value) => value <= t.delayPromiseMinutes).length) / delays.length) / 100
        : null,
      catchUps,
      toned,
    },
    lastPass: last
      ? {
          startedAt: last.startedAt,
          finishedAt: last.finishedAt,
          durationMinutes: round1((time(last.finishedAt) - time(last.startedAt)) / MINUTE_MS),
          clans: last.clans,
          failedClans: last.failedClans,
          importedMatches: last.importedMatches,
        }
      : null,
    passes: {
      count: passes.length,
      medianDurationMinutes: medianDuration === null ? null : round1(medianDuration),
      maxDurationMinutes: durations.length ? round1(durations[durations.length - 1]) : null,
      marginRatio: marginRatio === null ? null : Math.round(marginRatio * 100) / 100,
    },
    skipped: { last24h: skippedRecent.length, consecutive },
    pending: {
      waiting: waiting.length,
      lost: lost.length,
      oldestFailedAt: waiting[0]?.firstFailedAt ?? null,
      entries,
    },
    calls,
    status: reasons.some((reason) => reason.tone === 'urgent') ? 'urgent' : reasons.length > 0 ? 'todo' : 'ok',
    reasons,
  }
}

// ── Alerte ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const SEVERITY: Record<MatchSyncHealthStatus, number> = { ok: 0, todo: 1, urgent: 2 }

/**
 * Faut-il prévenir le SuperUser ? À l'entrée dans un état dégradé, quand il s'aggrave, puis au plus toutes les 6 h tant
 * qu'il dure ; une fois au retour à la normale. Jamais à chaque tour.
 */
export function decideMatchSyncAlert(
  previous: MatchSyncHealthState['alert'],
  status: MatchSyncHealthStatus,
  now: Date
): { send: 'alert' | 'recovered' | null; alert: MatchSyncHealthState['alert'] } {
  if (status === 'ok') {
    return previous.status === 'ok'
      ? { send: null, alert: previous }
      : { send: 'recovered', alert: { status: 'ok', lastAlertAt: previous.lastAlertAt } }
  }
  const worse = SEVERITY[status] > SEVERITY[previous.status]
  const reminderDue = !previous.lastAlertAt || now.getTime() - time(previous.lastAlertAt) >= ALERT_REMINDER_MS
  if (worse || reminderDue) return { send: 'alert', alert: { status, lastAlertAt: now.toISOString() } }
  return { send: null, alert: { status, lastAlertAt: previous.lastAlertAt } }
}
