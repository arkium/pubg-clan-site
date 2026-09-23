/**
 * Compare les horodatages des `positionSamples` et des fermetures de zone d'un match donné,
 * pour comprendre pourquoi aucune position d'arrivée n'est retenue. Lecture seule, un seul match
 * (accès par clé : instantané, contrairement aux parcours complets de la table).
 *
 * Usage : npx tsx scripts/check-zone-closure-timestamps.ts <squadMatchId>
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { detectZoneClosures } from '../src/lib/zone-closure-positions'

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('squadMatchId attendu en argument')

  const [row] = await prisma.$queryRaw<
    Array<{ positionSamples: unknown; deathSamples: unknown; phaseSnapshots: unknown }>
  >(Prisma.sql`
    SELECT positionSamples, deathSamples, phaseSnapshots
    FROM SquadMatchTelemetry WHERE squadMatchId = ${id}
  `)
  if (!row) throw new Error('match introuvable')

  const positions = asArray<{ timestampSeconds?: unknown; memberKey?: unknown; phase?: unknown }>(row.positionSamples)
  const deaths = asArray<{ timestampSeconds?: unknown; phase?: unknown }>(row.deathSamples)
  const closures = detectZoneClosures(asArray(row.phaseSnapshots))

  const ts = positions
    .map((p) => p.timestampSeconds)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

  console.log(`positionSamples : ${positions.length} (dont ${ts.length} horodatés)`)
  if (ts.length > 0) {
    console.log(`  min ${Math.min(...ts)}  max ${Math.max(...ts)}`)
    console.log(`  interprétation : ${Math.max(...ts) > 1e9 ? 'époque absolue (epoch)' : 'secondes écoulées depuis le début du match'}`)
  }

  console.log(`\nfermetures de zone : ${closures.length}`)
  for (const c of closures.slice(0, 5)) {
    console.log(`  phase ${c.phase} -> timestampSeconds ${c.timestampSeconds}`)
  }
  if (closures.length > 0 && ts.length > 0) {
    const first = closures[0].timestampSeconds
    console.log(
      `\nÉcart première fermeture / dernière position antérieure : ` +
        `${ts.filter((t) => t <= first).length} échantillon(s) avant la fermeture`
    )
    console.log(`  (si 0, aucune position n'est retenue : les deux échelles de temps ne coïncident pas)`)
  }

  const dts = deaths
    .map((d) => d.timestampSeconds)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (dts.length > 0) {
    console.log(`\ndeathSamples : ${deaths.length}, timestampSeconds min ${Math.min(...dts)} max ${Math.max(...dts)}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
