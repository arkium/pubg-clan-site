export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  // Explicit opt-in to avoid loading cron dependencies during normal local dev boot.
  if (process.env.ENABLE_CRON_BOOTSTRAP !== 'true') {
    return
  }

  // Keep cron bootstrap Node-only without exposing a static import edge can traverse.
  const loadCronJobs = new Function(
    'return import("@/lib/cron-jobs")'
  ) as () => Promise<{ initCronJobs: () => Promise<void> }>
  const { initCronJobs } = await loadCronJobs()
  await initCronJobs()
}
