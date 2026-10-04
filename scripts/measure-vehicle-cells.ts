/**
 * Mesure, en LECTURE SEULE, les cellules « Véhicules » de la cartographie tactique (`PositionMetricCell`) :
 *  - ancien format `vehicle` (un événement par passager, avion compris) restant à convertir ;
 *  - nouveau format `vehicle_ride` / `vehicle_leave` (un par véhicule, docs/features/positions.md §4.3) ;
 *  - dernières télémétries parsées : portent-elles `teammateAboard` (nouveau parseur déployé) ?
 *
 *   npx tsx scripts/measure-vehicle-cells.ts [nombre de télémétries récentes, 30 par défaut]
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'

type Sample = { vehicleType?: string | null; teammateAboard?: boolean }

async function main() {
  const recent = Number(process.argv[2] ?? 30)
  const metrics = await prisma.$queryRaw<Array<{ metric: string; cells: bigint; matches: bigint; events: bigint }>>(Prisma.sql`
    SELECT metric, COUNT(*) AS cells, COUNT(DISTINCT squadMatchId) AS matches, SUM(eventCount) AS events
    FROM PositionMetricCell
    WHERE metric IN ('vehicle', 'vehicle_ride', 'vehicle_leave')
    GROUP BY metric
  `)
  for (const metric of ['vehicle', 'vehicle_ride', 'vehicle_leave']) {
    const row = metrics.find((entry) => entry.metric === metric)
    console.log(`${metric.padEnd(14)} ${String(row?.cells ?? 0).padStart(8)} cellules · ${String(row?.matches ?? 0).padStart(6)} matchs · ${row?.events ?? 0} événements`)
  }

  const rows = await prisma.$queryRaw<Array<{ squadMatchId: string; parsedAt: Date; vehicleSamples: unknown; vehicleSamplesGz: unknown }>>(Prisma.sql`
    SELECT t.squadMatchId, t.parsedAt, t.vehicleSamples, t.vehicleSamplesGz
    FROM SquadMatchTelemetry t
    WHERE t.status = 'success'
    ORDER BY t.updatedAt DESC
    LIMIT ${recent}
  `)
  let flagged = 0
  let newest: Date | null = null
  let newestLegacy: Date | null = null
  for (const row of rows) {
    const raw = decodeTelemetryRow(row).vehicleSamples
    const samples: Sample[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : []
    if (samples.length === 0) continue
    if (samples.some((sample) => typeof sample.teammateAboard === 'boolean')) {
      flagged += 1
      if (!newest || row.parsedAt > newest) newest = row.parsedAt
    } else if (!newestLegacy || row.parsedAt > newestLegacy) {
      newestLegacy = row.parsedAt
    }
  }
  console.log(`\n${rows.length} télémétries les plus récentes : ${flagged} avec teammateAboard (nouveau parseur)`)
  console.log(`  dernière avec : ${newest?.toISOString() ?? '—'} · dernière sans : ${newestLegacy?.toISOString() ?? '—'}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
