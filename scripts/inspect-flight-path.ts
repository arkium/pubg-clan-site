/**
 * Contrôle du plan de vol reconstitué pour un match : points d'atterrissage utilisés, axe déduit, et sa
 * fiabilité (longueur de la base de mesure comparée à la taille de la carte). Lecture seule.
 *
 * Usage : npx tsx scripts/inspect-flight-path.ts <squadMatchId>
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'
import { computeFlightPath, computeFlightPathFromJumps } from '../src/lib/pubg-telemetry/flight-path'
import { extractInitialJumps } from '../src/lib/pubg-telemetry/match-replay'
import { getMapBounds, toMapPercent } from '../src/lib/pubg-telemetry/position-heatmap'

const asArray = (value: unknown): Array<Record<string, number>> => {
  if (Array.isArray(value)) return value as Array<Record<string, number>>
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as Array<Record<string, number>>) : []
  } catch {
    return []
  }
}

async function main() {
  const squadMatchId = process.argv[2]
  if (!squadMatchId) throw new Error('Usage : voir l’en-tête du script')

  const [row] = await prisma.$queryRawUnsafe<Array<{
    mapName: string
    createdAt: Date
    landingSamples: unknown
    vehicleSamples: unknown
  }>>(
    'SELECT sm.mapName, sm.createdAt, t.landingSamples, t.vehicleSamples FROM SquadMatch sm INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id WHERE sm.id = ?',
    squadMatchId
  )
  if (!row) throw new Error('Match introuvable')

  const landings = asArray(row.landingSamples)
  const bounds = getMapBounds(row.mapName)
  console.log(`${squadMatchId} · ${row.mapName} (${bounds.width} unités de côté) · ${landings.length} atterrissage(s)`)

  for (const landing of landings) {
    const percent = toMapPercent(row.mapName, landing.x, landing.y)
    console.log(`  (${Math.round(landing.x)}, ${Math.round(landing.y)}) → ${percent.x.toFixed(1)} %, ${percent.y.toFixed(1)} % · t=${landing.timestampSeconds}`)
  }

  // Même ordre de préférence que la route `/replay` : les sauts d'abord, les atterrissages en secours.
  const jumps = [...extractInitialJumps(row.vehicleSamples, row.createdAt.getTime() / 1000).values()]
  console.log(`
Sauts hors de l'avion : ${jumps.length}`)
  for (const jump of jumps) {
    const percent = toMapPercent(row.mapName, jump.x, jump.y)
    console.log(`  t=${jump.t}s (${jump.x}, ${jump.y}) → ${percent.x.toFixed(1)} %, ${percent.y.toFixed(1)} %`)
  }

  const fromJumps = computeFlightPathFromJumps(jumps, row.mapName)
  const fromLandings = computeFlightPath(row.landingSamples, row.mapName)
  console.log(
    `
Axe depuis les sauts : ${fromJumps ? `${fromJumps.angleDeg}°` : 'indisponible'} · ` +
    `axe depuis les atterrissages : ${fromLandings ? `${fromLandings.angleDeg}°` : 'indisponible'}`
  )

  const flight = fromJumps ?? fromLandings
  if (!flight) {
    console.log('\nAucun plan de vol calculé.')
    return
  }

  console.log(`Source retenue par la page : ${fromJumps ? 'sauts' : 'atterrissages'}`)
  const baseline = Math.hypot(flight.dropEnd.x - flight.dropStart.x, flight.dropEnd.y - flight.dropStart.y)
  const start = toMapPercent(row.mapName, flight.start.x, flight.start.y)
  const end = toMapPercent(row.mapName, flight.end.x, flight.end.y)

  console.log(`\nAxe déduit : ${flight.angleDeg}° · entrée ${start.x.toFixed(1)} %, ${start.y.toFixed(1)} % → sortie ${end.x.toFixed(1)} %, ${end.y.toFixed(1)} %`)
  console.log(`Base de mesure entre le premier et le dernier largage : ${Math.round(baseline)} unités (${(baseline / 100).toFixed(0)} m)`)
  console.log(`Part de la carte couverte par cette base : ${((baseline / bounds.width) * 100).toFixed(1)} %`)
  console.log('Horaires :', flight.timing ? JSON.stringify(flight.timing) : 'aucun')
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
