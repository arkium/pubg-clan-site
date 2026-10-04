/**
 * Mesure, en LECTURE SEULE, le volume des cellules « véhicule » de la cartographie tactique (`PositionMetricCell`,
 * metric = 'vehicle') et la présence du type de véhicule sur les plus anciens matchs (télémétrie d'avant le type ?).
 * Sert à dimensionner la reconstruction qui retire les engins volants.
 *
 *   npx tsx scripts/measure-vehicle-cells.ts 30
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'

type Sample = { vehicleType?: string | null }

async function main() {
  const oldest = Number(process.argv[2] ?? 30)
  const [cells] = await prisma.$queryRaw<Array<{ cells: bigint; matches: bigint; events: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS cells, COUNT(DISTINCT squadMatchId) AS matches, SUM(eventCount) AS events
    FROM PositionMetricCell WHERE metric = 'vehicle'
  `)
  console.log(`Cellules véhicule : ${cells.cells} lignes · ${cells.matches} matchs · ${cells.events} événements`)

  const [withSamples] = await prisma.$queryRaw<Array<{ matches: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS matches FROM SquadMatchTelemetry
    WHERE status = 'success' AND (vehicleSamples IS NOT NULL OR vehicleSamplesGz IS NOT NULL)
  `)
  console.log(`Télémétries avec échantillons véhicule : ${withSamples.matches}`)

  const rows = await prisma.$queryRaw<Array<{ vehicleSamples: unknown; vehicleSamplesGz: unknown; createdAt: Date }>>(Prisma.sql`
    SELECT t.vehicleSamples, t.vehicleSamplesGz, sm.createdAt
    FROM SquadMatchTelemetry t
    INNER JOIN PositionMetricCell c ON c.squadMatchId = t.squadMatchId AND c.metric = 'vehicle'
    INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
    GROUP BY t.squadMatchId
    ORDER BY MIN(c.matchDate) ASC
    LIMIT ${oldest}
  `)
  let total = 0
  let untyped = 0
  for (const row of rows) {
    const raw = decodeTelemetryRow(row).vehicleSamples
    const samples: Sample[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : []
    total += samples.length
    untyped += samples.filter((sample) => !sample.vehicleType).length
  }
  console.log(`${rows.length} plus anciens matchs (depuis ${rows[0]?.createdAt.toISOString().slice(0, 10)}) : ${total} échantillons, ${untyped} sans type`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
