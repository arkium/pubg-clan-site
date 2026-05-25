export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  // Cron bootstrap is handled by the internal endpoint /api/internal/cron/bootstrap
  // from the dedicated cron worker service.
  if (process.env.ENABLE_CRON_BOOTSTRAP === 'true') {
    console.warn(
      '[Cron] ENABLE_CRON_BOOTSTRAP=true is legacy. Use internal cron bootstrap endpoint instead.'
    )
  }
}
