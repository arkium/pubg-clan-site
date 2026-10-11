/**
 * Contrôle en lecture seule des statistiques d'un tournoi telles que la page les recevra (docs/features/tournois.md,
 * « Statistiques du tournoi ») : moyenne par clan, top killers et top scorers, awards et fun facts, armes. Mêmes
 * fonctions que `GET /api/tournaments/[id]/standings`, rien n'est écrit.
 *
 * Usage : npx tsx scripts/inspect-tournament-stats.ts <tournamentId>
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'
import { getTournamentMatches, getTrackedTournamentClanIds, normalizeTournamentRules } from '../src/lib/tournament-service'
import { buildPlayerBreakdown, clanLabel, memberLabel } from '../src/lib/tournament-standings-view'
import { collectTournamentMemberIds, loadTournamentDirectories } from '../src/lib/tournament-directories'
import { buildClanAverages, buildTournamentLeaders } from '../src/lib/tournament-stats'
import { loadTournamentStats } from '../src/lib/tournament-stats-service'

const decimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function main() {
  const tournamentId = process.argv[2]
  if (!tournamentId) throw new Error('Usage : voir l’en-tête du script')
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
  if (!tournament) throw new Error('Tournoi introuvable')

  const rules = normalizeTournamentRules(tournament.rules as Record<string, unknown>)
  const matches = await getTournamentMatches(tournamentId)
  const participantClanIds = getTrackedTournamentClanIds(matches)
  const { clans, members } = await loadTournamentDirectories(
    [...participantClanIds, tournament.organizerClanId],
    collectTournamentMemberIds(matches)
  )
  const players = buildPlayerBreakdown(
    matches,
    participantClanIds,
    rules,
    clans,
    members,
    rules.mode === 'intra_clan' ? tournament.organizerClanId : undefined
  )
  const labelOf = (memberId: number) => memberLabel(memberId, members, clans)

  console.log(`« ${tournament.title} » · mode ${rules.mode} · ${matches.length} manche(s) · ${players.length} player(s)\n`)

  if (rules.mode === 'inter_clan') {
    console.log('Moyenne par clan (Σ points des players ÷ players) :')
    for (const entry of buildClanAverages(players, (clanId) => clanLabel(clanId, clans))) {
      console.log(`  #${String(entry.rank).padEnd(3)} ${entry.label.slice(0, 34).padEnd(36)} ${decimal.format(entry.average).padStart(6)} · ${entry.players} players · ${entry.points} pts`)
    }
  }

  const leaders = buildTournamentLeaders(matches, players, labelOf)
  console.log('\nTop killers :', leaders.killers.slice(0, 5).map((entry) => `${entry.label} ${entry.kills}`).join(' · '))
  console.log('Top scorers :', leaders.scorers.slice(0, 5).map((entry) => `${entry.label} ${entry.points}`).join(' · '))

  const started = Date.now()
  const stats = await loadTournamentStats(matches, players.flatMap((p) => (p.participant.kind === 'player' ? [p.participant.memberId] : [])), labelOf)
  console.log(`\nAwards et armes calculés en ${Date.now() - started} ms · télémétrie ${stats.awards.telemetryRounds}/${stats.awards.rounds} manches`)

  console.log('\nFun facts :')
  for (const fact of stats.awards.facts) console.log(`  ${fact.label} : ${fact.value} ${fact.unit}${fact.detail ? ` (${fact.detail})` : ''}`)

  console.log('\nAwards :')
  for (const award of stats.awards.awards) {
    const winners = award.winners.map((winner) => `${winner.label} ${Math.round(winner.value * 10) / 10}${winner.round ? ` (M${winner.round})` : ''}`)
    console.log(`  ${award.label.padEnd(30)} ${winners.join(' · ')}`)
  }

  console.log('\nArmes :')
  for (const weapon of stats.weapons) {
    console.log(`  ${weapon.name.padEnd(18)} ${String(weapon.kills).padStart(3)} kills · ${weapon.shooters.map((shooter) => `${shooter.label} ${shooter.kills}`).join(', ')}`)
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
