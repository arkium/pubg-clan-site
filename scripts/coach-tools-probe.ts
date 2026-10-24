import 'dotenv/config'

import { resolveCoachContext } from '../src/lib/coach/coach-context-service'
import { createCoachTools } from '../src/lib/coach/coach-tools'
import { prisma } from '../src/lib/prisma'

/**
 * Mesure des outils du Coach IA sur la vraie base (docs/TODO/chatbot-ia.md, lot 3, contrôle « chaque outil < 1 s »).
 * Lecture seule : aucune écriture, aucun appel au modèle. Pour chaque outil : durée, taille du résultat et tokens
 * estimés (≈ 4 caractères par token), aperçu du JSON.
 *
 *   npx tsx --conditions=react-server scripts/coach-tools-probe.ts
 *   npx tsx --conditions=react-server scripts/coach-tools-probe.ts --clan 1 --member 12 --match <id> --opponent VPR --map Miramar --tournament <id>
 *
 * Sans argument : dernier match analysé, son clan, son premier membre. Sans `--tournament`, le détail porte sur le
 * tournoi le plus récent renvoyé par getTournaments. `--conditions=react-server` : le service des cartes du clan
 * importe `server-only`, qui refuse de charger hors d'un composant serveur sans cette condition (depuis le 2026-10-24).
 */

function argument(flag: string) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function pickScope() {
  const clanArg = Number(argument('--clan'))
  const memberArg = Number(argument('--member'))
  if (clanArg > 0 && memberArg > 0) {
    const member = await prisma.clanMember.findUniqueOrThrow({ where: { id: memberArg }, select: { displayName: true } })
    return { clanId: clanArg, memberId: memberArg, memberName: member.displayName, matchId: argument('--match') ?? null, mapName: argument('--map') ?? 'Erangel' }
  }
  const latest = await prisma.squadMatch.findFirstOrThrow({
    where: { telemetry: { status: 'success' }, members: { some: { member: { clanId: { not: null } } } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, mapName: true, members: { take: 1, select: { member: { select: { id: true, displayName: true, clanId: true } } } } },
  })
  const member = latest.members[0].member
  return { clanId: member.clanId as number, memberId: member.id, memberName: member.displayName, matchId: argument('--match') ?? latest.id, mapName: argument('--map') ?? latest.mapName }
}

async function pickOpponentTag() {
  const explicit = argument('--opponent')
  if (explicit) return explicit
  const clan = await prisma.opponentClan.findFirst({ where: { tag: { not: null } }, orderBy: { players: { _count: 'desc' } }, select: { tag: true } })
  return clan?.tag ?? 'VPR'
}

async function measure(label: string, work: () => Promise<unknown>) {
  const started = performance.now()
  const result = await work()
  const ms = Math.round(performance.now() - started)
  const json = JSON.stringify(result)
  console.log(`\n── ${label} : ${ms} ms · ${json.length} caractères · ≈ ${Math.ceil(json.length / 4)} tokens`)
  console.log(json.slice(0, 400) + (json.length > 400 ? '…' : ''))
  return { label, ms, chars: json.length }
}

async function main() {
  const scope = await pickScope()
  const opponentTag = await pickOpponentTag()
  console.log(`Clan ${scope.clanId}, membre ${scope.memberId} (${scope.memberName}), match ${scope.matchId}, carte ${scope.mapName}, adversaire [${opponentTag}]`)
  const tools = createCoachTools(scope)
  const results = []
  results.push(await measure('resolveCoachContext (débriefing)', () => resolveCoachContext(`/clans/${scope.clanId}/telemetry/matches/${scope.matchId}/debrief`, scope)))
  results.push(await measure('getRecentMatches', () => tools.run({ name: 'getRecentMatches', args: { limit: 5 } })))
  results.push(await measure('getMatchDebrief', () => tools.run({ name: 'getMatchDebrief', args: { matchId: scope.matchId } })))
  results.push(await measure('getWeaponStats', () => tools.run({ name: 'getWeaponStats', args: {} })))
  results.push(await measure('getItemUsage', () => tools.run({ name: 'getItemUsage', args: {} })))
  results.push(await measure('getMapPerformance', () => tools.run({ name: 'getMapPerformance', args: {} })))
  results.push(await measure('getPlaySchedule', () => tools.run({ name: 'getPlaySchedule', args: {} })))
  results.push(await measure('getPlayerBenchmark', () => tools.run({ name: 'getPlayerBenchmark', args: { period: 'month' } })))
  results.push(await measure('getCareerStats', () => tools.run({ name: 'getCareerStats', args: {} })))
  results.push(await measure('getClanPlaystyle', () => tools.run({ name: 'getClanPlaystyle', args: { period: 'month' } })))
  results.push(await measure('getOpponentRecord', () => tools.run({ name: 'getOpponentRecord', args: { clanTag: opponentTag } })))
  results.push(await measure('getDropZones', () => tools.run({ name: 'getDropZones', args: { mapName: scope.mapName } })))
  results.push(await measure('getClanLeaderboard', () => tools.run({ name: 'getClanLeaderboard', args: { period: 'week' } })))
  results.push(await measure('getLeagueStanding', () => tools.run({ name: 'getLeagueStanding', args: { period: 'week' } })))
  const tournaments = (await tools.run({ name: 'getTournaments', args: { limit: 5 } })) as { tournaments?: Array<{ tournamentId: string }> }
  results.push(await measure('getTournaments (cache chaud)', () => tools.run({ name: 'getTournaments', args: { limit: 5 } })))
  const tournamentId = argument('--tournament') ?? tournaments.tournaments?.[0]?.tournamentId ?? null
  if (tournamentId) {
    results.push(await measure('resolveCoachContext (tournoi)', () => resolveCoachContext(`/tournaments/${tournamentId}`, scope)))
    results.push(await measure('getTournamentResults', () => tools.run({ name: 'getTournamentResults', args: { tournamentId } })))
  } else {
    console.log('\n── getTournamentResults : aucun tournoi publié à lire')
  }
  console.log('\n═══ Bilan ═══')
  for (const entry of results) console.log(`${entry.label.padEnd(34)} ${String(entry.ms).padStart(6)} ms  ${String(entry.chars).padStart(7)} car.`)
  const slow = results.filter((entry) => entry.ms > 1000)
  if (slow.length > 0) console.log(`!! ${slow.length} outil(s) au-delà d'une seconde : ${slow.map((entry) => entry.label).join(', ')}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
