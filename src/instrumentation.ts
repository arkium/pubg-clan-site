export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  // Explicit opt-in to avoid loading cron dependencies during normal local dev boot.
  if (process.env.ENABLE_CRON_BOOTSTRAP !== 'true') {
    return
  }

  // Keep runtime-only loading so webpack/turbopack does not try to bundle node-only deps
  // (nodemailer/stream) into instrumentation in dev.
  const loadCronJobs = new Function(
    'return import("./lib/cron-jobs")'
  ) as () => Promise<{ initCronJobs: () => Promise<void> }>
  const { initCronJobs } = await loadCronJobs()
  await initCronJobs()
}
