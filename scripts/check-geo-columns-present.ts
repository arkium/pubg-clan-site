/** Les colonnes compressées existent-elles en base ? — lecture seule. */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

async function main() {
  const cols = await prisma.$queryRaw<Array<{ nom: string; type: string }>>`
    SELECT COLUMN_NAME AS nom, COLUMN_TYPE AS type
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SquadMatchTelemetry'
      AND COLUMN_NAME IN ('positionSamplesGz', 'trajectorySegmentsGz')
  `
  console.log('Colonnes compressées présentes :', cols.length ? cols : 'AUCUNE')

  const migrations = await prisma.$queryRaw<Array<{ nom: string; fini: Date | null; echec: number | null }>>`
    SELECT migration_name AS nom, finished_at AS fini, rolled_back_at IS NOT NULL AS echec
    FROM _prisma_migrations
    ORDER BY started_at DESC LIMIT 3
  `
  console.log('\n3 dernières migrations :')
  for (const m of migrations) console.log(`  ${m.nom} — terminée : ${m.fini ?? 'NON'}`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
