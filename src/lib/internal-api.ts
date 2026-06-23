const DEFAULT_INTERNAL_HOST = '127.0.0.1'
const DEFAULT_INTERNAL_PORT = '3000'
const INTERNAL_CRON_AUTH_HEADER = 'x-cron-bootstrap-secret'

export function getInternalApiBaseUrl() {
  const configuredBaseUrl =
    process.env.INTERNAL_APP_URL ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '')
  }

  const port = process.env.PORT ?? DEFAULT_INTERNAL_PORT

  return `http://${DEFAULT_INTERNAL_HOST}:${port}`
}

export function getInternalCronAuthHeaders(): Record<string, string> {
  const secret = process.env.CRON_BOOTSTRAP_SECRET?.trim()

  if (!secret) {
    return {}
  }

  return {
    [INTERNAL_CRON_AUTH_HEADER]: secret,
  }
}

export function isInternalCronRequest(request: Request) {
  const expected = process.env.CRON_BOOTSTRAP_SECRET?.trim()

  if (!expected) {
    return false
  }

  const received = request.headers.get(INTERNAL_CRON_AUTH_HEADER)?.trim()
  return received === expected
}
