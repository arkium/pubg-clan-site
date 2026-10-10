
import { matchesSecret } from '@/lib/auth/secrets'
import { initCronJobs, isCronJobsInitialized } from '@/lib/cron-jobs'

// Même règle que les autres secrets du .env (src/lib/auth/secrets.ts) : ni valeur d'exemple, ni moins de 16 caractères.
function isAuthorized(request: Request) {
  return matchesSecret(request.headers.get('x-cron-bootstrap-secret')?.trim(), process.env.CRON_BOOTSTRAP_SECRET)
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await initCronJobs()

  return Response.json({
    ok: true,
    initialized: isCronJobsInitialized(),
    cronJobsEnabled: process.env.ENABLE_CRON_JOBS === 'true',
  })
}
