import { getSessionFromRequest } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'
import {
  computeTournamentModeStandings,
  computeTournamentStandings,
  getTrackedTournamentClanIds,
  getTournamentMatches,
  normalizeTournamentRules,
} from '@/lib/tournament-service'
import {
  buildClanTrophy,
  buildRoundViews,
  buildSquadBreakdown,
  buildStandingViews,
  pickMvp,
  type ClanDirectory,
  type MemberDirectory,
} from '@/lib/tournament-standings-view'

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
      include: { organizerClan: { select: { id: true, name: true, tag: true } } },
    })

    if (!tournament) {
      return Response.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const rules = normalizeTournamentRules(tournament.rules as Record<string, unknown>)
    const matches = await getTournamentMatches(tournamentId)
    const participantClanIds = getTrackedTournamentClanIds(matches)

    // Annuaires de noms : le moteur ne manipule que des identifiants.
    const memberIds = [...new Set(matches.flatMap((match) => match.members.map((row) => row.memberId)))]
    const [clanRows, memberRows] = await Promise.all([
      prisma.clan.findMany({
        where: { id: { in: [...new Set([...participantClanIds, tournament.organizerClanId])] } },
        select: { id: true, name: true, tag: true },
      }),
      memberIds.length > 0
        ? prisma.clanMember.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, displayName: true, clanId: true },
          })
        : Promise.resolve([]),
    ])

    const clans: ClanDirectory = Object.fromEntries(
      clanRows.map((clan) => [clan.id, { name: clan.name, tag: clan.tag }])
    )
    const members: MemberDirectory = Object.fromEntries(
      memberRows.map((member) => [member.id, { displayName: member.displayName, clanId: member.clanId }])
    )

    const modeStandings = buildStandingViews(
      computeTournamentModeStandings(matches, participantClanIds, rules, tournament.organizerClanId),
      clans,
      members
    )

    return Response.json({
      tournament: { ...tournament, rules },
      rules,
      // Vue historique par clan, conservée pour les écrans qui affichent le cumul clan par clan.
      standings: computeTournamentStandings(matches, participantClanIds, rules),
      modeStandings,
      // Détail par escouade : proposé uniquement en inter-clans, où le cumul par clan masque les escouades.
      squadBreakdown:
        rules.mode === 'inter_clan' ? buildSquadBreakdown(matches, participantClanIds, rules, clans, members) : [],
      // Trophée des clans : n'a de sens qu'en solo, où le classement principal est individuel.
      clanTrophy: rules.mode === 'solo_ffa' ? buildClanTrophy(modeStandings, clans) : [],
      rounds: buildRoundViews(matches, participantClanIds, rules, clans, members, tournament.organizerClanId),
      mvp: pickMvp(matches, members, clans),
      participantClanIds,
      clans,
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
          damage: member.damage ?? 0,
          placement: member.placement,
        })),
      })),
    })
  } catch (error) {
    console.error('Error fetching tournament standings:', error)
    return Response.json({ error: 'Failed to fetch tournament standings' }, { status: 500 })
  }
}
