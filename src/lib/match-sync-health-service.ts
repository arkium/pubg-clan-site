import 'server-only'

import { matchSyncDegradedAlert, matchSyncRecoveredAlert } from '@/lib/admin-alerts/messages'
import { fireAdminAlert } from '@/lib/admin-alerts/send'
import { getCronRunsPerDay } from '@/lib/cron-frequency'
import { resolveCronSchedule } from '@/lib/cron-schedule-runner'
import {
  clearPending,
  decideMatchSyncAlert,
  emptyMatchSyncHealthState,
  expirePending,
  notePendingFailure,
  parseMatchSyncHealthState,
  pendingRetryIds,
  recordPass,
  recordSkippedTrigger,
  summarizeMatchSyncHealth,
  type MatchSyncHealthState,
  type MatchSyncHealthSummary,
  type PendingMatch,
  type PubgCallCounts,
} from '@/lib/match-sync-health'
import type { PendingMatchTracker, SyncClanMatchesResult } from '@/lib/matches-sync-service'
import { prisma } from '@/lib/prisma'
import { classifyPubgApiFailure } from '@/lib/pubg-api-call-category'
import { getPubgApiRateLimitRpm } from '@/lib/pubg-rate-limit-config-service'
import { SCHEDULE_VARIABLES } from '@/lib/site-config'

/**
 * Fraîcheur des parties — lecture et écriture de l'état (`AppConfig.match_sync_health`, docs/TODO/fraicheur-des-parties.md).
 *
 * Un seul écrivain : la synchronisation planifiée, dans le service cron (`runDailyClanSync`) — une lecture au début d'un
 * tour, une écriture à la fin. Un tour sauté relit et réécrit l'état ; la fin d'un tour reprend les tours sautés notés
 * entre-temps. Rien ici ne fait échouer la synchronisation : une erreur est journalisée (`[match-sync-health]`).
 */

export const MATCH_SYNC_HEALTH_KEY = 'match_sync_health'

const HOUR_MS = 3_600_000

/** État enregistré ; vide s'il n'existe pas encore, `null` s'il est illisible. */
export async function readMatchSyncHealthState(): Promise<MatchSyncHealthState | null> {
  const row = await prisma.appConfig.findUnique({ where: { key: MATCH_SYNC_HEALTH_KEY }, select: { value: true } })
  return row ? parseMatchSyncHealthState(row.value) : emptyMatchSyncHealthState()
}

async function writeMatchSyncHealthState(state: MatchSyncHealthState) {
  const value = JSON.stringify(state)
  await prisma.appConfig.upsert({
    where: { key: MATCH_SYNC_HEALTH_KEY },
    update: { value },
    create: { key: MATCH_SYNC_HEALTH_KEY, value },
  })
}

/** Intervalle moyen de la synchronisation des parties, d'après son horaire effectif (base, .env, défaut). */
export async function getMatchSyncIntervalMinutes(): Promise<number | null> {
  const row = await prisma.cronSchedule.findUnique({ where: { key: 'daily_sync' }, select: { expression: true } })
  const { expression } = resolveCronSchedule(
    { envVar: 'CLAN_MATCH_SYNC_CRON', defaultExpression: SCHEDULE_VARIABLES.CLAN_MATCH_SYNC_CRON },
    row?.expression,
    process.env
  )
  const runsPerDay = getCronRunsPerDay(expression)
  return runsPerDay ? Math.round(1_440 / runsPerDay) : null
}

/**
 * Appels PUBG des dernières 24 h, comptés en une requête par l'index `startedAt` (~12 000 lignes regroupées) : appels
 * limités de la dernière heure, 429, échecs à traiter, échecs passagers de la dernière heure.
 */
export async function countPubgCalls(now: Date): Promise<PubgCallCounts> {
  const dayAgo = new Date(now.getTime() - 24 * HOUR_MS)
  const hourAgo = new Date(now.getTime() - HOUR_MS)
  const [rows, rpm] = await Promise.all([
    prisma.$queryRaw<Array<{ statusCode: number | null; success: number | boolean; limited: number | bigint; lastHour: number | bigint; calls: number | bigint }>>`
      SELECT statusCode, success, (rateLimitLimit IS NOT NULL) AS limited, (startedAt >= ${hourAgo}) AS lastHour, COUNT(*) AS calls
        FROM PubgApiCallLog
       WHERE startedAt >= ${dayAgo}
       GROUP BY statusCode, success, limited, lastHour`,
    getPubgApiRateLimitRpm(),
  ])

  const counts: PubgCallCounts = {
    at: now.toISOString(),
    limitedLastHour: 0,
    ceilingPerHour: rpm * 60,
    http429Last24h: 0,
    actionLast24h: 0,
    transientLastHour: 0,
  }
  for (const row of rows) {
    const calls = Number(row.calls)
    const lastHour = Number(row.lastHour) === 1
    if (Number(row.limited) === 1 && lastHour) counts.limitedLastHour += calls
    if (Number(row.success) === 1) continue
    const failureClass = classifyPubgApiFailure(row.statusCode)
    if (failureClass === 'rateLimited') counts.http429Last24h += calls
    if (failureClass === 'action') counts.actionLast24h += calls
    if (failureClass === 'transient' && lastHour) counts.transientLastHour += calls
  }
  return counts
}

function notifyMatchSyncSummary(send: 'alert' | 'recovered', summary: MatchSyncHealthSummary) {
  if (send === 'recovered') {
    fireAdminAlert('match_sync_degraded', () => matchSyncRecoveredAlert({ delayMedianMinutes: summary.delay.median, matches: summary.delay.count }), {
      withoutMention: true,
    })
    return
  }
  fireAdminAlert('match_sync_degraded', () =>
    matchSyncDegradedAlert({
      urgent: summary.status === 'urgent',
      reasons: summary.reasons.map((reason) => reason.text),
      delayMedianMinutes: summary.delay.median,
      delayP90Minutes: summary.delay.p90,
      matches: summary.delay.count,
    })
  )
}

export type MatchSyncPassRecorder = {
  /** Parties en attente partagées par les clans du tour (à passer à `syncClanMatches`). */
  tracker: PendingMatchTracker
  /** Résultat d'un clan ; `null` pour un clan en échec. */
  addClan(result: Pick<SyncClanMatchesResult, 'importedMatches' | 'newMatchDelaysMinutes' | 'catchUpMatches'> | null): void
  /** Écrit le tour et décide de l'alerte ; ne lève jamais. */
  finish(now?: Date): Promise<MatchSyncHealthSummary | null>
}

/** Ouvre la mesure d'un tour : une lecture de l'état (vide s'il est illisible : ses parties en attente sont perdues). */
export async function startMatchSyncPass(startedAt: Date = new Date()): Promise<MatchSyncPassRecorder> {
  let initial: MatchSyncHealthState
  try {
    initial = (await readMatchSyncHealthState()) ?? emptyMatchSyncHealthState()
  } catch (error) {
    console.warn('[match-sync-health] État illisible au début du tour, mesure repartie de zéro :', error)
    initial = emptyMatchSyncHealthState()
  }

  let pending: PendingMatch[] = initial.pending
  const delays: number[] = []
  let catchUps = 0
  let importedMatches = 0
  let clans = 0
  let failedClans = 0

  return {
    tracker: {
      retryIds: (memberId) => pendingRetryIds(pending, memberId),
      failed: (failure) => {
        pending = notePendingFailure(pending, { ...failure, at: new Date() })
      },
      imported: (memberId, matchId) => {
        pending = clearPending(pending, memberId, matchId)
      },
    },
    addClan(result) {
      clans += 1
      if (!result) {
        failedClans += 1
        return
      }
      importedMatches += result.importedMatches
      delays.push(...result.newMatchDelaysMinutes)
      catchUps += result.catchUpMatches
    },
    async finish(now = new Date()) {
      try {
        // Tours sautés notés pendant ce tour (`recordMatchSyncSkip`) : repris de l'état enregistré.
        const stored = await readMatchSyncHealthState().catch(() => null)
        const skipped = [...new Set([...initial.skipped, ...(stored?.skipped ?? [])])].sort()
        const calls = await countPubgCalls(now).catch((error: unknown) => {
          console.warn('[match-sync-health] Appels PUBG non comptés :', error)
          return initial.calls
        })
        let state = recordPass(
          { ...initial, skipped, pending: expirePending(pending, now), calls },
          {
            startedAt: startedAt.toISOString(),
            finishedAt: now.toISOString(),
            clans,
            failedClans,
            importedMatches,
            delays,
            catchUps,
          },
          now
        )
        const summary = summarizeMatchSyncHealth(state, { now, intervalMinutes: await getMatchSyncIntervalMinutes() })
        const decision = decideMatchSyncAlert(state.alert, summary.status, now)
        state = { ...state, alert: decision.alert }
        await writeMatchSyncHealthState(state)
        if (decision.send) notifyMatchSyncSummary(decision.send, summary)
        return summary
      } catch (error) {
        console.warn('[match-sync-health] Tour non enregistré :', error)
        return null
      }
    },
  }
}

/** Un déclenchement de la synchronisation tombé pendant un tour en cours. Ne lève jamais. */
export async function recordMatchSyncSkip(at: Date = new Date()) {
  try {
    const state = (await readMatchSyncHealthState()) ?? emptyMatchSyncHealthState()
    await writeMatchSyncHealthState(recordSkippedTrigger(state, at))
  } catch (error) {
    console.warn('[match-sync-health] Tour sauté non noté :', error)
  }
}

/** Résumé pour la page, la boîte « À traiter » : lecture de `AppConfig` et de l'horaire seulement. `null` si illisible. */
export async function getMatchSyncHealthSummary(now: Date = new Date()): Promise<MatchSyncHealthSummary | null> {
  const [state, intervalMinutes] = await Promise.all([readMatchSyncHealthState(), getMatchSyncIntervalMinutes()])
  return state ? summarizeMatchSyncHealth(state, { now, intervalMinutes }) : null
}
