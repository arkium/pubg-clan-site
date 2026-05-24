import { NextResponse } from 'next/server'

import {
  CRON_ACTION_LABELS,
  finishCronExecution,
  getCronConfigurationChecks,
  getCronOverview,
  startCronExecution,
  type CronActionKey,
} from '@/lib/cron-observability'
import { syncTrackedClanStats } from '@/lib/clan-service'
import { getInternalApiBaseUrl } from '@/lib/internal-api'
import { generateMonthlyReport, generateWeeklyReport } from '@/lib/report-generator'
import { getActorMemberId, requireRole } from '@/middleware/auth-permission'

type CronAction =
  | 'sync_matches'
  | 'sync_stats'
  | 'generate_weekly_report'
  | 'generate_monthly_report'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function getLastCompletedWeekStart(referenceDate = new Date()) {
  const currentWeekStart = new Date(referenceDate)
  const day = currentWeekStart.getDay()
  const diff = day === 0 ? -6 : 1 - day
  currentWeekStart.setDate(currentWeekStart.getDate() + diff)
  currentWeekStart.setHours(0, 0, 0, 0)

  const previousWeekStart = new Date(currentWeekStart)
  previousWeekStart.setDate(previousWeekStart.getDate() - 7)
  return previousWeekStart
}

function getLastCompletedMonthStart(referenceDate = new Date()) {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1, 0, 0, 0, 0)
}

function parseAction(value: unknown): CronAction | null {
  if (
    value === 'sync_matches' ||
    value === 'sync_stats' ||
    value === 'generate_weekly_report' ||
    value === 'generate_monthly_report'
  ) {
    return value
  }

  return null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const [overview, configChecks] = await Promise.all([
      getCronOverview(parsedClanId),
      Promise.resolve(getCronConfigurationChecks()),
    ])

    const criticalChecks = configChecks.filter((entry) => entry.status === 'error').length
    const warningChecks = configChecks.filter((entry) => entry.status === 'warning').length

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      actionLabels: CRON_ACTION_LABELS,
      health: {
        successRate: overview.stats.successRate,
        runningCount: overview.stats.runningCount,
        failedCount: overview.stats.failedCount,
        completedRecent: overview.stats.completedRecent,
        totalRecent: overview.stats.totalRecent,
      },
      checks: {
        total: configChecks.length,
        errors: criticalChecks,
        warnings: warningChecks,
        items: configChecks,
      },
      latestByAction: overview.latestByAction,
      history: overview.recent,
    })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Cron control status failed:', error)
    return NextResponse.json({ error: 'Failed to load cron status' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  let execution: { id: string; startedAt: Date } | null = null

  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const body = (await request.json().catch(() => null)) as { action?: unknown } | null
    const action = parseAction(body?.action)

    if (!action) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const actorMemberId = await getActorMemberId(request)
    execution = await startCronExecution({
      clanId: parsedClanId,
      action: action as CronActionKey,
      triggeredBy: actorMemberId,
      source: 'manual',
    })

    if (!execution) {
      throw new Error('Failed to initialize execution log')
    }

    const executionLog = execution

    if (action === 'sync_matches') {
      const response = await fetch(`${getInternalApiBaseUrl()}/api/clans/${parsedClanId}/sync-matches`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string
            status?: 'success' | 'partial'
            importedCount?: number
            importedMatches?: number
            errorsCount?: number
            errorsPreview?: string[]
          }
        | null

      if (!response.ok) {
        await finishCronExecution({
          id: executionLog.id,
          startedAt: executionLog.startedAt,
          status: 'failed',
          message: payload?.error ?? 'Failed to synchronize clan matches',
          details: payload,
        })

        return NextResponse.json(
          {
            error: payload?.error ?? 'Failed to synchronize clan matches',
          },
          { status: response.status }
        )
      }

      const importedMatches = payload?.importedMatches ?? payload?.importedCount ?? 0
      const errorsCount = payload?.errorsCount ?? 0
      const isPartial = payload?.status === 'partial'
      const firstError = payload?.errorsPreview?.[0]

      if (isPartial) {
        await finishCronExecution({
          id: executionLog.id,
          startedAt: executionLog.startedAt,
          status: 'partial',
          message: `Sync partielle: ${importedMatches} match(s) importé(s), ${errorsCount} erreur(s).`,
          details: payload,
        })

        return NextResponse.json({
          ok: true,
          partial: true,
          action,
          importedMatches,
          errorsCount,
          message: `Sync partielle: ${importedMatches} match(s) importé(s), ${errorsCount} erreur(s).`,
          warning: firstError ? `Exemple d'erreur: ${firstError}` : undefined,
        })
      }

      await finishCronExecution({
        id: executionLog.id,
        startedAt: executionLog.startedAt,
        status: 'success',
        message: `Synchronisation des matchs terminee: ${importedMatches} match(s) importé(s).`,
        details: payload,
      })

      return NextResponse.json({
        ok: true,
        action,
        importedMatches,
        message: `Synchronisation des matchs terminee: ${importedMatches} match(s) importé(s).`,
      })
    }

    if (action === 'sync_stats') {
      await syncTrackedClanStats(parsedClanId)

      await finishCronExecution({
        id: executionLog.id,
        startedAt: executionLog.startedAt,
        status: 'success',
        message: 'Synchronisation des stats terminee',
      })

      return NextResponse.json({
        ok: true,
        action,
        message: 'Synchronisation des stats terminee',
      })
    }

    if (action === 'generate_weekly_report') {
      const weekStart = getLastCompletedWeekStart()
      await generateWeeklyReport(parsedClanId, weekStart)

      await finishCronExecution({
        id: executionLog.id,
        startedAt: executionLog.startedAt,
        status: 'success',
        message: `Rapport hebdomadaire genere (${weekStart.toISOString().slice(0, 10)})`,
        details: {
          weekStart: weekStart.toISOString(),
        },
      })

      return NextResponse.json({
        ok: true,
        action,
        message: `Rapport hebdomadaire genere (${weekStart.toISOString().slice(0, 10)})`,
      })
    }

    const monthStart = getLastCompletedMonthStart()
    await generateMonthlyReport(parsedClanId, monthStart)

    await finishCronExecution({
      id: executionLog.id,
      startedAt: executionLog.startedAt,
      status: 'success',
      message: `Rapport mensuel genere (${monthStart.toISOString().slice(0, 10)})`,
      details: {
        monthStart: monthStart.toISOString(),
      },
    })

    return NextResponse.json({
      ok: true,
      action,
      message: `Rapport mensuel genere (${monthStart.toISOString().slice(0, 10)})`,
    })
  } catch (error) {
    if (execution) {
      await finishCronExecution({
        id: execution.id,
        startedAt: execution.startedAt,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Cron action failed',
      }).catch(() => undefined)
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Cron control failed:', error)
    return NextResponse.json({ error: 'Failed to control cron actions' }, { status: 500 })
  }
}
