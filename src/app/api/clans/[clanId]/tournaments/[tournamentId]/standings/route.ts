import { NextRequest } from 'next/server'

import { prisma } from '@/lib/prisma'
import {
  computeTournamentStandings,
  getTrackedTournamentClanIds,
  getTournamentForClan,
  getTournamentMatches,
} from '@/lib/tournament-service'
import { requireNavPermission } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clanId: string; tournamentId: string }> }
) {
  try {
    const { clanId, tournamentId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requireNavPermission('clan.overview')(request, { clanId: parsedClanId })
    if (permissionError) return permissionError

    const tournament = await getTournamentForClan(parsedClanId, tournamentId)
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
