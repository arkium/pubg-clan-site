type TelemetryScope = 'clan' | 'member'

type TelemetryMeta = {
  scope: TelemetryScope
  scopeLabel?: string
  clanId?: number
  memberId?: number
  period?: 'week' | 'month' | 'all'
  periodKey?: string
  window?: '24h' | '7d' | '30d' | 'all'
  limit?: number
  count?: number
}

export function buildTelemetrySuccessResponse<TData extends Record<string, unknown>>(
  meta: TelemetryMeta,
  data: TData,
  legacy: Record<string, unknown> = {}
) {
  return {
    ok: true,
    meta,
    data,
    ...legacy,
  }
}

export function buildTelemetryErrorResponse(message: string, code?: string) {
  return {
    ok: false,
    error: {
      message,
      code: code ?? 'TELEMETRY_API_ERROR',
    },
  }
}
