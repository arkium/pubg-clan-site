import { getSessionFromRequest } from '@/lib/auth-session'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { getTelemetryBacklogSummary } from '@/lib/telemetry-recoveries-backlog'

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session.isSuperUser) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const summary = await getTelemetryBacklogSummary()

    return Response.json(
      buildTelemetrySuccessResponse(
        { scope: 'global', scopeLabel: 'backlog', count: summary.clans.length },
        summary,
        summary
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry recoveries backlog failed:', error)
    return Response.json(
      buildTelemetryErrorResponse('Failed to load telemetry backlog summary'),
      { status: 500 }
    )
  }
}
