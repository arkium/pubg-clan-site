/**
 * Faisabilité d'une compression applicative de la télémétrie.
 *
 * 1. Vérifie qu'ajouter une colonne `LONGBLOB` est bien une opération **INSTANT** sous MariaDB
 *    (métadonnées seules, sans reconstruction) — c'est ce qui permettrait de compresser sans
 *    jamais se heurter au mur d'espace disque de l'`OPTIMIZE`. Le test se fait sur une table
 *    jetable créée puis supprimée : `SquadMatchTelemetry` n'est pas touchée.
 * 2. Chronomètre compression et décompression sur une charge réelle, pour savoir ce que coûterait
 *    un affichage de replay.
 *
 * Usage : npx tsx scripts/check-compression-feasibility.ts
 */
import 'dotenv/config'

import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync, constants } from 'node:zlib'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'

const TABLE_TEST = '_claude_instant_add_test'
const ko = (o: number) => `${(o / 1024).toFixed(0)} Ko`

async function testerInstantAddColumn() {
  console.log('=== 1. ADD COLUMN LONGBLOB est-il INSTANT ? (table jetable) ===')
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${TABLE_TEST}\``)
  await prisma.$executeRawUnsafe(
    `CREATE TABLE \`${TABLE_TEST}\` (id INT PRIMARY KEY, payload LONGTEXT) ROW_FORMAT=DYNAMIC`
  )
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${TABLE_TEST}\` ADD COLUMN payloadGz LONGBLOB NULL, ALGORITHM=INSTANT`
    )
    console.log('  ✔ ALGORITHM=INSTANT accepté : ajout en métadonnées seules, aucune reconstruction.')
  } catch (error) {
    console.log(`  ✘ refusé : ${error instanceof Error ? error.message : error}`)
    console.log('    (une reconstruction serait nécessaire — même mur de disque que OPTIMIZE)')
  } finally {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${TABLE_TEST}\``)
    console.log(`  Table de test supprimée.`)
  }
}

async function mesurerCodecs() {
  console.log('\n=== 2. Coût CPU sur une charge réelle ===')
  const [row] = await prisma.$queryRaw<Array<{ positionSamples: string; trajectorySegments: string | null }>>(
    Prisma.sql`
      SELECT CAST(positionSamples AS CHAR) AS positionSamples,
             CAST(trajectorySegments AS CHAR) AS trajectorySegments
      FROM SquadMatchTelemetry
      WHERE positionSamples IS NOT NULL
      ORDER BY parsedAt DESC
      LIMIT 1
    `
  )
  if (!row?.positionSamples) {
    console.log('  Aucun match avec géolocalisation.')
    return
  }

  const brut = Buffer.from(row.positionSamples + (row.trajectorySegments ?? ''), 'utf8')
  console.log(`  Charge brute : ${ko(brut.length)}`)

  for (const [nom, compresser, decompresser] of [
    ['gzip 6', (b: Buffer) => gzipSync(b, { level: 6 }), (b: Buffer) => gunzipSync(b)],
    [
      'brotli 5',
      (b: Buffer) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
      (b: Buffer) => brotliDecompressSync(b),
    ],
  ] as const) {
    const t0 = Date.now()
    const compresse = compresser(brut)
    const tCompress = Date.now() - t0

    const t1 = Date.now()
    const restaure = decompresser(compresse)
    const tDecompress = Date.now() - t1

    const identique = restaure.equals(brut)
    console.log(
      `  ${nom.padEnd(9)} : ${ko(compresse.length).padStart(8)} (${(brut.length / compresse.length).toFixed(1)}x) | ` +
        `compression ${String(tCompress).padStart(4)} ms | décompression ${String(tDecompress).padStart(3)} ms | ` +
        `restitution ${identique ? 'exacte' : 'ALTÉRÉE'}`
    )
  }

  console.log('\n  La compression est payée une fois, par le worker, à l’écriture du match.')
  console.log('  La décompression est payée à chaque affichage de replay ou de débriefing.')
}

async function main() {
  await testerInstantAddColumn()
  await mesurerCodecs()
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
