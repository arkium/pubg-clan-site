/**
 * Lecture seule — données réelles de la page Matchs d'un joueur (docs/features/matchs-joueur.md) : volume par période,
 * soirées, modes (membres du clan dans l'équipe), état de la télémétrie, parties sans squad, coût du nombre d'équipes.
 *
 *   npx tsx scripts/check-member-matches.ts [memberId]
 */
import { teamCountFromPhaseSnapshots } from '../src/lib/home-showcase'
import { sessionDateOf } from '../src/lib/match-sessions'
import { getPeriodStart } from '../src/lib/period'
import { prisma } from '../src/lib/prisma'
import { decodeTelemetryRow } from '../src/lib/pubg-telemetry/json-codec'

async function main() {
  const memberId = Number(process.argv[2]) || 75
  for (const period of ['week', 'month', 'all'] as const) {
    const since = getPeriodStart(period)
    const matches = await prisma.match.findMany({
      where: { memberId, ...(since ? { pubgCreatedAt: { gte: since } } : {}) },
      select: { pubgMatchId: true, pubgCreatedAt: true, matchType: true, placement: true, duration: true },
    })
    const sessions = new Set(matches.map((match) => sessionDateOf(match.pubgCreatedAt)))
    const types = matches.reduce<Record<string, number>>((acc, match) => ({ ...acc, [match.matchType]: (acc[match.matchType] ?? 0) + 1 }), {})
    console.log(`${period} : ${matches.length} parties, ${sessions.size} soirées, types ${JSON.stringify(types)}, durée max ${Math.max(0, ...matches.map((m) => m.duration))} s`)
  }

  const all = await prisma.match.findMany({ where: { memberId }, select: { pubgMatchId: true } })
  const squads = await prisma.squadMember.findMany({
    where: { memberId, squadMatch: { pubgMatchId: { in: all.map((match) => match.pubgMatchId) } } },
    select: { squadMatch: { select: { id: true, pubgMatchId: true, _count: { select: { members: true } }, telemetry: { select: { status: true, errorCode: true } } } } },
  })
  const bySize = squads.reduce<Record<number, number>>((acc, row) => ({ ...acc, [row.squadMatch._count.members]: (acc[row.squadMatch._count.members] ?? 0) + 1 }), {})
  const byStatus = squads.reduce<Record<string, number>>((acc, row) => {
    const key = `${row.squadMatch.telemetry?.status ?? 'aucune'}${row.squadMatch.telemetry?.errorCode ? `:${row.squadMatch.telemetry.errorCode}` : ''}`
    return { ...acc, [key]: (acc[key] ?? 0) + 1 }
  }, {})
  console.log(`Parties avec squad : ${squads.length} / ${all.length} ; membres du clan par équipe : ${JSON.stringify(bySize)}`)
  console.log('Télémétrie :', byStatus)

  // Coût du nombre d'équipes (phaseSnapshots compressés) sur toutes les parties du joueur.
  const started = Date.now()
  const rows = await prisma.squadMatchTelemetry.findMany({
    where: { squadMatchId: { in: squads.map((row) => row.squadMatch.id) } },
    select: { squadMatchId: true, phaseSnapshots: true, phaseSnapshotsGz: true },
  })
  const loaded = Date.now()
  const counts = rows.map((row) => teamCountFromPhaseSnapshots(decodeTelemetryRow(row).phaseSnapshots))
  console.log(`Nombre d'équipes : ${rows.length} lignes lues en ${loaded - started} ms, décodées en ${Date.now() - loaded} ms ; exemples ${counts.slice(0, 12).join(', ')} ; nuls ${counts.filter((count) => !count).length}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
