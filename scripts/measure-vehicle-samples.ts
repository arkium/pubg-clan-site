/**
 * Mesure, en LECTURE SEULE, ce que contient la métrique « véhicules » de la cartographie tactique : types de véhicules
 * et actions (montée / descente) des `vehicleSamples` de la télémétrie, pour les derniers matchs d'un clan.
 * Sert à décider quoi exclure (avion C-130, parachute, engins volants).
 *
 *   npx tsx scripts/measure-vehicle-samples.ts 13 40
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'

type Sample = { action?: string; vehicleType?: string | null }

async function main() {
  const clanId = Number(process.argv[2] ?? 13)
  const limit = Number(process.argv[3] ?? 40)
  // Derniers matchs du clan : chemin indexé (membres du clan → matchs), comme la route Positions.
  const matches = await prisma.$queryRaw<Array<{ id: string; mapName: string }>>(Prisma.sql`
    SELECT DISTINCT sm.id, sm.mapName, sm.createdAt
    FROM ClanMember cm
    INNER JOIN SquadMember sdm ON sdm.memberId = cm.id
    INNER JOIN SquadMatch sm ON sm.id = sdm.squadMatchId
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id AND t.status = 'success'
    WHERE cm.clanId = ${clanId}
    ORDER BY sm.createdAt DESC
    LIMIT ${limit}
  `)
  if (matches.length === 0) {
    console.log('Aucun match.')
    return
  }
  const rows = await prisma.$queryRaw<Array<{ squadMatchId: string; vehicleSamples: unknown; vehicleSamplesGz: unknown }>>(Prisma.sql`
    SELECT t.squadMatchId, t.vehicleSamples, t.vehicleSamplesGz
    FROM SquadMatchTelemetry t
    WHERE t.squadMatchId IN (${Prisma.join(matches.map((match) => match.id))})
  `)

  const tally = new Map<string, { ride: number; leave: number }>()
  let total = 0
  for (const row of rows) {
    const decoded = decodeTelemetryRow(row)
    const raw = decoded.vehicleSamples
    const samples: Sample[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : []
    for (const sample of samples) {
      const type = sample.vehicleType ?? '(inconnu)'
      const entry = tally.get(type) ?? { ride: 0, leave: 0 }
      if (sample.action === 'ride') entry.ride += 1
      else entry.leave += 1
      tally.set(type, entry)
      total += 1
    }
  }

  console.log(`Clan ${clanId} · ${rows.length} matchs · ${total} échantillons véhicule\n`)
  console.log('type de véhicule'.padEnd(34), 'montées'.padStart(8), 'descentes'.padStart(10), 'part'.padStart(7))
  for (const [type, counts] of [...tally.entries()].sort((a, b) => b[1].ride + b[1].leave - (a[1].ride + a[1].leave))) {
    const share = ((counts.ride + counts.leave) / Math.max(1, total)) * 100
    console.log(type.padEnd(34), String(counts.ride).padStart(8), String(counts.leave).padStart(10), `${share.toFixed(1)} %`.padStart(7))
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
