/**
 * Comment la télémétrie est-elle réellement stockée ? — lecture seule.
 * Type de colonne, format de ligne et options de compression de `SquadMatchTelemetry`.
 *
 * Usage : npx tsx scripts/check-telemetry-storage-format.ts
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'

async function main() {
  const colonnes = await prisma.$queryRaw<Array<{ nom: string; type: string; dataType: string }>>`
    SELECT COLUMN_NAME AS nom, COLUMN_TYPE AS type, DATA_TYPE AS dataType
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SquadMatchTelemetry'
      AND COLUMN_NAME IN ('positionSamples', 'trajectorySegments', 'summary')
  `
  console.log('=== Colonnes JSON ===')
  for (const c of colonnes) console.log(`  ${c.nom.padEnd(20)} ${c.type} (DATA_TYPE=${c.dataType})`)

  const [table] = await prisma.$queryRaw<Array<{ rowFormat: string; createOptions: string | null }>>`
    SELECT ROW_FORMAT AS rowFormat, CREATE_OPTIONS AS createOptions
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SquadMatchTelemetry'
  `
  console.log(`\n=== Table ===`)
  console.log(`  ROW_FORMAT     : ${table?.rowFormat}`)
  console.log(`  CREATE_OPTIONS : ${table?.createOptions || '(aucune)'}`)

  const variables = await prisma.$queryRaw<Array<{ nom: string; valeur: string }>>`
    SELECT VARIABLE_NAME AS nom, VARIABLE_VALUE AS valeur
    FROM information_schema.GLOBAL_VARIABLES
    WHERE VARIABLE_NAME IN ('innodb_compression_algorithm', 'innodb_file_per_table', 'innodb_page_size')
  `
  console.log(`\n=== Compression disponible côté serveur ===`)
  for (const v of variables) console.log(`  ${v.nom.padEnd(30)} ${v.valeur}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
