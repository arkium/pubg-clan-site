/**
 * Où part l'espace disque du serveur MariaDB ? — lecture seule.
 *
 * Les journaux binaires sont le premier suspect après une opération de masse : purge et
 * compression de la télémétrie ont réécrit ~16 Go de lignes en deux jours, et chaque modification
 * est journalisée. Un binlog sans expiration configurée conserve tout, indéfiniment.
 *
 * Usage : npx tsx scripts/check-server-disk-consumers.ts
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'

const n = (v: unknown) => Number(v ?? 0)
const go = (octets: number) => `${(octets / 1024 / 1024 / 1024).toFixed(2)} Go`

async function main() {
  const variables = await prisma.$queryRaw<Array<{ nom: string; valeur: string }>>`
    SELECT VARIABLE_NAME AS nom, VARIABLE_VALUE AS valeur
    FROM information_schema.GLOBAL_VARIABLES
    WHERE VARIABLE_NAME IN (
      'log_bin', 'expire_logs_days', 'binlog_expire_logs_seconds', 'datadir',
      'innodb_log_file_size', 'innodb_log_files_in_group', 'innodb_undo_log_truncate',
      'innodb_max_undo_log_size', 'slow_query_log', 'general_log'
    )
    ORDER BY VARIABLE_NAME
  `
  console.log('=== Réglages du serveur ===')
  for (const v of variables) console.log(`  ${v.nom.padEnd(28)} ${v.valeur}`)

  console.log('\n=== Journaux binaires ===')
  try {
    const binlogs = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>('SHOW BINARY LOGS')
    if (binlogs.length === 0) {
      console.log('  Aucun (journalisation binaire désactivée ou déjà purgée).')
    } else {
      const total = binlogs.reduce((somme, b) => somme + n(b.File_size), 0)
      console.log(`  ${binlogs.length} fichiers, ${go(total)} au total`)
      for (const b of binlogs.slice(-6)) {
        console.log(`    ${String(b.Log_name).padEnd(28)} ${go(n(b.File_size))}`)
      }
      if (binlogs.length > 6) console.log(`    … (${binlogs.length - 6} plus anciens)`)
      console.log(`\n  >> ${go(total)} récupérables immédiatement si aucune réplication ne les consomme.`)
    }
  } catch (error) {
    console.log(`  Illisible : ${error instanceof Error ? error.message.split('\n')[0] : error}`)
  }

  console.log('\n=== Poids des bases de l’instance ===')
  const bases = await prisma.$queryRaw<Array<{ base: string; octets: bigint }>>`
    SELECT TABLE_SCHEMA AS base, SUM(DATA_LENGTH + INDEX_LENGTH) AS octets
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
    GROUP BY TABLE_SCHEMA ORDER BY octets DESC
  `
  for (const b of bases) console.log(`  ${String(b.base).padEnd(24)} ${go(n(b.octets))}`)

  const [journaux] = await prisma.$queryRaw<Array<{ lignes: bigint }>>`
    SELECT COUNT(*) AS lignes FROM mysql.slow_log
  `.catch(() => [{ lignes: BigInt(0) }] as never)
  console.log(`\nmysql.slow_log : ${n(journaux?.lignes).toLocaleString()} lignes`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

