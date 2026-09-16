import { buildTelemetryErrorResponse } from '@/lib/pubg-telemetry/api-contract'
import { REPLAY_NO_POSITIONS_MESSAGE, loadMatchReplay } from '@/lib/pubg-telemetry/match-replay-loader'
import { requireNavPermission } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string; matchId: string }> }
) {
  try {
    const { clanId, matchId } = await params
    const parsedClanId = parseClanId(clanId)

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

    const result = await loadMatchReplay({ matchId, accessClanId: parsedClanId, currentClanId: parsedClanId })

    if (result.status === 'not_found') {
      return Response.json(
        buildTelemetryErrorResponse('Telemetry not found for this match', 'TELEMETRY_NOT_FOUND'),
        { status: 404 }
      )
    }
    if (result.status === 'no_positions') {
      return Response.json(buildTelemetryErrorResponse(REPLAY_NO_POSITIONS_MESSAGE, 'REPLAY_NO_POSITIONS'), {
        status: 404,
      })
    }

    return Response.json(
      { ok: true, data: result.data },
      {
        // La télémétrie d'un match parsé ne change plus : un cache privé court
        // évite de reconstruire le payload à chaque aller-retour d'onglet.
        headers: { 'Cache-Control': 'private, max-age=300' },
      }
    )
  } catch (error) {
    console.error('Match replay payload failed:', error)
    return Response.json(buildTelemetryErrorResponse('Failed to build match replay'), {
      status: 500,
    })
  }
}
