/**
 * Résumé public d'un tournoi pour la page `/tournaments` : ce que la liste doit montrer sans ouvrir chaque tournoi.
 *
 * Le statut affiché ne se limite pas à la colonne `status` : un tournoi `active` dont la période est à venir reste
 * annoncé « à venir », et un tournoi dont la période est passée n'est plus « en direct ».
 *
 * Le classement suit le **mode** du tournoi (`computeTournamentModeStandings`), exactement comme la page de détail :
 * le vainqueur d'un tournoi solo est un joueur, celui d'un tournoi en équipes libres une équipe, et le nombre de
 * participants compte des clans, des équipes, des joueurs ou des escouades selon le cas (refonte du 2026-09-27 ;
 * l'ancienne liste classait toujours par clan).
 */
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { prisma } from '@/lib/prisma'
import { collectTournamentMemberIds, loadTournamentDirectories } from '@/lib/tournament-directories'
import { participantClanIds, resolveTournamentPhase, type TournamentPhase } from '@/lib/tournament-mode-display'
import {
  computeTournamentModeStandings,
  getTournamentMatches,
  getTrackedTournamentClanIds,
  normalizeTournamentRules,
  type TournamentMode,
  type TournamentParticipant,
} from '@/lib/tournament-service'
import { buildStandingViews } from '@/lib/tournament-standings-view'

// Règle partagée avec la page d'un tournoi (côté navigateur) : elle vit dans le module pur.
export { resolveTournamentPhase, type TournamentPhase } from '@/lib/tournament-mode-display'

/** Une ligne de classement, nom résolu. */
export type TournamentStandingSummary = {
  key: string
  participant: TournamentParticipant
  label: string
  clanTags: string[]
  memberLabels: string[]
  /** Clans représentés : un clan, celui d'un joueur, ceux d'une équipe. */
  clanIds: number[]
  totalPoints: number
  totalKills: number
  wins: number
}

export type TournamentOverview = {
  id: string
  title: string
  description: string | null
  status: string
  phase: TournamentPhase
  mode: TournamentMode
  startDate: string
  endDate: string
  gameMode: string | null
  mapName: string | null
  mapLabel: string | null
  organizerClan: { id: number; name: string; tag: string | null } | null
  roundCount: number
  /** Participants classés, selon le mode : clans, équipes, joueurs ou escouades. */
  participantCount: number
  /** Clans distincts présents dans les manches. */
  clanCount: number
  /** Joueurs suivis distincts présents dans les manches comptées (0 tant qu'aucune n'est comptée). */
  playerCount: number
  /** Date de la dernière manche retenue. */
  lastRoundAt: string | null
  /** Trois premiers du classement courant. */
  leaders: TournamentStandingSummary[]
  /** Classement complet, seulement pour un tournoi en direct (la liste y place le lecteur). */
  standings: TournamentStandingSummary[]
  /** Premier du classement, s'il a marqué. Lu comme le vainqueur une fois le tournoi terminé. */
  winner: TournamentStandingSummary | null
}

type LoadedMatches = Awaited<ReturnType<typeof getTournamentMatches>>

/**
 * Liste complète, classement compris. Le nombre de tournois reste petit (quelques dizaines) : un calcul par
 * tournoi est acceptable ici, et évite une requête par carte côté navigateur. Les noms sont résolus en une fois.
 */
export async function listTournamentOverviews(now = new Date()): Promise<TournamentOverview[]> {
  const tournaments = await prisma.tournament.findMany({
    include: { organizerClan: { select: { id: true, name: true, tag: true } } },
    orderBy: [{ startDate: 'desc' }],
  })

  const loaded = await Promise.all(
    tournaments.map(async (tournament) => {
      try {
        return await getTournamentMatches(tournament.id)
      } catch (error) {
        // Un tournoi dont les matchs sont introuvables reste listé, sans classement.
        console.warn('[TournamentOverview] classement indisponible', {
          tournamentId: tournament.id,
          error: error instanceof Error ? error.message : String(error),
        })
        return [] as LoadedMatches
      }
    })
  )

  const [mapLabels, directories] = await Promise.all([
    getMapLabels(),
    loadTournamentDirectories(
      [...tournaments.map((tournament) => tournament.organizerClanId), ...loaded.flatMap(getTrackedTournamentClanIds)],
      loaded.flatMap(collectTournamentMemberIds)
    ),
  ])

  return tournaments.map((tournament, index) => {
    const matches = loaded[index]
    const rules = normalizeTournamentRules(tournament.rules as Record<string, unknown>)
    const participantClans = getTrackedTournamentClanIds(matches)
    const phase = resolveTournamentPhase(tournament, now)
    const standings: TournamentStandingSummary[] = buildStandingViews(
      computeTournamentModeStandings(matches, participantClans, rules, tournament.organizerClanId),
      directories.clans,
      directories.members
    ).map((view) => ({
      key: view.key,
      participant: view.participant,
      label: view.label,
      clanTags: view.clanTags,
      memberLabels: view.memberLabels,
      clanIds: participantClanIds(view.participant),
      totalPoints: view.totalPoints,
      totalKills: view.totalKills,
      wins: view.wins,
    }))
    const lastRound = matches.reduce<Date | null>(
      (latest, match) => (!latest || match.createdAt > latest ? match.createdAt : latest),
      null
    )

    return {
      id: tournament.id,
      title: tournament.title,
      description: tournament.description,
      status: tournament.status,
      phase,
      mode: rules.mode,
      startDate: tournament.startDate.toISOString(),
      endDate: tournament.endDate.toISOString(),
      gameMode: tournament.gameMode,
      mapName: tournament.mapName,
      mapLabel: tournament.mapName ? mapDisplayName(tournament.mapName, mapLabels) : null,
      organizerClan: tournament.organizerClan,
      roundCount: matches.length,
      participantCount: standings.length,
      clanCount: participantClans.length,
      playerCount: collectTournamentMemberIds(matches).length,
      lastRoundAt: lastRound ? lastRound.toISOString() : null,
      leaders: standings.slice(0, 3),
      standings: phase === 'live' ? standings : [],
      winner: standings[0] && standings[0].totalPoints > 0 ? standings[0] : null,
    }
  })
}
