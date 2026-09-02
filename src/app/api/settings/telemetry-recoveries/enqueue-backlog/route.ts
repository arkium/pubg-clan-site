import { getSessionFromRequest } from '@/lib/auth-session'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { enqueueTelemetryBacklog } from '@/lib/telemetry-recoveries-backlog'

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session.isSuperUser) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      clanId?: number
      urgentOnly?: boolean
      limit?: number
    }

    const clanId =
      typeof body.clanId === 'number' && Number.isInteger(body.clanId) && body.clanId > 0
        ? body.clanId
        : undefined

    const urgentOnly = Boolean(body.urgentOnly)
    const limit =
      typeof body.limit === 'number' && Number.isInteger(body.limit) && body.limit > 0
        ? body.limit
        : undefined

    const result = await enqueueTelemetryBacklog({
      clanId,
      urgentOnly,
      limit,
      triggeredBy: session.userId,
    })

    return Response.json(
      buildTelemetrySuccessResponse(
        { scope: 'global', scopeLabel: 'enqueue-backlog' },
        result,
        result
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry recoveries enqueue backlog failed:', error)
    return Response.json(
      buildTelemetryErrorResponse('Failed to enqueue telemetry backlog'),
      { status: 500 }
    )
  }
}
