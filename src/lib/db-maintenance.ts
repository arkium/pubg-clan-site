import { prisma } from '@/lib/prisma'

/**
 * Maintenance nocturne de la base — volontairement NON destructive.
 *
 * Clôt les exécutions restées « running » alors que leur processus a disparu (redémarrage,
 * déploiement, crash) : sans cela, les tableaux de bord `/settings/cron` et
 * `/settings/opponents/resolution` les affichent en cours indéfiniment. Constaté le
 * 2026-09-15 : 32 `CronExecution` (la plus ancienne du 2026-05-30) et 21
 * `EncounteredPlayerResolutionRun` (du 2026-08-16 au 2026-09-14).
 *
 * Ne supprime rien. En particulier, ni les jobs `failed` (la dead letter les affiche), ni
 * les jobs `queued` (un `telemetry:batch --all-matches` peut légitimement attendre plus de
 * 24 h), ni les fichiers `.telemetry-captured` (seule copie de la télémétrie après les
 * 14 jours de rétention du CDN PUBG) — voir docs/ops/database-performance.md.
 */

/**
 * Au-delà de cette durée, un run « running » est orphelin. Plus longue exécution normale
 * observée sur 3 jours : 77 min (`daily_sync`), 46 min (résolution des adversaires).
 */
export const ORPHANED_RUN_THRESHOLD_HOURS = 6

export type OrphanedRunsResult = {
  cronExecutions: number
  resolutionRuns: number
}

export async function finalizeOrphanedRuns(options?: {
  thresholdHours?: number
  now?: Date
}): Promise<OrphanedRunsResult> {
  const thresholdHours = options?.thresholdHours ?? ORPHANED_RUN_THRESHOLD_HOURS
  const now = options?.now ?? new Date()
  const startedBefore = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000)
  const message = `Interrompu : toujours « running » après ${thresholdHours} h, processus probablement arrêté (clôturé par la maintenance)`

  const [cronExecutions, resolutionRuns] = await Promise.all([
    prisma.cronExecution.updateMany({
      where: { status: 'running', startedAt: { lt: startedBefore } },
      data: { status: 'failed', finishedAt: now, message },
    }),
    prisma.encounteredPlayerResolutionRun.updateMany({
      where: { status: 'running', startedAt: { lt: startedBefore } },
      data: { status: 'failed', finishedAt: now, errorMessage: message },
    }),
  ])

  return { cronExecutions: cronExecutions.count, resolutionRuns: resolutionRuns.count }
}
