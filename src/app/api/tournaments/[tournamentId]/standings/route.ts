import { getSessionFromRequest } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'
import {
  computeTournamentStandings,
  getTrackedTournamentClanIds,
  getTournamentMatches,
} from '@/lib/tournament-service'

// Réservé aux utilisateurs connectés (2026-09-16) : le proxy ne protège que les pages, pas `/api`.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const { tournamentId } = await params
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        organizerClan: { select: { id: true, name: true } },
      },
    })

    if (!tournament) {
      return Response.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const matches = await getTournamentMatches(tournamentId)
    const participantClanIds = getTrackedTournamentClanIds(matches)

    const standings = computeTournamentStandings(
      matches,
      participantClanIds,
      tournament.rules as Record<string, unknown>
    )

    return Response.json({
      tournament,
      standings,
      participantClanIds,
      matches: matches.map((match) => ({
        id: match.id,
        createdAt: match.createdAt,
        mapName: match.mapName,
        gameMode: match.gameMode,
        placement: match.placement,
        members: match.members.map((member) => ({
          memberId: member.memberId,
          displayName: member.member.displayName,
          clanId: member.member.clanId,
          kills: member.kills,
          placement: member.placement,
        })),
      })),
    })
  } catch (error) {
    console.error('Error fetching tournament standings:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch standings' },
      { status: 500 }
    )
  }
}
