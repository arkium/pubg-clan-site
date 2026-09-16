import { getSessionFromRequest } from '@/lib/auth-session'
import { buildTelemetryErrorResponse } from '@/lib/pubg-telemetry/api-contract'
import { REPLAY_NO_POSITIONS_MESSAGE, loadMatchReplay } from '@/lib/pubg-telemetry/match-replay-loader'
import { loadTournamentRoundContext } from '@/lib/tournament-service'

/**
 * Replay 2D d'une manche de tournoi — même règle d'accès que la télémétrie : tout utilisateur connecté,
 * pour un match qui est bien une manche du tournoi. Aucun clan n'est mis en avant côté serveur : le lecteur
 * suit l'escouade choisie dans le débriefing.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return Response.json(buildTelemetryErrorResponse('Authentication required', 'UNAUTHORIZED'), {
        status: 401,
      })
    }

    const { tournamentId, matchId } = await params
    if (!(await loadTournamentRoundContext(tournamentId, matchId))) {
      return Response.json(
        buildTelemetryErrorResponse('This match is not a round of this tournament', 'TOURNAMENT_ROUND_NOT_FOUND'),
        { status: 404 }
      )
    }

    const result = await loadMatchReplay({ matchId, currentClanId: null })
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
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    )
  } catch (error) {
    console.error('Tournament match replay failed:', error)
    return Response.json(buildTelemetryErrorResponse('Failed to build match replay'), { status: 500 })
  }
}
