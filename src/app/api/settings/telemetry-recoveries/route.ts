
import { getSessionFromRequest } from '@/lib/auth-session'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import {
  getTelemetryRecoveriesOverview,
  type TelemetryRecoveriesWindow,
} from '@/lib/telemetry-recoveries-overview'

function parseWindow(value: string | null): TelemetryRecoveriesWindow {
  if (value === '24h' || value === '7d' || value === '30d' || value === 'all') {
    return value
  }

  return '7d'
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session.isSuperUser) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(request.url)
    const window = parseWindow(url.searchParams.get('window'))

    const overview = await getTelemetryRecoveriesOverview(window)

    return Response.json(
      buildTelemetrySuccessResponse(
        { scope: 'global', window, count: overview.clans.length },
        { clans: overview.clans },
        { window: overview.window, clans: overview.clans }
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry recoveries overview failed:', error)
    return Response.json(
      buildTelemetryErrorResponse('Failed to load telemetry recoveries overview'),
      { status: 500 }
    )
  }
}
