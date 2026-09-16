/**
 * Construit hors HTTP le payload du débriefing (vue clan ou vue tournoi) pour vérifier sur un match réel
 * l'équipe mise en avant, la bande des escouades et les indicateurs de l'escouade. Lecture seule.
 *
 * Usage :
 *   npx tsx --conditions=react-server scripts/inspect-match-debrief.ts clan <squadMatchId> <clanId> [teamId]
 *   npx tsx --conditions=react-server scripts/inspect-match-debrief.ts tournament <tournamentId> [squadMatchId] [teamId]
 *     (sans squadMatchId : la manche la plus récente du tournoi)
 */
import { prisma } from '../src/lib/prisma'
import { loadMatchDebriefPayload, type MatchDebriefPayload } from '../src/lib/pubg-telemetry/match-debrief-payload'
import { getTournamentMatches, loadTournamentRoundContext } from '../src/lib/tournament-service'

function summarize(payload: MatchDebriefPayload) {
  const { match, squadMates, killEvents, telemetry } = payload
  const members = match.members.map((member) => `${member.displayName} ${member.kills}K`)
  const mates = squadMates.map((mate) => `${mate.name} ${mate.kills}K${mate.trackedClan ? ` [suivi ${mate.trackedClan.tag}]` : ''}`)
  const memberKills = match.members.reduce((sum, member) => sum + member.kills, 0)
  const mateKills = squadMates.reduce((sum, mate) => sum + mate.kills, 0)

  console.log('Équipe mise en avant :', match.focus)
  console.log('Classement affiché    :', match.placement)
  console.log('Membres suivis        :', members.join(', ') || '—')
  console.log('Coéquipiers           :', mates.join(', ') || '—')
  console.log('Kills escouade        :', memberKills + mateKills, `(dont coéquipiers : ${mateKills})`)
  console.log('Duels                 :', killEvents.filter((kill) => kill.isSquadKill).length, 'gagnés /', killEvents.filter((kill) => kill.isSquadVictim).length, 'perdus')
  console.log('Zones d’impact        :', telemetry.squadBodyZones.available ? 'disponibles' : 'absentes')
  console.log('Autres clans suivis   :', match.otherTrackedClans.join(', ') || '—')
  console.log(`Bande des escouades (${match.teams.length}) :`)
  for (const team of match.teams.slice(0, 8)) {
    console.log(`  ${team.placementEstimated ? "~" : ""}#${team.placement ?? "?"} équipe ${team.teamId} ${team.tag ? `[${team.tag}]` : ''} ${team.clanName ?? ''} — ${team.kills} kills — ${team.players.join(', ')}`)
  }
}

async function main() {
  const [mode, first, second, third] = process.argv.slice(2)

  if (mode === 'clan' && first && second) {
    const payload = await loadMatchDebriefPayload({
      matchId: first,
      accessClanId: Number(second),
      clanId: Number(second),
      teamId: third ? Number(third) : null,
    })
    if (!payload) throw new Error('Match introuvable pour ce clan')
    summarize(payload)
    return
  }

  if (mode === 'tournament' && first) {
    const matchId = second ?? (await getTournamentMatches(first))[0]?.id
    if (!matchId) throw new Error('Aucune manche pour ce tournoi')
    const context = await loadTournamentRoundContext(first, matchId)
    if (!context) throw new Error('Ce match n’est pas une manche du tournoi')
    console.log(`Tournoi « ${context.title} » — manche ${context.roundNumber}/${context.totalRounds} (${matchId})`)
    for (const score of context.scores) {
      console.log(`  [${score.tag}] ${score.name} : #${score.bestPlacement}, ${score.totalKills} kills → ${score.points} pts`)
    }
    const payload = await loadMatchDebriefPayload({ matchId, teamId: third ? Number(third) : null })
    if (!payload) throw new Error('Télémétrie introuvable pour cette manche')
    summarize(payload)
    return
  }

  throw new Error('Usage : voir l’en-tête du script')
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
