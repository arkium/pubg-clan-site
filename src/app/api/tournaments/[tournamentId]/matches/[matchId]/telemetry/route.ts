import { getSessionFromRequest } from '@/lib/auth-session'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { loadMatchDebriefPayload } from '@/lib/pubg-telemetry/match-debrief-payload'
import { loadTournamentRoundContext } from '@/lib/tournament-service'

function parsePositiveInteger(value: string | null) {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Débriefing d'une manche de tournoi. Accès décidé le 2026-09-16 : **tout utilisateur connecté**, sans
 * appartenance au clan, à condition que le match soit bien une manche du tournoi. Les routes API ne sont
 * pas couvertes par la redirection de connexion du proxy : la session est vérifiée ici.
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
    const tournament = await loadTournamentRoundContext(tournamentId, matchId)
    if (!tournament) {
      return Response.json(
        buildTelemetryErrorResponse('This match is not a round of this tournament', 'TOURNAMENT_ROUND_NOT_FOUND'),
        { status: 404 }
      )
    }

    // Sans `teamId`, l'équipe championne de la manche est mise en avant.
    const payload = await loadMatchDebriefPayload({
      matchId,
      teamId: parsePositiveInteger(new URL(request.url).searchParams.get('teamId')),
    })
    if (!payload) {
      return Response.json(
        buildTelemetryErrorResponse('Telemetry not found for this match', 'TELEMETRY_NOT_FOUND'),
        { status: 404 }
      )
    }

    const data = { ...payload, tournament }
    return Response.json(
      buildTelemetrySuccessResponse({ scope: 'global', scopeLabel: 'tournament', count: 1 }, data, data)
    )
  } catch (error) {
    console.error('Tournament match telemetry failed:', error)
    return Response.json(buildTelemetryErrorResponse('Failed to load match telemetry detail'), {
      status: 500,
    })
  }
}
