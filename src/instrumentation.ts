export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  // Explicit opt-in to avoid loading cron dependencies during normal local dev boot.
  if (process.env.ENABLE_CRON_BOOTSTRAP !== 'true') {
    return
  }

  const candidates = ['./lib/cron-jobs', '../lib/cron-jobs', '@/lib/cron-jobs']

  for (const modulePath of candidates) {
    try {
      const loadCronJobs = new Function(
        `return import(${JSON.stringify(modulePath)})`
      ) as () => Promise<{ initCronJobs: () => Promise<void> }>

      const { initCronJobs } = await loadCronJobs()
      await initCronJobs()
      return
    } catch {
      // Try next candidate.
    }
  }

  console.error(
    '[Cron] Bootstrap skipped: cron module could not be resolved from instrumentation runtime.'
  )
}
