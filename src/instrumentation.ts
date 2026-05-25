export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  // Explicit opt-in to avoid loading cron dependencies during normal local dev boot.
  if (process.env.ENABLE_CRON_BOOTSTRAP !== 'true') {
    return
  }

  const { initCronJobs } = await import('./lib/cron-jobs')
  await initCronJobs()
}
