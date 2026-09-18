/**
 * Contrôle en lecture seule du classement d'un tournoi tel que la page le recevra : mode, classement par
 * participant, podium, manches numérotées et MVP. Permet de rejouer le même tournoi dans les 4 modes.
 *
 * Usage : npx tsx scripts/inspect-tournament-standings.ts <tournamentId> [inter_clan|custom_teams|solo_ffa|intra_clan]
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'
import {
  computeTournamentModeStandings,
  getTournamentMatches,
  getTrackedTournamentClanIds,
  normalizeTournamentRules,
} from '../src/lib/tournament-service'
import {
  buildClanTrophy,
  buildRoundViews,
  buildStandingViews,
  pickMvp,
} from '../src/lib/tournament-standings-view'

async function main() {
  const tournamentId = process.argv[2]
  const forcedMode = process.argv[3]
  if (!tournamentId) throw new Error('Usage : voir l’en-tête du script')

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
  if (!tournament) throw new Error('Tournoi introuvable')

  const rules = normalizeTournamentRules({
    ...(tournament.rules as Record<string, unknown>),
    ...(forcedMode ? { mode: forcedMode } : {}),
  })
  const matches = await getTournamentMatches(tournamentId)
  const participantClanIds = getTrackedTournamentClanIds(matches)
  const memberIds = [...new Set(matches.flatMap((match) => match.members.map((row) => row.memberId)))]

  const [clanRows, memberRows] = await Promise.all([
    prisma.clan.findMany({ where: { id: { in: participantClanIds } }, select: { id: true, name: true, tag: true } }),
    prisma.clanMember.findMany({ where: { id: { in: memberIds } }, select: { id: true, displayName: true, clanId: true } }),
  ])
  const clans = Object.fromEntries(clanRows.map((clan) => [clan.id, { name: clan.name, tag: clan.tag }]))
  const members = Object.fromEntries(memberRows.map((m) => [m.id, { displayName: m.displayName, clanId: m.clanId }]))

  console.log(`« ${tournament.title} » · mode ${rules.mode}${rules.mode === 'inter_clan' ? ` (${rules.mixedSquadRule})` : ''}`)
  console.log(`${matches.length} manche(s) · ${participantClanIds.length} clan(s) · ${memberIds.length} joueur(s)\n`)

  const standings = buildStandingViews(
    computeTournamentModeStandings(matches, participantClanIds, rules, tournament.organizerClanId),
    clans,
    members
  )
  console.log('Classement :')
  for (const standing of standings.slice(0, 8)) {
    console.log(
      `  #${standing.rank} ${standing.label.slice(0, 46).padEnd(48)} ${standing.totalPoints} pts · ` +
      `${standing.totalKills} kills · ${standing.matchesPlayed} manche(s) · ${standing.wins} victoire(s)`
    )
  }

  const mvp = pickMvp(matches, members, clans)
  console.log('\nMVP :', mvp ? `${mvp.label} · ${mvp.kills} kills · ${mvp.damage} dégâts` : 'aucun')

  if (rules.mode === 'solo_ffa') {
    console.log('Trophée des clans :', buildClanTrophy(
      computeTournamentModeStandings(matches, participantClanIds, rules, tournament.organizerClanId),
      clans
    ).map((entry) => `${entry.label} ${entry.points} pts`).join(' · '))
  }

  console.log('\nManches :')
  for (const round of buildRoundViews(matches, participantClanIds, rules, clans, members, tournament.organizerClanId)) {
    console.log(
      `  Manche #${round.index} · ${round.createdAt.slice(0, 16).replace('T', ' ')} · ${round.mapName ?? '—'} · ` +
      `vainqueur ${round.winnerLabel ?? 'aucun'} · MVP ${round.mvp?.label ?? 'aucun'}`
    )
    for (const score of round.scores.slice(0, 4)) {
      console.log(`      ${score.label.slice(0, 44).padEnd(46)} ${score.points} pts (place ${score.bestPlacement})`)
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
