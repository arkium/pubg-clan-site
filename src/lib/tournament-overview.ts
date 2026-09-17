/**
 * Résumé public d'un tournoi pour la page `/tournaments` : ce que la liste doit montrer sans ouvrir chaque tournoi.
 *
 * Le statut affiché ne se limite pas à la colonne `status` : un tournoi `active` dont la période est à venir reste
 * annoncé « à venir », et un tournoi dont la période est passée n'est plus « en direct ». Le classement, lui, est
 * calculé comme sur la page de détail, pour que le vainqueur affiché soit exactement celui du classement final.
 */
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { prisma } from '@/lib/prisma'
import {
  computeTournamentStandings,
  getTournamentMatches,
  getTrackedTournamentClanIds,
} from '@/lib/tournament-service'

/** État réellement affiché, dérivé du statut et des dates. */
export type TournamentPhase = 'draft' | 'live' | 'upcoming' | 'finished'

export type TournamentWinner = {
  clanId: number
  name: string
  tag: string | null
  totalPoints: number
  totalKills: number
}

export type TournamentOverview = {
  id: string
  title: string
  description: string | null
  status: string
  phase: TournamentPhase
  startDate: string
  endDate: string
  gameMode: string | null
  mapName: string | null
  mapLabel: string | null
  organizerClan: { id: number; name: string; tag: string | null } | null
  roundCount: number
  participantCount: number
  winner: TournamentWinner | null
}

function endOfDay(value: Date) {
  const end = new Date(value)
  end.setHours(23, 59, 59, 999)
  return end
}

export function resolveTournamentPhase(
  tournament: { status: string; startDate: Date; endDate: Date },
  now = new Date()
): TournamentPhase {
  if (tournament.status === 'draft') return 'draft'
  if (tournament.status === 'finished') return 'finished'
  if (now < tournament.startDate) return 'upcoming'
  if (now > endOfDay(tournament.endDate)) return 'finished'
  return 'live'
}

/**
 * Liste complète, classement compris. Le nombre de tournois reste petit (quelques dizaines) : un calcul par
 * tournoi est acceptable ici, et évite une requête par carte côté navigateur.
 */
export async function listTournamentOverviews(now = new Date()): Promise<TournamentOverview[]> {
  const tournaments = await prisma.tournament.findMany({
    include: { organizerClan: { select: { id: true, name: true, tag: true } } },
    orderBy: [{ startDate: 'desc' }],
  })

  const mapLabels = await getMapLabels()
  const clanNames = new Map(
    (await prisma.clan.findMany({ select: { id: true, name: true, tag: true } })).map((clan) => [clan.id, clan])
  )

  return Promise.all(
    tournaments.map(async (tournament) => {
      let roundCount = 0
      let participantCount = 0
      let winner: TournamentWinner | null = null

      try {
        const matches = await getTournamentMatches(tournament.id)
        const participantClanIds = getTrackedTournamentClanIds(matches)
        roundCount = matches.length
        participantCount = participantClanIds.length

        const [best] = computeTournamentStandings(
          matches,
          participantClanIds,
          tournament.rules as Record<string, unknown>
        )
        if (best && best.totalPoints > 0) {
          const clan = clanNames.get(best.clanId)
          winner = {
            clanId: best.clanId,
            name: clan?.name ?? `Clan ${best.clanId}`,
            tag: clan?.tag ?? null,
            totalPoints: best.totalPoints,
            totalKills: best.totalKills,
          }
        }
      } catch (error) {
        // Un tournoi dont les matchs sont introuvables reste listé, sans classement.
        console.warn('[TournamentOverview] classement indisponible', {
          tournamentId: tournament.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      return {
        id: tournament.id,
        title: tournament.title,
        description: tournament.description,
        status: tournament.status,
        phase: resolveTournamentPhase(tournament, now),
        startDate: tournament.startDate.toISOString(),
        endDate: tournament.endDate.toISOString(),
        gameMode: tournament.gameMode,
        mapName: tournament.mapName,
        mapLabel: tournament.mapName ? mapDisplayName(tournament.mapName, mapLabels) : null,
        organizerClan: tournament.organizerClan,
        roundCount,
        participantCount,
        winner,
      }
    })
  )
}
