import { isAuthDisabled } from '@/lib/auth-mode'
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
  buildPlayerBreakdown,
  buildPlayerRounds,
  buildRoundViews,
  buildSquadBreakdown,
  buildStandingViews,
  clanLabel,
  memberLabel,
  pickMvp,
} from '@/lib/tournament-standings-view'
import {
  collectTournamentMemberIds,
  loadTournamentClanImages,
  loadTournamentDirectories,
} from '@/lib/tournament-directories'
import { participantClanIds as clanIdsOf } from '@/lib/tournament-mode-display'
import { buildClanAverages, buildTournamentLeaders } from '@/lib/tournament-stats'
import { loadTournamentStats } from '@/lib/tournament-stats-service'

// Lecture réservée aux utilisateurs connectés (2026-09-16), ou ouverte à tous en mode visiteur
// (DISABLE_AUTH_PERMISSIONS) : le proxy ne protège que les pages, pas `/api`.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  if (!(await getSessionFromRequest(request)) && !isAuthDisabled()) {
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
    const { clans, members } = await loadTournamentDirectories(
      [...participantClanIds, tournament.organizerClanId],
      collectTournamentMemberIds(matches)
    )

    const modeStandings = buildStandingViews(
      computeTournamentModeStandings(matches, participantClanIds, rules, tournament.organizerClanId),
      clans,
      members
    )
    // Détail par player : l'onglet en inter-clans, les top scorers et les awards dans tous les modes (en scrims
    // internes, les seuls membres du clan organisateur).
    const playerBreakdown = buildPlayerBreakdown(
      matches,
      participantClanIds,
      rules,
      clans,
      members,
      rules.mode === 'intra_clan' ? tournament.organizerClanId : undefined
    )
    const labelOfMember = (memberId: number) => memberLabel(memberId, members, clans)
    const eligibleMemberIds = playerBreakdown.flatMap((standing) =>
      standing.participant.kind === 'player' ? [standing.participant.memberId] : []
    )

    // Awards, fun facts et armes (2026-10-11) : une erreur de télémétrie ne doit pas priver la page du classement.
    let stats: Awaited<ReturnType<typeof loadTournamentStats>> | null = null
    try {
      stats = await loadTournamentStats(matches, eligibleMemberIds, labelOfMember)
    } catch (error) {
      console.error('Error loading tournament stats:', error)
    }
    // Logo de chaque clan du podium (celui du joueur en solo, le premier clan d'une équipe).
    const clanImages = await loadTournamentClanImages(
      modeStandings.slice(0, 3).flatMap((standing) => clanIdsOf(standing.participant).slice(0, 1))
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
      // Manches escouade par escouade (2026-10-11) : le tableau de chaque manche et la forme du détail par escouade.
      squadRounds:
        rules.mode === 'inter_clan'
          ? buildRoundViews(matches, participantClanIds, { ...rules, mode: 'custom_teams' }, clans, members)
          : [],
      // Détail par player (2026-10-11) : même barème, et les kills de chaque joueur à chaque manche.
      playerBreakdown,
      playerRounds: rules.mode === 'inter_clan' ? buildPlayerRounds(matches, participantClanIds, rules) : [],
      // Moyenne par player de chaque clan (2026-10-11) : l'onglet « Moyenne par clan », inter-clans seulement.
      clanAverages:
        rules.mode === 'inter_clan' ? buildClanAverages(playerBreakdown, (clanId) => clanLabel(clanId, clans)) : [],
      // Top killers et top scorers sous le podium ; le premier des killers est le MVP.
      leaders: buildTournamentLeaders(matches, playerBreakdown, labelOfMember),
      awards: stats?.awards ?? null,
      weapons: stats?.weapons ?? [],
      clanImages,
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
