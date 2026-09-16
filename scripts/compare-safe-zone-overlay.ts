/**
 * Compare le « cercle moyen » de la page Positions calculé de deux façons, pour un clan, une carte et une période :
 * lecture JSON de tous les `phaseSnapshots` (ancien calcul de la route) et chemin actuel (`SafeZonePhaseStat` +
 * relecture JSON des seuls matchs non couverts). Affiche l'écart et le temps de chaque source. Lecture seule.
 *
 * Usage : npx tsx scripts/compare-safe-zone-overlay.ts <clanId> <du AAAA-MM-JJ> <au AAAA-MM-JJ> [mapName]
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { prisma } from '../src/lib/prisma'
import {
  buildSafeZonePhaseStatRows,
  loadPersistedSafeZoneTotals,
  loadUnpersistedSafeZoneRows,
  safeZoneOverlayFromTotals,
  sumSafeZoneRows,
} from '../src/lib/safe-zone-phase-stats'
import { TACTICAL_PHASE_OPTIONS } from '../src/lib/tactical-phase'

async function timed<T>(run: () => Promise<T>) {
  const startedAt = Date.now()
  const value = await run()
  return { value, ms: Date.now() - startedAt }
}

const format = (overlay: { x: number; y: number; r: number } | null) =>
  overlay ? `x ${overlay.x.toFixed(4)} · y ${overlay.y.toFixed(4)} · r ${overlay.r.toFixed(4)}` : 'aucun cercle'

async function main() {
  const [clanArg, fromArg, toArg, mapArg] = process.argv.slice(2)
  const clanId = Number(clanArg)
  if (!Number.isInteger(clanId) || !fromArg || !toArg) throw new Error('Usage : voir l’en-tête du script')
  const bounds = { startDate: new Date(`${fromArg}T00:00:00`), endDate: new Date(`${toArg}T23:59:59.999`) }
  const filters = Prisma.sql`
    AND sm.createdAt >= ${bounds.startDate} AND sm.createdAt <= ${bounds.endDate}
    AND EXISTS (SELECT 1 FROM SquadMember sdm INNER JOIN ClanMember cm ON cm.id = sdm.memberId WHERE sdm.squadMatchId = sm.id AND cm.clanId = ${clanId})`

  const coverage = await prisma.$queryRaw<Array<{ mapName: string; persisted: bigint; pending: bigint }>>(Prisma.sql`
    SELECT sm.mapName,
      SUM(EXISTS (SELECT 1 FROM SafeZonePhaseStat s WHERE s.squadMatchId = sm.id)) AS persisted,
      SUM(NOT EXISTS (SELECT 1 FROM SafeZonePhaseStat s WHERE s.squadMatchId = sm.id)) AS pending
    FROM SquadMatchTelemetry t INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
    WHERE t.status = 'success' ${filters}
    GROUP BY sm.mapName ORDER BY COUNT(*) DESC
  `)
  console.log('Couverture par carte :')
  for (const row of coverage) console.log(`  ${row.mapName} : ${row.persisted} persisté(s), ${row.pending} à relire`)

  const mapName = mapArg ?? coverage[0]?.mapName
  if (!mapName) throw new Error('Aucun match sur la période')
  console.log(`\nCarte : ${mapName}`)

  // Ancien calcul : tous les JSON de la carte, en deux étapes comme la route d'avant.
  const json = await timed(async () => {
    const matches = await prisma.$queryRaw<Array<{ id: string; mapName: string; createdAt: Date }>>(Prisma.sql`
      SELECT sm.id, sm.mapName, sm.createdAt
      FROM SquadMatch sm INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
      WHERE t.status = 'success' AND sm.mapName = ${mapName} ${filters}
    `)
    if (matches.length === 0) return []
    const snapshots = await prisma.$queryRaw<Array<{ squadMatchId: string; phaseSnapshots: unknown }>>(Prisma.sql`
      SELECT t.squadMatchId, t.phaseSnapshots FROM SquadMatchTelemetry t
      WHERE t.squadMatchId IN (${Prisma.join(matches.map((match) => match.id))})
    `)
    const byMatch = new Map(snapshots.map((row) => [row.squadMatchId, row.phaseSnapshots]))
    return matches.flatMap((match) => buildSafeZonePhaseStatRows(match, byMatch.get(match.id)))
  })
  console.log(`Lecture JSON complète : ${json.ms} ms`)

  for (const option of TACTICAL_PHASE_OPTIONS.filter((entry) => entry.value !== 'all')) {
    const expected = safeZoneOverlayFromTotals(sumSafeZoneRows(json.value, option.phases))
    const current = await timed(() => Promise.all([
      loadPersistedSafeZoneTotals({ clanId, mapName, bounds, phases: option.phases }),
      loadUnpersistedSafeZoneRows({ clanId, mapName, bounds }).then((rows) => sumSafeZoneRows(rows, option.phases)),
    ]))
    const actual = safeZoneOverlayFromTotals(...current.value)
    const delta = expected && actual
      ? Math.max(Math.abs(expected.x - actual.x), Math.abs(expected.y - actual.y), Math.abs(expected.r - actual.r))
      : expected === actual ? 0 : Number.POSITIVE_INFINITY
    console.log(`\n${option.label}`)
    console.log(`  JSON     : ${format(expected)}`)
    console.log(`  actuel   : ${format(actual)} (${current.ms} ms)`)
    console.log(`  écart max : ${delta.toExponential(2)}`)
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
