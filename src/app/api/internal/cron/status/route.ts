
import { isCronJobsInitialized } from '@/lib/cron-jobs'

function isAuthorized(request: Request) {
  const expected = process.env.CRON_BOOTSTRAP_SECRET?.trim()
  if (!expected) {
    return false
  }

  const received = request.headers.get('x-cron-bootstrap-secret')?.trim()
  return received === expected
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return Response.json({
    ok: true,
    initialized: isCronJobsInitialized(),
    cronJobsEnabled: process.env.ENABLE_CRON_JOBS === 'true',
  })
}
