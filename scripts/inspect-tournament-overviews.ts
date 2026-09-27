/**
 * Contrôle en lecture seule de la liste publique des tournois : ce que `GET /api/tournaments` renverra
 * (état affiché, mode, manches, participants et vainqueur selon le mode) et le temps de calcul.
 *
 * Usage : npx tsx scripts/inspect-tournament-overviews.ts
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'
import { participantCountLabel, TOURNAMENT_MODE_DISPLAY } from '../src/lib/tournament-mode-display'
import { listTournamentOverviews } from '../src/lib/tournament-overview'

async function main() {
  const startedAt = Date.now()
  const tournaments = await listTournamentOverviews()
  console.log(`${tournaments.length} tournoi(s) en ${Date.now() - startedAt} ms\n`)

  for (const tournament of tournaments) {
    const winner = tournament.winner
      ? `${tournament.winner.label} · ${tournament.winner.totalPoints} pts`
      : 'aucun classement'
    console.log(
      `${tournament.phase.padEnd(9)} ${TOURNAMENT_MODE_DISPLAY[tournament.mode].label.padEnd(15)} ` +
      `${tournament.title.slice(0, 28).padEnd(30)} ` +
      `${tournament.startDate.slice(0, 10)} → ${tournament.endDate.slice(0, 10)} · ` +
      `${tournament.roundCount} manche(s) · ${participantCountLabel(tournament.mode, tournament.participantCount)} · ${winner}`
    )
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
