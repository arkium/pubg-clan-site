/**
 * Faisabilité d'un `OPTIMIZE TABLE` — lecture seule.
 *
 * Un OPTIMIZE sur InnoDB est une **reconstruction complète** : MariaDB écrit un nouveau fichier
 * `.ibd` à côté de l'ancien puis permute. Il faut donc, le temps de l'opération, à peu près autant
 * d'espace disque libre que la taille de la table. Ce script montre ce qu'il y a à récupérer
 * (`DATA_FREE`) et si une reconstruction est en cours.
 *
 * Usage : npx tsx scripts/check-optimize-feasibility.ts [table=SquadMatchTelemetry]
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'

const n = (v: unknown) => Number(v ?? 0)
const go = (mo: number) => `${(mo / 1024).toFixed(2)} Go`

async function main() {
  const table = process.argv[2] || 'SquadMatchTelemetry'

  const rows = await prisma.$queryRaw<
    Array<{ tableName: string; rowsApprox: bigint; dataMb: number; indexMb: number; freeMb: number }>
  >`
    SELECT TABLE_NAME AS tableName, TABLE_ROWS AS rowsApprox,
           ROUND(DATA_LENGTH/1024/1024, 1) AS dataMb,
           ROUND(INDEX_LENGTH/1024/1024, 1) AS indexMb,
           ROUND(DATA_FREE/1024/1024, 1) AS freeMb
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY DATA_LENGTH DESC
    LIMIT 8
  `

  console.log('=== Tables les plus lourdes ===')
  console.log('table                     |    données |    index | libre interne')
  for (const r of rows) {
    console.log(
      `${String(r.tableName).padEnd(25)} | ${go(n(r.dataMb)).padStart(10)} | ${go(n(r.indexMb)).padStart(8)} | ${go(n(r.freeMb)).padStart(12)}`
    )
  }

  const cible = rows.find((r) => r.tableName === table)
  if (cible) {
    const total = n(cible.dataMb) + n(cible.indexMb)
    console.log(`\n=== ${table} ===`)
    console.log(`Taille totale                     : ${go(total)}`)
    console.log(`Espace libre DANS le fichier      : ${go(n(cible.freeMb))}  <= ce qu'un OPTIMIZE rendrait`)
    console.log(`Espace disque requis pendant l'op : ~${go(total * 1.1)} (nouveau fichier + ancien)`)
    if (n(cible.freeMb) < 1024) {
      console.log(`\n>> DATA_FREE est négligeable : un OPTIMIZE ne rendrait quasiment rien au disque.`)
    }
  }

  const [buffer] = await prisma.$queryRaw<Array<{ v: string }>>`
    SELECT VARIABLE_VALUE AS v FROM information_schema.GLOBAL_VARIABLES
    WHERE VARIABLE_NAME = 'innodb_buffer_pool_size'
  `
  console.log(`\ninnodb_buffer_pool_size : ${go(n(buffer?.v) / 1024 / 1024)}`)

  const process_list = await prisma.$queryRaw<
    Array<{ id: bigint; user: string; time: number; state: string | null; info: string | null }>
  >`
    SELECT ID AS id, USER AS user, TIME AS time, STATE AS state, LEFT(INFO, 120) AS info
    FROM information_schema.PROCESSLIST
    WHERE INFO IS NOT NULL AND COMMAND <> 'Sleep'
    ORDER BY TIME DESC
  `
  console.log(`\n=== Requêtes en cours (${process_list.length}) ===`)
  for (const p of process_list) {
    console.log(`  #${p.id} ${p.user} ${p.time}s [${p.state ?? '-'}] ${p.info ?? ''}`)
  }
  const rebuild = process_list.find((p) => /optimize|alter table/i.test(p.info ?? ''))
  console.log(
    rebuild
      ? `\n>> Une reconstruction est EN COURS depuis ${rebuild.time}s — ne rien lancer d'autre.`
      : '\n>> Aucune reconstruction en cours.'
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
