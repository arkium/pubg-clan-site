import { withAdminActionLog } from '@/lib/admin-action-log'
import {
  getTournamentForClan,
  getTournamentMatches,
  materializeTournamentCustomMatches,
} from '@/lib/tournament-service'
import { discoverTournamentRounds } from '@/lib/tournament-round-discovery'
import { tournamentWindowEnd } from '@/lib/tournament-schedule'
import { enqueueTelemetryForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'
import { requireClanFeature } from '@/lib/auth/admin-guards'
import { prisma } from '@/lib/prisma'
import { getActorMemberId } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Synchronisation d'un tournoi — docs/features/tournois.md, « Synchronisation PUBG ».
 *
 * Ouverte au SuperUser (quel que soit son clan) et à l'Owner du clan organisateur. Les manches se découvrent dans les
 * parties PUBG des joueurs du clan organisateur, pas seulement de celui qui clique : un organisateur observateur, ou un
 * SuperUser d'un autre clan, retrouve ainsi la manche jouée par les autres. Le client relance la synchronisation chaque
 * minute tant qu'aucune manche n'arrive (10 essais, src/lib/tournament-sync-summary.ts).
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ clanId: string; tournamentId: string }> }
) {
  try {
    const { clanId, tournamentId } = await params
    const organizerClanId = parseClanId(clanId)

    if (!organizerClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requireClanFeature(request, organizerClanId, 'clan-competition')
    if (permissionError) return permissionError

    const tournament = await getTournamentForClan(organizerClanId, tournamentId)
    if (tournament.organizerClanId !== organizerClanId) {
      return Response.json({ error: 'Only the organizer can synchronize this tournament' }, { status: 403 })
    }

    const actorMemberId = await getActorMemberId(request)

    // Manches déjà au classement : la réponse dit combien ce clic en a ajouté.
    const roundsBefore = await getTournamentMatches(tournamentId)

    const discovery = await discoverTournamentRounds({
      organizerClanId,
      startAt: tournament.startDate,
      endAt: tournamentWindowEnd(tournament.endDate),
      actorMemberId,
      roundMemberIds: new Set(roundsBefore.flatMap((match) => match.members.map((member) => member.memberId))),
    })

    const materialization = await materializeTournamentCustomMatches(tournamentId, { discovered: discovery.rounds })
    const matches = await getTournamentMatches(tournamentId)

    // Télémétrie des seules manches qui ne l'ont pas encore : la relance automatique ne retélécharge rien.
    const parsed = await prisma.squadMatchTelemetry.findMany({
      where: { squadMatchId: { in: matches.map((match) => match.id) }, status: 'success' },
      select: { squadMatchId: true },
    })
    const parsedIds = new Set(parsed.map((row) => row.squadMatchId))
    const telemetry = await enqueueTelemetryForSelectedSquadMatches(
      organizerClanId,
      matches.filter((match) => !parsedIds.has(match.id)).map((match) => match.id),
      actorMemberId
    )

    return Response.json({
      ok: true,
      tournamentId,
      membersRead: discovery.membersRead,
      matchesRead: discovery.matchesRead,
      discoveredRounds: discovery.rounds.length,
      discoveryTruncated: discovery.truncated,
      discoveryErrors: discovery.errors.slice(0, 3),
      materializedMatches: materialization.materializedCount,
      sourceCustomRows: materialization.sourceRowCount,
      sourceCustomMatches: materialization.sourceMatchCount,
      materializationErrors: materialization.errors.slice(0, 3),
      eligibleMatches: matches.length,
      newRounds: Math.max(0, matches.length - roundsBefore.length),
      telemetryQueued: telemetry.queuedCount,
      telemetryReady: parsedIds.size,
    })
  } catch (error) {
    console.error('Tournament manual sync failed:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to synchronize tournament' },
      { status: 500 }
    )
  }
}

export const POST = withAdminActionLog('clans/[clanId]/tournaments/[tournamentId]/sync', handlePost)
