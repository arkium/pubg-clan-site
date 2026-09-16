/**
 * Compare, pour les matchs d'un clan qui ont des `PositionMetricCell`, les cellules persistées et l'agrégation
 * à la volée de la télémétrie brute (celle que la route Positions utilise pour les matchs sans cellules), puis
 * mesure le coût de chaque source. Lecture seule.
 *
 * Usage : npx tsx --conditions=react-server scripts/compare-position-metrics.ts <clanId> <du AAAA-MM-JJ> <au AAAA-MM-JJ> [mapName]
 */
import { Prisma } from '@prisma/client'

import { prisma } from '../src/lib/prisma'
import { loadAggregatedPositionMetricCells, loadRawPositionTelemetryRows } from '../src/lib/position-metric-aggregation'
import type { PositionMetric } from '../src/lib/position-metric-cells'
import { aggregateRawPositionRows } from '../src/lib/position-metric-raw-aggregation'

async function main() {
  const [clanArg, fromArg, toArg, mapArg] = process.argv.slice(2)
  const clanId = Number(clanArg)
  if (!Number.isInteger(clanId) || !fromArg || !toArg) throw new Error('Usage : voir l’en-tête du script')
  const bounds = { startDate: new Date(`${fromArg}T00:00:00`), endDate: new Date(`${toArg}T23:59:59.999`) }
  const clanFilter = Prisma.sql`AND EXISTS (SELECT 1 FROM SquadMember sdm INNER JOIN ClanMember cm ON cm.id = sdm.memberId WHERE sdm.squadMatchId = sm.id AND cm.clanId = ${clanId})`
  const dateFilter = Prisma.sql`AND sm.createdAt >= ${bounds.startDate} AND sm.createdAt <= ${bounds.endDate}`

  const coverage = await prisma.$queryRaw<Array<{ mapName: string; withCells: bigint; withoutCells: bigint }>>(Prisma.sql`
    SELECT sm.mapName,
      SUM(EXISTS (SELECT 1 FROM PositionMetricCell c WHERE c.squadMatchId = sm.id)) AS withCells,
      SUM(NOT EXISTS (SELECT 1 FROM PositionMetricCell c WHERE c.squadMatchId = sm.id)) AS withoutCells
    FROM SquadMatchTelemetry t INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
    WHERE t.status = 'success' ${dateFilter} ${clanFilter}
    GROUP BY sm.mapName ORDER BY withCells DESC
  `)
  console.log('Couverture par carte :')
  for (const row of coverage) console.log(`  ${row.mapName} : ${row.withCells} avec cellules, ${row.withoutCells} sans`)

  const mapName = mapArg ?? coverage[0]?.mapName
  if (!mapName) throw new Error('Aucun match sur la période')

  const members = await prisma.clanMember.findMany({
    where: { clanId },
    select: { id: true, pubgAccountId: true, pubgPlayerName: true, displayName: true },
  })
  const canonicalKeyByLowerKey = new Map<string, string>()
  for (const member of members) {
    const canonical = member.pubgAccountId || member.pubgPlayerName || member.displayName || String(member.id)
    if (member.pubgAccountId) canonicalKeyByLowerKey.set(member.pubgAccountId.toLowerCase(), canonical)
    if (member.pubgPlayerName) canonicalKeyByLowerKey.set(member.pubgPlayerName.toLowerCase(), canonical)
  }

  let startedAt = Date.now()
  const persisted = await loadAggregatedPositionMetricCells({ clanId, mapName, bounds })
  const persistedMs = Date.now() - startedAt

  startedAt = Date.now()
  const rawRowsOfCoveredMatches = await loadRawPositionTelemetryRows({ clanId, mapName, bounds, coverage: 'with_cells' })
  const raw = aggregateRawPositionRows({
    rows: rawRowsOfCoveredMatches,
    mapName,
    canonicalKeyByLowerKey,
    requestedMemberKey: null,
    phaseFilter: 'all',
  })
  const rawMs = Date.now() - startedAt

  const byMetric = (cells: Array<{ metric: PositionMetric; xIndex: number; yIndex: number; count: number }>) => {
    const result = new Map<string, Map<string, number>>()
    for (const cell of cells) {
      const metricCells = result.get(cell.metric) ?? new Map<string, number>()
      metricCells.set(`${cell.xIndex}:${cell.yIndex}`, (metricCells.get(`${cell.xIndex}:${cell.yIndex}`) ?? 0) + cell.count)
      result.set(cell.metric, metricCells)
    }
    return result
  }
  const persistedByMetric = byMetric(persisted)
  const rawByMetric = byMetric(raw.cells)

  console.log(`\nCarte ${mapName} — ${rawRowsOfCoveredMatches.length} matchs couverts par des cellules`)
  console.log('métrique          | cellules persistées | calcul brut | cellules différentes')
  const metrics = new Set([...persistedByMetric.keys(), ...rawByMetric.keys()])
  for (const metric of [...metrics].sort()) {
    const left = persistedByMetric.get(metric) ?? new Map()
    const right = rawByMetric.get(metric) ?? new Map()
    const total = (cells: Map<string, number>) => [...cells.values()].reduce((sum, value) => sum + value, 0)
    let differing = 0
    for (const key of new Set([...left.keys(), ...right.keys()])) {
      if ((left.get(key) ?? 0) !== (right.get(key) ?? 0)) differing += 1
    }
    console.log(`${metric.padEnd(17)} | ${String(total(left)).padStart(19)} | ${String(total(right)).padStart(11)} | ${differing}`)
  }
  console.log(`\nTemps : cellules persistées ${persistedMs} ms ; télémétrie brute des mêmes matchs ${rawMs} ms`)

  // Coût actuel de la partie « télémétrie brute » de la route hybride : matchs sans cellules de la carte.
  startedAt = Date.now()
  const uncoveredRows = await loadRawPositionTelemetryRows({ clanId, mapName, bounds, coverage: 'without_cells' })
  const uncovered = aggregateRawPositionRows({
    rows: uncoveredRows,
    mapName,
    canonicalKeyByLowerKey,
    requestedMemberKey: null,
    phaseFilter: 'all',
  })
  const totalOf = (metric: PositionMetric) =>
    uncovered.cells.filter((cell) => cell.metric === metric).reduce((sum, cell) => sum + cell.count, 0)
  console.log(
    `Matchs sans cellules relus par la route hybride : ${uncoveredRows.length} en ${Date.now() - startedAt} ms ` +
      `(positions ${totalOf('position')}, kills ${totalOf('kill')}, dégâts infligés ${totalOf('damage_dealt')})`
  )
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
