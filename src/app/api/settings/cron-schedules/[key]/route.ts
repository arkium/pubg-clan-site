import 'server-only'

import { withAdminActionLog } from '@/lib/admin-action-log'
import { getSessionFromRequest } from '@/lib/auth-session'
import { rememberSessionActor } from '@/lib/auth/admin-actor'
import { getEffectiveCronSchedules, rescheduleJob, type CronScheduleKey } from '@/lib/cron-jobs'
import { isSuperUserSession } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

async function handleDelete(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  if (!(await isSuperUserSession(request))) {
    return Response.json({ error: 'Acces reserve au SuperUser' }, { status: 403 })
  }
  const session = await getSessionFromRequest(request)
  if (session) rememberSessionActor(request, session)

  const { key } = await params

  await prisma.cronSchedule.deleteMany({ where: { key } })

  const schedules = await getEffectiveCronSchedules()
  const defaultExpression = schedules.find((entry) => entry.key === key)?.expression

  if (defaultExpression) {
    rescheduleJob(key as CronScheduleKey, defaultExpression)
  }

  return Response.json({ ok: true, schedules })
}

export const DELETE = withAdminActionLog('settings/cron-schedules/[key]', handleDelete)
