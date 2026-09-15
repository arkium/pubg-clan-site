/**
 * Santé de la base MariaDB — mesurer avant d'indexer.
 *
 * ⚠️ DATABASE_URL vise la base de PRODUCTION. Les commandes `enable`, `disable` et
 * `reset-log` modifient des variables GLOBALES du serveur (réversibles, non persistées :
 * un redémarrage de MariaDB les ramène à la configuration du my.cnf) et exigent `--yes`.
 * `status` et `report` sont en lecture seule.
 *
 * Usage :
 *   npx tsx scripts/db-health.ts status
 *   npx tsx scripts/db-health.ts enable --yes [--long-query-time=2]
 *   npx tsx scripts/db-health.ts report [--days=7] [--top=15]
 *   npx tsx scripts/db-health.ts disable --yes
 *   npx tsx scripts/db-health.ts reset-log --yes      # vide mysql.slow_log après analyse
 *
 * Procédure et interprétation : docs/ops/database-performance.md
 */
import { prisma } from '../src/lib/prisma'

type Row = Record<string, unknown>

const args = process.argv.slice(2)
const command = args.find((arg) => !arg.startsWith('--')) ?? 'status'
const flag = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
const confirmed = args.includes('--yes')

const num = (value: unknown) => (typeof value === 'bigint' ? Number(value) : Number(value ?? 0))
const mb = (bytes: number) => `${Math.round(bytes / 1048576).toLocaleString('fr-FR')} Mo`

async function variables(names: string[]) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SHOW GLOBAL VARIABLES WHERE Variable_name IN (${names.map(() => '?').join(',')})`,
    ...names
  )
  return Object.fromEntries(rows.map((row) => [String(row.Variable_name), String(row.Value)]))
}

async function globalStatus(names: string[]) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SHOW GLOBAL STATUS WHERE Variable_name IN (${names.map(() => '?').join(',')})`,
    ...names
  )
  return Object.fromEntries(rows.map((row) => [String(row.Variable_name), num(row.Value)]))
}

async function status() {
  const vars = await variables([
    'version',
    'slow_query_log',
    'long_query_time',
    'log_output',
    'general_log',
    'userstat',
    'performance_schema',
    'innodb_buffer_pool_size',
  ])
  const counters = await globalStatus([
    'Uptime',
    'Questions',
    'Slow_queries',
    'Select_scan',
    'Select_full_join',
    'Created_tmp_tables',
    'Created_tmp_disk_tables',
    'Innodb_buffer_pool_reads',
    'Innodb_buffer_pool_read_requests',
  ])

  const uptimeDays = counters.Uptime / 86400
  const diskReadRatio = counters.Innodb_buffer_pool_read_requests
    ? (counters.Innodb_buffer_pool_reads / counters.Innodb_buffer_pool_read_requests) * 100
    : 0

  console.log('=== Serveur ===')
  console.log(`MariaDB ${vars.version}, uptime ${uptimeDays.toFixed(1)} j`)
  console.log(`innodb_buffer_pool_size : ${mb(num(vars.innodb_buffer_pool_size))}`)
  console.log(`Mesures : slow_query_log=${vars.slow_query_log} (seuil ${vars.long_query_time} s, sortie ${vars.log_output}), userstat=${vars.userstat}, performance_schema=${vars.performance_schema}`)

  console.log('\n=== Compteurs depuis le démarrage ===')
  console.log(`Requêtes lentes (> seuil de chaque session) : ${counters.Slow_queries} (${(counters.Slow_queries / Math.max(uptimeDays, 0.01)).toFixed(0)} / jour)`)
  console.log(`Parcours complets de table : ${counters.Select_scan} sur ${counters.Questions} requêtes`)
  console.log(`Tables temporaires sur disque : ${counters.Created_tmp_disk_tables} / ${counters.Created_tmp_tables}`)
  console.log(`Lectures buffer pool servies depuis le disque : ${diskReadRatio.toFixed(2)} % (${counters.Innodb_buffer_pool_reads} lectures)`)

  const tables = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT table_name AS name, table_rows AS row_count, data_length AS data, index_length AS idx
     FROM information_schema.tables WHERE table_schema = DATABASE()
     ORDER BY data_length + index_length DESC LIMIT 12`
  )
  console.log('\n=== Plus grosses tables ===')
  for (const table of tables) {
    const data = num(table.data)
    const idx = num(table.idx)
    const ratio = data > 0 ? ` (index = ${(idx / data).toFixed(1)} × données)` : ''
    console.log(`${String(table.name).padEnd(34)} ${String(num(table.row_count)).padStart(10)} lignes  données ${mb(data).padStart(10)}  index ${mb(idx).padStart(9)}${ratio}`)
  }

  if (vars.log_output?.includes('TABLE')) {
    const [slowRows] = await prisma.$queryRawUnsafe<Row[]>(`SELECT COUNT(*) AS n, MIN(start_time) AS oldest FROM mysql.slow_log`)
    console.log(`\nmysql.slow_log : ${num(slowRows.n)} requêtes enregistrées depuis ${slowRows.oldest ?? '—'}`)
  }
}

async function enable() {
  const longQueryTime = Number(flag('long-query-time') ?? 2)
  const before = await variables(['slow_query_log', 'long_query_time', 'log_output', 'general_log', 'userstat'])

  if (before.general_log === 'ON') {
    throw new Error("general_log est actif : passer log_output à TABLE redirigerait aussi ce journal. Abandon.")
  }

  console.log('Valeurs actuelles (à restaurer avec `disable`) :', before)
  if (!confirmed) {
    console.log('\nAucune modification : relancer avec --yes pour appliquer.')
    return
  }

  await prisma.$executeRawUnsafe(`SET GLOBAL log_output = 'TABLE'`)
  await prisma.$executeRawUnsafe(`SET GLOBAL long_query_time = ${longQueryTime}`)
  await prisma.$executeRawUnsafe(`SET GLOBAL slow_query_log = ON`)
  await prisma.$executeRawUnsafe(`SET GLOBAL userstat = ON`)

  console.log('\nMesures activées :', await variables(['slow_query_log', 'long_query_time', 'log_output', 'userstat']))
  console.log(
    `\n⚠️ long_query_time est copié à l'ouverture de chaque connexion : les connexions déjà ouvertes (pool Prisma des\n` +
      `applications en cours) gardent l'ancien seuil jusqu'à leur renouvellement ou au redémarrage de l'application.`
  )
}

async function disable() {
  if (!confirmed) {
    console.log('Aucune modification : relancer avec --yes pour désactiver les mesures.')
    return
  }
  await prisma.$executeRawUnsafe(`SET GLOBAL slow_query_log = OFF`)
  await prisma.$executeRawUnsafe(`SET GLOBAL userstat = OFF`)
  await prisma.$executeRawUnsafe(`SET GLOBAL long_query_time = 10`)
  await prisma.$executeRawUnsafe(`SET GLOBAL log_output = 'FILE'`)
  console.log('Mesures désactivées :', await variables(['slow_query_log', 'long_query_time', 'log_output', 'userstat']))
}

/** Remplace les littéraux pour regrouper les requêtes identiques à leurs paramètres près. */
function normalizeSql(sql: string) {
  return sql
    .replace(/\s+/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, '?')
    .replace(/\b\d+(\.\d+)?\b/g, '?')
    .replace(/\((?:\s*\?\s*,)+\s*\?\s*\)/g, '(?…)')
    .trim()
    .slice(0, 220)
}

async function report() {
  const days = Number(flag('days') ?? 7)
  const top = Number(flag('top') ?? 15)

  const slowRows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT start_time, TIME_TO_SEC(query_time) AS query_s, rows_examined, rows_sent, db, sql_text
     FROM mysql.slow_log WHERE start_time > NOW() - INTERVAL ? DAY ORDER BY start_time DESC LIMIT 20000`,
    days
  )

  type Digest = { sql: string; count: number; totalS: number; maxS: number; rowsExamined: number }
  const digests = new Map<string, Digest>()
  for (const row of slowRows) {
    const raw = row.sql_text instanceof Uint8Array ? Buffer.from(row.sql_text).toString('utf8') : String(row.sql_text ?? '')
    const sql = normalizeSql(raw)
    const entry = digests.get(sql) ?? { sql, count: 0, totalS: 0, maxS: 0, rowsExamined: 0 }
    const seconds = num(row.query_s)
    entry.count += 1
    entry.totalS += seconds
    entry.maxS = Math.max(entry.maxS, seconds)
    entry.rowsExamined += num(row.rows_examined)
    digests.set(sql, entry)
  }

  console.log(`=== Requêtes lentes (${slowRows.length} sur ${days} j), triées par temps total ===`)
  for (const digest of [...digests.values()].sort((left, right) => right.totalS - left.totalS).slice(0, top)) {
    console.log(
      `\n${digest.count} × | total ${digest.totalS.toFixed(0)} s | max ${digest.maxS.toFixed(1)} s | lignes examinées moy. ${Math.round(digest.rowsExamined / digest.count).toLocaleString('fr-FR')}\n  ${digest.sql}`
    )
  }

  const indexes = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT s.TABLE_NAME AS table_name, s.INDEX_NAME AS index_name,
            GROUP_CONCAT(s.COLUMN_NAME ORDER BY s.SEQ_IN_INDEX) AS columns_list,
            MAX(s.NON_UNIQUE) AS non_unique,
            COALESCE(MAX(i.ROWS_READ), 0) AS rows_read,
            COALESCE(MAX(z.stat_value), 0) * @@innodb_page_size AS size_bytes
     FROM information_schema.STATISTICS s
     LEFT JOIN information_schema.INDEX_STATISTICS i
       ON i.TABLE_SCHEMA = s.TABLE_SCHEMA AND i.TABLE_NAME = s.TABLE_NAME AND i.INDEX_NAME = s.INDEX_NAME
     LEFT JOIN mysql.innodb_index_stats z
       ON z.database_name = s.TABLE_SCHEMA AND z.table_name = s.TABLE_NAME AND z.index_name = s.INDEX_NAME AND z.stat_name = 'size'
     WHERE s.TABLE_SCHEMA = DATABASE()
     GROUP BY s.TABLE_NAME, s.INDEX_NAME
     ORDER BY size_bytes DESC`
  )

  console.log('\n=== Index jamais lus depuis l’activation de userstat (hors clés primaires et contraintes uniques) ===')
  console.log('   Un index peut servir rarement (cron hebdomadaire, page SuperUser) : ne décider qu’après une période représentative.')
  // Prisma nomme `<Modèle>_<champ>_fkey` l'index qui porte une clé étrangère : InnoDB l'exige,
  // il ne peut pas être supprimé tant que la relation existe.
  const isForeignKeyIndex = (index: Row) => String(index.index_name).endsWith('_fkey')
  const unused = indexes.filter((index) => num(index.rows_read) === 0 && index.index_name !== 'PRIMARY' && num(index.non_unique) === 1)
  for (const index of unused.slice(0, 40)) {
    const note = isForeignKeyIndex(index) ? '  [clé étrangère : non supprimable]' : ''
    console.log(`  ${String(index.table_name).padEnd(30)} ${String(index.index_name).padEnd(55)} ${mb(num(index.size_bytes)).padStart(9)}  (${index.columns_list})${note}`)
  }
  const droppable = unused.filter((index) => !isForeignKeyIndex(index))
  console.log(
    `  → ${droppable.length} index candidats hors clés étrangères, ${mb(droppable.reduce((sum, index) => sum + num(index.size_bytes), 0))} au total`
  )

  const tables = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT TABLE_NAME AS table_name, ROWS_READ AS rows_read, ROWS_CHANGED AS rows_changed
     FROM information_schema.TABLE_STATISTICS WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY ROWS_READ DESC LIMIT 12`
  )
  console.log('\n=== Tables les plus lues depuis l’activation de userstat ===')
  for (const table of tables) {
    console.log(`  ${String(table.table_name).padEnd(34)} lues ${num(table.rows_read).toLocaleString('fr-FR').padStart(16)}  modifiées ${num(table.rows_changed).toLocaleString('fr-FR').padStart(12)}`)
  }
}

async function resetLog() {
  if (!confirmed) {
    console.log('Aucune modification : relancer avec --yes pour vider mysql.slow_log.')
    return
  }
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE mysql.slow_log`)
  console.log('mysql.slow_log vidée.')
}

const commands: Record<string, () => Promise<void>> = { status, enable, disable, report, 'reset-log': resetLog }

async function main() {
  const run = commands[command]
  if (!run) {
    console.error(`Commande inconnue « ${command} ». Commandes : ${Object.keys(commands).join(', ')}`)
    process.exitCode = 1
    return
  }
  await run()
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
