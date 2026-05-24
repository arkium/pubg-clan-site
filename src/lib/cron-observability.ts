import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export type CronActionKey =
  | 'sync_matches'
  | 'sync_stats'
  | 'generate_weekly_report'
  | 'generate_monthly_report'
  | 'daily_sync'
  | 'daily_stats_recalc'
  | 'weekly_report_auto'
  | 'monthly_report_auto'
  | 'challenge_processing'

export type CronExecutionStatus = 'running' | 'success' | 'partial' | 'failed'

export type CronSource = 'manual' | 'scheduler' | 'system'

export const CRON_ACTION_LABELS: Record<CronActionKey, string> = {
  sync_matches: 'Sync matchs',
  sync_stats: 'Sync stats',
  generate_weekly_report: 'Rapport hebdo',
  generate_monthly_report: 'Rapport mensuel',
  daily_sync: 'Sync quotidien clans',
  daily_stats_recalc: 'Recalcul stats quotidien',
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

function looksLocalUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  } catch {
    return false
  }
}

function getCronEnvChecks(): CronConfigCheck[] {
  const nodeEnv = process.env.NODE_ENV ?? 'development'
  const enableCron = process.env.ENABLE_CRON_JOBS
  const internalAppUrl = process.env.INTERNAL_APP_URL ?? ''
  const appUrl = process.env.APP_URL ?? ''
  const nextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const pubgApiKey = process.env.PUBG_API_KEY ?? ''
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
          : 'Requis pour les actions Sync matchs et Sync stats.',
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
    hint: isValidCron(entry.value) ? undefined : 'Expression cron invalide.',
  }))
}

export function getCronConfigurationChecks() {
  return [...getCronEnvChecks(), ...getScheduleChecks()]
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
