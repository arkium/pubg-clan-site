/**
 * Mesure, en LECTURE SEULE, ce que la télémétrie stockée permet de dire des véhicules pour la « Carte des ressources »
 * (docs/features/carte-ressources.md) : familles de véhicules (`vehicleType`), montées par carte, part des montées en
 * début de partie (proches des points d'apparition), parties analysables par carte.
 *
 *   npx tsx scripts/measure-resource-vehicles.ts [nombre de parties récentes, défaut 400]
 */
import 'dotenv/config'

import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'
import type { TelemetryVehicleSample } from '@/lib/pubg-telemetry/parser'
import { prisma } from '@/lib/prisma'

async function main() {
  const limit = Number(process.argv[2] ?? 400)
  const rows = await prisma.squadMatchTelemetry.findMany({
    where: { OR: [{ vehicleSamplesGz: { not: null } }, { vehicleSamples: { not: null } }] } as never,
    select: { squadMatchId: true, vehicleSamples: true, vehicleSamplesGz: true, squadMatch: { select: { mapName: true, createdAt: true } } } as never,
    orderBy: { squadMatch: { createdAt: 'desc' } } as never,
    take: limit,
  })

  const types = new Map<string, number>()
  const perMap = new Map<string, { matches: number; rides: number; earlyRides: number }>()
  let withTimestamps = 0
  for (const raw of rows as Array<Record<string, unknown>>) {
    const row = decodeTelemetryRow(raw) as { vehicleSamples?: TelemetryVehicleSample[] | null; squadMatch: { mapName: string } }
    const samples = Array.isArray(row.vehicleSamples) ? row.vehicleSamples : []
    const map = row.squadMatch.mapName
    const entry = perMap.get(map) ?? { matches: 0, rides: 0, earlyRides: 0 }
    entry.matches += 1
    for (const sample of samples) {
      types.set(`${sample.action}:${sample.vehicleType ?? 'null'}`, (types.get(`${sample.action}:${sample.vehicleType ?? 'null'}`) ?? 0) + 1)
      if (sample.action !== 'ride') continue
      entry.rides += 1
      if (sample.timestampSeconds !== null) withTimestamps += 1
      if (sample.phase <= 1) entry.earlyRides += 1
    }
    perMap.set(map, entry)
  }

  console.log(`parties lues : ${rows.length}`)
  console.log('familles (action:vehicleType) :', Object.fromEntries([...types.entries()].sort((a, b) => b[1] - a[1])))
  console.log('par carte :', Object.fromEntries(perMap))
  console.log(`montées avec horodatage : ${withTimestamps}`)
  const sample = (rows as Array<Record<string, unknown>>).map((raw) => decodeTelemetryRow(raw) as { vehicleSamples?: TelemetryVehicleSample[] | null }).find((row) => (row.vehicleSamples?.length ?? 0) > 0)
  console.log('exemple de montée :', JSON.stringify(sample?.vehicleSamples?.[0]))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
