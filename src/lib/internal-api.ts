const DEFAULT_INTERNAL_HOST = '127.0.0.1'
const DEFAULT_INTERNAL_PORT = '3000'

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
