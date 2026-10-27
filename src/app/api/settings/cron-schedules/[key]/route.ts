import 'server-only'

import { withAdminActionLog } from '@/lib/admin-action-log'
import { getSessionFromRequest } from '@/lib/auth-session'
import { rememberSessionActor } from '@/lib/auth/admin-actor'
import { getEffectiveCronSchedules, isCronScheduleKey, refreshCronSchedules } from '@/lib/cron-jobs'
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
  if (!isCronScheduleKey(key)) {
    return Response.json({ error: `Tâche inconnue : ${key}` }, { status: 400 })
  }

  await prisma.cronSchedule.deleteMany({ where: { key } })

  // La tâche revient au .env, sinon au défaut du code : le service cron le reprend dans la minute.
  await refreshCronSchedules()

  const schedules = await getEffectiveCronSchedules()
  return Response.json({ ok: true, schedules })
}

export const DELETE = withAdminActionLog('settings/cron-schedules/[key]', handleDelete)
