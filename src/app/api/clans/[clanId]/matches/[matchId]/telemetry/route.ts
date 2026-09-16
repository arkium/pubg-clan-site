import { requireNavPermission } from '@/middleware/auth-permission'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { loadMatchDebriefPayload } from '@/lib/pubg-telemetry/match-debrief-payload'

function parsePositiveInteger(value: string | null) {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string; matchId: string }> }
) {
  try {
    const { clanId, matchId } = await params
    const parsedClanId = parsePositiveInteger(clanId)

    if (!parsedClanId) {
      return Response.json(buildTelemetryErrorResponse('Invalid clan id', 'INVALID_CLAN_ID'), {
        status: 400,
      })
    }

    const roleError = await requireNavPermission('clan.matches')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    if (!matchId || typeof matchId !== 'string') {
      return Response.json(buildTelemetryErrorResponse('Invalid match id', 'INVALID_MATCH_ID'), {
        status: 400,
      })
    }

    // `teamId` : équipe choisie dans la bande des escouades ; sans lui, l'équipe du clan consulté.
    const payload = await loadMatchDebriefPayload({
      matchId,
      accessClanId: parsedClanId,
      clanId: parsedClanId,
      teamId: parsePositiveInteger(new URL(request.url).searchParams.get('teamId')),
    })

    if (!payload) {
      return Response.json(
        buildTelemetryErrorResponse('Telemetry not found for this match', 'TELEMETRY_NOT_FOUND'),
        { status: 404 }
      )
    }

    return Response.json(
      buildTelemetrySuccessResponse({ scope: 'clan', clanId: parsedClanId, count: 1 }, payload, payload)
    )
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry match detail failed:', error)
    return Response.json(buildTelemetryErrorResponse('Failed to load match telemetry detail'), {
      status: 500,
    })
  }
}
