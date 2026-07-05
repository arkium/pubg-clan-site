// PUBG only retains match/telemetry data for ~14-15 days — past that, both the
// match endpoint and the telemetry CDN asset return 404, permanently. This is
// expected and unrecoverable, not an application bug, so UI surfaces should show
// a neutral "expired" state instead of an alarming failure. Detects the existing
// generic error message; will also recognize a future dedicated errorCode once
// backend classification is added (see docs/TODO/TODO-settings-cron-refonte.md).
export function isTelemetryDataExpiredError(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined
) {
  if (errorCode === 'TELEMETRY_DATA_EXPIRED') {
    return true
  }

  const message = errorMessage ?? ''
  return (
    message.includes('(404)') &&
    (message.includes('/matches/') || message.includes('Telemetry asset download failed'))
  )
}
