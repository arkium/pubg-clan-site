import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export type CronActionKey =
  | 'sync_matches'
  | 'sync_stats'
  | 'sync_telemetry_aggregates'
  | 'sync_lifetime_stats'
  | 'generate_weekly_report'
  | 'generate_monthly_report'
  | 'daily_sync'
  | 'daily_stats_recalc'
  | 'daily_lifetime_stats_sync'
  | 'daily_season_stats_sync'
  | 'weekly_report_auto'
  | 'monthly_report_auto'
  | 'challenge_processing'

export type CronExecutionStatus = 'running' | 'success' | 'partial' | 'failed'

export type CronSource = 'manual' | 'scheduler' | 'system'

export const CRON_ACTION_LABELS: Record<CronActionKey, string> = {
  sync_matches: 'Sync matchs',
  sync_stats: 'Sync stats',
  sync_telemetry_aggregates: 'Recalcul telemetry aggregates',
  sync_lifetime_stats: 'Sync stats lifetime',
  generate_weekly_report: 'Rapport hebdo',
  generate_monthly_report: 'Rapport mensuel',
  daily_sync: 'Sync quotidien clans',
  daily_stats_recalc: 'Recalcul stats quotidien',
  daily_lifetime_stats_sync: 'Sync lifetime quotidienne',
  daily_season_stats_sync: 'Sync season stats quotidienne',
  weekly_report_auto: 'Generation auto rapport hebdo',
  monthly_report_auto: 'Generation auto rapport mensuel',
  challenge_processing: 'Traitement des challenges',
}

export function isValidCron(expression: string) {
  const normalized = expression.trim()
  if (!normalized) {
    return false
  }

  const parts = normalized.split(/\s+/)
  if (parts.length !== 5) {
    return false
  }

  return parts.every((segment) => /^[\d*/,\-]+$/.test(segment))
}

export function describeCronExpression(expression: string) {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) {
    return `Format cron invalide.`
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  function getFrenchWeekdayLabel(value: string) {
    const mapping: Record<string, string> = {
      '0': 'dimanche',
      '1': 'lundi',
      '2': 'mardi',
      '3': 'mercredi',
      '4': 'jeudi',
      '5': 'vendredi',
      '6': 'samedi',
      '7': 'dimanche',
    }

    return mapping[value] ?? `jour ${value}`
  }

  function parseNumericList(value: string) {
    if (!/^\d+(,\d+)*$/.test(value)) {
      return null
    }

    return value
      .split(',')
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry))
  }

  function joinFrench(values: string[]) {
    if (values.length === 0) {
      return ''
    }

    if (values.length === 1) {
      return values[0]
    }

    if (values.length === 2) {
      return `${values[0]} et ${values[1]}`
    }

    return `${values.slice(0, -1).join(', ')} et ${values[values.length - 1]}`
  }

  function formatHours(hours: number[]) {
    const labels = hours
      .sort((left, right) => left - right)
      .map((value) => `${String(value).padStart(2, '0')}h`)
    return joinFrench(labels)
  }

  function formatMinutes(minutes: number[]) {
    const labels = minutes
      .sort((left, right) => left - right)
      .map((value) => `${String(value).padStart(2, '0')}m`)
    return joinFrench(labels)
  }

  const parsedHours = parseNumericList(hour)
  const parsedMinutes = parseNumericList(minute)

  const isDaily = dayOfMonth === '*' && month === '*' && dayOfWeek === '*'
  if (isDaily && parsedHours && parsedMinutes) {
    if (parsedMinutes.length === 1 && parsedHours.length >= 1) {
      const minuteLabel = String(parsedMinutes[0]).padStart(2, '0')
      return `Tous les jours a ${formatHours(parsedHours)}:${minuteLabel}.`
    }

    if (parsedHours.length === 1 && parsedMinutes.length >= 1) {
      const hourLabel = String(parsedHours[0]).padStart(2, '0')
      return `Tous les jours a ${hourLabel} avec minutes ${formatMinutes(parsedMinutes)}.`
    }

    return `Tous les jours avec heures ${formatHours(parsedHours)} et minutes ${formatMinutes(parsedMinutes)}.`
  }

  const isWeekly = dayOfMonth === '*' && month === '*' && /^\d+$/.test(dayOfWeek)
  if (isWeekly && parsedHours && parsedMinutes) {
    const weekdayLabel = getFrenchWeekdayLabel(dayOfWeek)

    if (parsedMinutes.length === 1 && parsedHours.length >= 1) {
      const minuteLabel = String(parsedMinutes[0]).padStart(2, '0')
      return `Chaque semaine (${weekdayLabel}) a ${formatHours(parsedHours)}:${minuteLabel}.`
    }

    if (parsedHours.length === 1 && parsedMinutes.length >= 1) {
      const hourLabel = String(parsedHours[0]).padStart(2, '0')
      return `Chaque semaine (${weekdayLabel}) a ${hourLabel} avec minutes ${formatMinutes(parsedMinutes)}.`
    }

    return `Chaque semaine (${weekdayLabel}) avec heures ${formatHours(parsedHours)} et minutes ${formatMinutes(parsedMinutes)}.`
  }

  const isMonthly = /^\d+$/.test(dayOfMonth) && month === '*' && dayOfWeek === '*'
  if (isMonthly && parsedHours && parsedMinutes) {
    if (parsedMinutes.length === 1 && parsedHours.length >= 1) {
      const minuteLabel = String(parsedMinutes[0]).padStart(2, '0')
      return `Chaque mois le jour ${dayOfMonth} a ${formatHours(parsedHours)}:${minuteLabel}.`
    }

    if (parsedHours.length === 1 && parsedMinutes.length >= 1) {
      const hourLabel = String(parsedHours[0]).padStart(2, '0')
      return `Chaque mois le jour ${dayOfMonth} a ${hourLabel} avec minutes ${formatMinutes(parsedMinutes)}.`
    }

    return `Chaque mois le jour ${dayOfMonth} avec heures ${formatHours(parsedHours)} et minutes ${formatMinutes(parsedMinutes)}.`
  }

  return `Expression cron personnalisee.`
}

// Sonde le worker cron séparé (processus distinct du web worker) via son
// endpoint interne protégé par CRON_BOOTSTRAP_SECRET — distingue "web worker
// désactivé normalement" (ENABLE_CRON_JOBS=false, config normale en mode deux
// workers) de "aucun worker cron actif" (sonde injoignable ou désactivée).
export async function getCronWorkerRuntimeStatus() {
  const secret = process.env.CRON_BOOTSTRAP_SECRET?.trim()
  if (!secret) {
    return {
      probeEnabled: false,
      available: false,
      reason: 'Verification distante non configuree (CRON_BOOTSTRAP_SECRET manquant sur le web worker)',
    }
  }

  const cronStatusUrl =
    process.env.INTERNAL_CRON_STATUS_URL?.trim() || 'http://127.0.0.1:3001/api/internal/cron/status'

  try {
    const response = await fetch(cronStatusUrl, {
      cache: 'no-store',
      headers: {
        'x-cron-bootstrap-secret': secret,
      },
    })

    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean
          initialized?: boolean
          cronJobsEnabled?: boolean
          error?: string
        }
      | null

    if (!response.ok || !payload?.ok) {
      return {
        probeEnabled: true,
        available: false,
        reason: payload?.error ?? `HTTP ${response.status}`,
      }
    }

    return {
      probeEnabled: true,
      available: true,
      initialized: payload.initialized === true,
      cronJobsEnabled: payload.cronJobsEnabled === true,
    }
  } catch {
    return {
      probeEnabled: true,
      available: false,
      reason: 'Cron worker injoignable',
    }
  }
}

export async function startCronExecution(params: {
  clanId: number
  action: CronActionKey
  triggeredBy?: number | null
  source?: CronSource
}) {
  return prisma.cronExecution.create({
    data: {
      clanId: params.clanId,
      action: params.action,
      status: 'running',
      triggeredBy: params.triggeredBy ?? null,
      source: params.source ?? 'manual',
      startedAt: new Date(),
    },
    select: {
      id: true,
      startedAt: true,
    },
  })
}

export async function finishCronExecution(params: {
  id: string
  startedAt: Date
  status: Exclude<CronExecutionStatus, 'running'>
  message?: string
  details?: unknown
}) {
  const finishedAt = new Date()
  let normalizedDetails: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull = Prisma.JsonNull

  if (params.details !== undefined && params.details !== null) {
    try {
      normalizedDetails = JSON.parse(JSON.stringify(params.details)) as Prisma.InputJsonValue
    } catch {
      normalizedDetails = {
        note: 'details_not_serializable',
      }
    }
  }

  await prisma.cronExecution.update({
    where: { id: params.id },
    data: {
      status: params.status,
      message: params.message ?? null,
      details: normalizedDetails,
      finishedAt,
      durationMs: Math.max(0, finishedAt.getTime() - params.startedAt.getTime()),
    },
  })
}

export async function getCronOverview(clanId: number, take = 40) {
  const recent = await prisma.cronExecution.findMany({
    where: { clanId },
    orderBy: { startedAt: 'desc' },
    take,
    select: {
      id: true,
      action: true,
      status: true,
      source: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      message: true,
      details: true,
      triggeredBy: true,
    },
  })

  const latestByAction = new Map<string, (typeof recent)[number]>()
  for (const row of recent) {
    if (!latestByAction.has(row.action)) {
      latestByAction.set(row.action, row)
    }
  }

  const completed = recent.filter((entry) => entry.status !== 'running')
  const successful = completed.filter(
    (entry) => entry.status === 'success' || entry.status === 'partial'
  )

  return {
    recent,
    latestByAction: Array.from(latestByAction.values()),
    stats: {
      totalRecent: recent.length,
      completedRecent: completed.length,
      successfulRecent: successful.length,
      successRate:
        completed.length > 0 ? Math.round((successful.length / completed.length) * 100) : null,
      runningCount: recent.filter((entry) => entry.status === 'running').length,
      failedCount: recent.filter((entry) => entry.status === 'failed').length,
    },
  }
}
