import 'server-only'

import { getEffectiveCronSchedules, rescheduleJob, type CronScheduleKey } from '@/lib/cron-jobs'
import { isSuperUserSession } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  if (!(await isSuperUserSession(request))) {
    return Response.json({ error: 'Acces reserve au SuperUser' }, { status: 403 })
  }

  const { key } = await params

  await prisma.cronSchedule.deleteMany({ where: { key } })

  const schedules = await getEffectiveCronSchedules()
  const defaultExpression = schedules.find((entry) => entry.key === key)?.expression

  if (defaultExpression) {
    rescheduleJob(key as CronScheduleKey, defaultExpression)
  }

  return Response.json({ ok: true, schedules })
}
