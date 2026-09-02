import { getSessionFromRequest } from '@/lib/auth-session'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { getTelemetryRecoveriesStatus } from '@/lib/telemetry-recoveries-status'

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session.isSuperUser) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const status = await getTelemetryRecoveriesStatus()

    return Response.json(
      buildTelemetrySuccessResponse(
        { scope: 'global', scopeLabel: 'status' },
        status,
        status
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry recoveries status failed:', error)
    return Response.json(
      buildTelemetryErrorResponse('Failed to load telemetry status'),
      { status: 500 }
    )
  }
}
