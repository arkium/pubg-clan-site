/**
 * Le worker déployé écrit-il bien en compressé ? — lecture seule.
 *
 * Si le serveur tournait encore sur l'ancien code après le rattrapage, les nouveaux matchs
 * repartiraient en clair — et, plus grave, les lectures rendraient du vide sur tout ce qui a été
 * compressé. Ce contrôle regarde les matchs les plus récemment analysés.
 *
 * Usage : npx tsx scripts/check-worker-writes-compressed.ts
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

const n = (v: unknown) => Number(v ?? 0)

async function main() {
  const recents = await prisma.$queryRaw<
    Array<{ id: string; parsedAt: Date; clair: number; compresse: number }>
  >`
    SELECT id, parsedAt,
           (memberStats IS NOT NULL OR positionSamples IS NOT NULL) AS clair,
           (memberStatsGz IS NOT NULL OR positionSamplesGz IS NOT NULL) AS compresse
    FROM SquadMatchTelemetry
    WHERE status = 'success'
    ORDER BY parsedAt DESC
    LIMIT 10
  `
  console.log('Les 10 matchs les plus récemment analysés :')
  for (const r of recents) {
    const format = n(r.clair) ? 'EN CLAIR' : n(r.compresse) ? 'compressé' : 'vide'
    console.log(`  ${r.parsedAt.toISOString().slice(0, 19).replace('T', ' ')}  ${format}`)
  }
  const enClair = recents.filter((r) => n(r.clair)).length
  console.log(
    enClair === 0
      ? '\n✔ Le code qui écrit est bien celui qui compresse.'
      : `\n✘ ${enClair} matchs récents écrits en clair : le worker tourne encore sur l’ancien code.`
  )
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
