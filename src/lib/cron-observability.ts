import { Prisma } from '@prisma/client'

import { getPubgApiRateLimitRpm } from '@/lib/pubg-rate-limit-config-service'
import { prisma } from '@/lib/prisma'

export type CronActionKey =
  | 'sync_matches'
  | 'sync_stats'
  | 'sync_lifetime_stats'
  | 'generate_weekly_report'
  | 'generate_monthly_report'
  | 'daily_sync'
  | 'daily_stats_recalc'
  | 'daily_lifetime_stats_sync'
  | 'weekly_report_auto'
  | 'monthly_report_auto'
  | 'challenge_processing'

export type CronExecutionStatus = 'running' | 'success' | 'partial' | 'failed'

export type CronSource = 'manual' | 'scheduler' | 'system'

export const CRON_ACTION_LABELS: Record<CronActionKey, string> = {
  sync_matches: 'Sync matchs',
  sync_stats: 'Sync stats',
  sync_lifetime_stats: 'Sync stats lifetime',
  generate_weekly_report: 'Rapport hebdo',
  generate_monthly_report: 'Rapport mensuel',
  daily_sync: 'Sync quotidien clans',
  daily_stats_recalc: 'Recalcul stats quotidien',
  daily_lifetime_stats_sync: 'Sync lifetime quotidienne',
  weekly_report_auto: 'Generation auto rapport hebdo',
  monthly_report_auto: 'Generation auto rapport mensuel',
  challenge_processing: 'Traitement des challenges',
}

type CronConfigCheck = {
  key: string
  label: string
  status: 'ok' | 'warning' | 'error'
  value: string
  hint?: string
}

function isValidCron(expression: string) {
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

function describeCronExpression(expression: string) {
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

function looksLocalUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  } catch {
    return false
  }
}

async function getCronEnvChecks(): Promise<CronConfigCheck[]> {
  const nodeEnv = process.env.NODE_ENV ?? 'development'
  const enableCron = process.env.ENABLE_CRON_JOBS
  const enableCronBootstrap = process.env.ENABLE_CRON_BOOTSTRAP
  const syncTimezone = process.env.CLAN_MATCH_SYNC_TIMEZONE ?? 'UTC'
  const internalAppUrl = process.env.INTERNAL_APP_URL ?? ''
  const appUrl = process.env.APP_URL ?? ''
  const nextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const pubgApiKey = process.env.PUBG_API_KEY ?? ''
  const pubgApiRateLimitRpm = await getPubgApiRateLimitRpm()
  const databaseUrl = process.env.DATABASE_URL ?? ''

  const checks: CronConfigCheck[] = [
    {
      key: 'node_env',
      label: 'NODE_ENV',
      status: nodeEnv === 'production' ? 'ok' : 'warning',
      value: nodeEnv,
      hint:
        nodeEnv === 'production'
          ? undefined
          : 'En production, cette valeur devrait etre "production".',
    },
    {
      key: 'enable_cron_jobs',
      label: 'ENABLE_CRON_JOBS',
      status:
        enableCron === 'true' ? 'ok' : nodeEnv === 'production' ? 'warning' : 'ok',
      value: enableCron || '(non defini)',
      hint:
        enableCron === 'true'
          ? undefined
          : 'Active uniquement sur le worker qui execute les cron: ENABLE_CRON_JOBS=true.',
    },
    {
      key: 'enable_cron_bootstrap',
      label: 'ENABLE_CRON_BOOTSTRAP',
      status:
        enableCronBootstrap === 'true'
          ? 'ok'
          : nodeEnv === 'production'
            ? 'error'
            : 'warning',
      value: enableCronBootstrap || '(non defini)',
      hint:
        enableCronBootstrap === 'true'
          ? undefined
          : 'Obligatoire en production: sans cette valeur, initCronJobs() ne demarre jamais.',
    },
    {
      key: 'clan_match_sync_timezone',
      label: 'CLAN_MATCH_SYNC_TIMEZONE',
      status: syncTimezone === 'UTC' ? 'warning' : 'ok',
      value: syncTimezone,
      hint:
        syncTimezone === 'UTC'
          ? 'Si tu veux 2h heure locale serveur (ex: France), definir Europe/Paris.'
          : undefined,
    },
    {
      key: 'database_url',
      label: 'DATABASE_URL',
      status: databaseUrl ? 'ok' : 'error',
      value: databaseUrl ? '(defini)' : '(manquant)',
      hint: databaseUrl ? undefined : 'La base est obligatoire pour cron et historique.',
    },
    {
      key: 'pubg_api_key',
      label: 'PUBG_API_KEY',
      status: pubgApiKey ? 'ok' : 'warning',
      value: pubgApiKey ? '(defini)' : '(manquant)',
      hint:
        pubgApiKey
          ? undefined
          : 'Requis pour les actions Sync matchs, Sync stats et Sync stats lifetime.',
    },
    {
      key: 'pubg_api_rate_limit_rpm',
      label: 'PUBG_API_RATE_LIMIT_RPM (effectif)',
      status: 'ok',
      value: String(pubgApiRateLimitRpm),
      hint: 'Limite effective appliquee par la gateway PUBG centralisee.',
    },
    {
      key: 'internal_app_url',
      label: 'INTERNAL_APP_URL',
      status: internalAppUrl ? (looksLocalUrl(internalAppUrl) ? 'ok' : 'warning') : 'warning',
      value: internalAppUrl || '(non defini)',
      hint: internalAppUrl
        ? looksLocalUrl(internalAppUrl)
          ? undefined
          : 'Idealement une URL locale (ex: http://127.0.0.1:3000) pour les appels internes.'
        : 'Definir INTERNAL_APP_URL pour stabiliser les appels internes.',
    },
    {
      key: 'app_url',
      label: 'APP_URL',
      status: appUrl ? 'ok' : 'warning',
      value: appUrl || '(non defini)',
    },
    {
      key: 'next_public_app_url',
      label: 'NEXT_PUBLIC_APP_URL',
      status: nextPublicAppUrl ? 'ok' : 'warning',
      value: nextPublicAppUrl || '(non defini)',
    },
  ]

  return checks
}

function getScheduleChecks(): CronConfigCheck[] {
  const checks = [
    {
      key: 'clan_match_sync_cron',
      label: 'CLAN_MATCH_SYNC_CRON',
      value: process.env.CLAN_MATCH_SYNC_CRON ?? '0 2 * * *',
    },
    {
      key: 'clan_stats_recalc_cron',
      label: 'CLAN_STATS_RECALC_CRON',
      value: process.env.CLAN_STATS_RECALC_CRON ?? '0 3 * * *',
    },
    {
      key: 'clan_lifetime_stats_sync_cron',
      label: 'CLAN_LIFETIME_STATS_SYNC_CRON',
      value: process.env.CLAN_LIFETIME_STATS_SYNC_CRON ?? '0 4 * * *',
    },
    {
      key: 'weekly_report_generation_cron',
      label: 'WEEKLY_REPORT_GENERATION_CRON',
      value: process.env.WEEKLY_REPORT_GENERATION_CRON ?? '0 8 * * 1',
    },
    {
      key: 'monthly_report_generation_cron',
      label: 'MONTHLY_REPORT_GENERATION_CRON',
      value: process.env.MONTHLY_REPORT_GENERATION_CRON ?? '0 8 1 * *',
    },
  ]

  return checks.map((entry) => ({
    key: entry.key,
    label: entry.label,
    value: entry.value,
    status: isValidCron(entry.value) ? 'ok' : 'error',
    hint: isValidCron(entry.value)
      ? describeCronExpression(entry.value)
      : `Expression cron invalide.`,
  }))
}

export async function getCronConfigurationChecks() {
  const envChecks = await getCronEnvChecks()
  return [...envChecks, ...getScheduleChecks()]
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

export async function getCronOverview(clanId: number) {
  const recent = await prisma.cronExecution.findMany({
    where: { clanId },
    orderBy: { startedAt: 'desc' },
    take: 40,
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
