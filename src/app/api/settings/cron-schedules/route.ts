import 'server-only'
import cron from 'node-cron'

import { withAdminActionLog } from '@/lib/admin-action-log'
import {
  getEffectiveCronSchedules,
  rescheduleJob,
  type CronScheduleKey,
} from '@/lib/cron-jobs'
import { getSessionFromRequest } from '@/lib/auth-session'
import { rememberSessionActor } from '@/lib/auth/admin-actor'
import { isSuperUserSession } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  if (!(await isSuperUserSession(request))) {
    return Response.json({ error: 'Acces reserve au SuperUser' }, { status: 403 })
  }

  const schedules = await getEffectiveCronSchedules()
  return Response.json({ ok: true, schedules })
}

async function handlePut(request: Request) {
  if (!(await isSuperUserSession(request))) {
    return Response.json({ error: 'Acces reserve au SuperUser' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as {
    key?: unknown
    expression?: unknown
  } | null

  const key = typeof body?.key === 'string' ? body.key.trim() : ''
  const expression = typeof body?.expression === 'string' ? body.expression.trim() : ''

  if (!key || !expression) {
    return Response.json({ error: 'key et expression sont requis' }, { status: 400 })
  }

  if (!cron.validate(expression)) {
    return Response.json({ error: 'Expression cron invalide' }, { status: 400 })
  }

  const session = await getSessionFromRequest(request)
  if (session) rememberSessionActor(request, session)

  await prisma.cronSchedule.upsert({
    where: { key },
    update: { expression, updatedBy: session?.userId ?? null },
    create: { key, expression, updatedBy: session?.userId ?? null },
  })

  const rescheduled = rescheduleJob(key as CronScheduleKey, expression)
  if (!rescheduled) {
    return Response.json(
      { error: `Clé de schedule inconnue: ${key} (enregistrée en base mais pas appliquée au process courant)` },
      { status: 400 }
    )
  }

  const schedules = await getEffectiveCronSchedules()
  return Response.json({ ok: true, schedules })
}

export const PUT = withAdminActionLog('settings/cron-schedules', handlePut)
