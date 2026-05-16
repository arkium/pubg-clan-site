export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  const { initCronJobs } = await import('@/lib/cron-jobs')

  initCronJobs()
}
