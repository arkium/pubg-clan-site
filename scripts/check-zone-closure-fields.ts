/**
 * Compare la forme d'un `positionSamples` entre un match qui ne produit aucune
 * `ZoneClosurePosition` et un match qui en a produit. Lecture seule, accès par clé.
 *
 * Usage : npx tsx scripts/check-zone-closure-fields.ts <squadMatchIdEnEchec>
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'

async function premierEchantillon(squadMatchId: string) {
  const [row] = await prisma.$queryRaw<Array<{ sample: unknown; total: number }>>(Prisma.sql`
    SELECT JSON_EXTRACT(positionSamples, '$[0]') AS sample,
           JSON_LENGTH(positionSamples) AS total
    FROM SquadMatchTelemetry WHERE squadMatchId = ${squadMatchId}
  `)
  return row
}

async function main() {
  const echec = process.argv[2]
  if (!echec) throw new Error('squadMatchId en échec attendu en argument')

  const [reussi] = await prisma.$queryRaw<Array<{ squadMatchId: string; matchDate: Date }>>(Prisma.sql`
    SELECT z.squadMatchId, z.matchDate
    FROM ZoneClosurePosition z
    ORDER BY z.matchDate DESC
    LIMIT 1
  `)

  const a = await premierEchantillon(echec)
  console.log(`--- Match SANS ZoneClosurePosition : ${echec}`)
  console.log(`    positionSamples : ${a?.total}`)
  console.log(`    1er échantillon : ${JSON.stringify(a?.sample)}`)

  if (reussi) {
    const b = await premierEchantillon(reussi.squadMatchId)
    console.log(`\n--- Match AVEC ZoneClosurePosition : ${reussi.squadMatchId} (${reussi.matchDate.toISOString().slice(0, 10)})`)
    console.log(`    positionSamples : ${b?.total}`)
    console.log(`    1er échantillon : ${JSON.stringify(b?.sample)}`)
  } else {
    console.log('\nAucune ZoneClosurePosition en base : pas de match de référence.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
