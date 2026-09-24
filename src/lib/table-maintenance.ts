import { statfs } from 'node:fs/promises'
import { prisma } from '@/lib/prisma'

/**
 * Compactage des tables InnoDB (`OPTIMIZE TABLE`) — page /settings/superuser/database.
 *
 * Trois faits mesurés le 2026-09-24 ont dicté ce module :
 *
 * 1. **`OPTIMIZE TABLE` est une reconstruction complète**, pas un nettoyage. InnoDB écrit un
 *    nouveau `.ibd` à côté de l'ancien puis permute : il faut, le temps de l'opération, à peu près
 *    autant d'espace disque libre que la taille de la table. Sur `SquadMatchTelemetry` (20,57 Go
 *    pour 1,57 Go récupérables), l'opération demandait ~22,6 Go alors que le serveur en a ~10.
 *    Elle aurait rempli le disque d'une VM mutualisée (Dolibarr, messagerie, BIND).
 * 2. **Elle ne se découpe pas.** Aucun mode partiel, aucune reprise : la lancer par morceaux ou
 *    depuis un cron ne réduirait ni sa durée ni son besoin d'espace.
 * 3. **Elle dépasse toute requête HTTP.** Lancée depuis la page, elle rendait un 504 Nginx pendant
 *    que MariaDB continuait à travailler sans que personne ne le sache.
 *
 * D'où : un garde-fou qui refuse par défaut quand l'espace libre n'est pas vérifiable, une
 * exécution en tâche de fond dont l'état vit en base, et un verdict affiché plutôt qu'un bouton nu.
 */

export const MAINTAINABLE_TABLES = [
  'SquadMatchTelemetry',
  'EncounteredPlayer',
  'ClanEncounter',
  'Player',
  'PositionMetricCell',
  'PubgApiCallLog',
  'KillEvent',
  'CronExecution',
] as const

export const OPTIMIZE_RUN_KEY = 'table_optimize_run'

/** Marge appliquée à la taille de la table pour estimer l'espace disque nécessaire. */
export const DISK_HEADROOM_RATIO = 1.2

/** En deçà, compacter coûte une réécriture complète pour un gain négligeable. */
export const MIN_RECLAIMABLE_MB = 512

/** Au-delà, un run « running » a perdu son processus (une reconstruction bat toutes les 30 s). */
export const OPTIMIZE_RUN_STALE_MS = 5 * 60 * 1000

export type TableSizes = {
  tableName: string
  rowCount: number
  dataSizeMb: number
  indexSizeMb: number
  totalSizeMb: number
  /** Espace libre *dans* le fichier : exactement ce qu'un compactage rendrait au disque. */
  dataFreeMb: number
}

export type DiskSpace = {
  /** `false` quand la base n'est pas sur cette machine : on ne peut alors rien garantir. */
  measured: boolean
  path: string | null
  freeMb: number | null
  totalMb: number | null
  reason?: string
}

export type OptimizeVerdict =
  | 'useful'
  | 'pointless'
  | 'blocked_disk'
  | 'blocked_unknown_disk'
  | 'running'

export type OptimizeAssessment = {
  table: string
  sizes: TableSizes | null
  disk: DiskSpace
  requiredMb: number
  verdict: OptimizeVerdict
  reason: string
}

export type OptimizeRunState = {
  status: 'running' | 'done' | 'failed'
  table: string
  startedAt: string
  updatedAt: string
  finishedAt?: string
  reclaimedMb?: number
  sizeBeforeMb?: number
  sizeAfterMb?: number
  error?: string
}

export async function readTableSizes(table: string): Promise<TableSizes | null> {
  const [row] = await prisma.$queryRaw<
    Array<{
      tableName: string
      rowCount: bigint | null
      dataSizeMb: number | null
      indexSizeMb: number | null
      dataFreeMb: number | null
    }>
  >`
    SELECT TABLE_NAME AS tableName,
           TABLE_ROWS AS rowCount,
           ROUND(DATA_LENGTH / 1024 / 1024, 2) AS dataSizeMb,
           ROUND(INDEX_LENGTH / 1024 / 1024, 2) AS indexSizeMb,
           ROUND(DATA_FREE / 1024 / 1024, 2) AS dataFreeMb
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
  `
  if (!row) return null

  const dataSizeMb = Number(row.dataSizeMb ?? 0)
  const indexSizeMb = Number(row.indexSizeMb ?? 0)
  return {
    tableName: String(row.tableName),
    rowCount: Number(row.rowCount ?? 0),
    dataSizeMb,
    indexSizeMb,
    totalSizeMb: dataSizeMb + indexSizeMb,
    dataFreeMb: Number(row.dataFreeMb ?? 0),
  }
}

/**
 * Espace libre du système de fichiers qui porte les données MariaDB.
 *
 * Mesuré via le `datadir` du serveur : si ce chemin existe sur cette machine, c'est que
 * l'application et la base partagent le même hôte (le cas en production) et la mesure vaut.
 * Sinon — poste de développement pointant sur une base distante — on ne mesure rien plutôt que de
 * mesurer le mauvais disque.
 */
export async function readDiskSpace(): Promise<DiskSpace> {
  let datadir: string | null = null
  try {
    const [row] = await prisma.$queryRaw<Array<{ v: string }>>`
      SELECT VARIABLE_VALUE AS v FROM information_schema.GLOBAL_VARIABLES
      WHERE VARIABLE_NAME = 'datadir'
    `
    datadir = row?.v ?? null
  } catch {
    datadir = null
  }

  if (!datadir) {
    return { measured: false, path: null, freeMb: null, totalMb: null, reason: 'datadir du serveur illisible' }
  }

  try {
    const stats = await statfs(datadir)
    const blockSize = Number(stats.bsize)
    return {
      measured: true,
      path: datadir,
      freeMb: Math.round((Number(stats.bavail) * blockSize) / 1024 / 1024),
      totalMb: Math.round((Number(stats.blocks) * blockSize) / 1024 / 1024),
    }
  } catch {
    return {
      measured: false,
      path: datadir,
      freeMb: null,
      totalMb: null,
      reason: `le répertoire de données (${datadir}) n'existe pas sur cette machine : la base est sur un autre hôte`,
    }
  }
}

function describe(verdict: OptimizeVerdict, sizes: TableSizes | null, disk: DiskSpace, requiredMb: number): string {
  const go = (mb: number) => `${(mb / 1024).toFixed(2)} Go`
  switch (verdict) {
    case 'running':
      return 'Un compactage est déjà en cours sur cette base.'
    case 'blocked_unknown_disk':
      return `Espace disque non vérifiable (${disk.reason}). Le compactage reconstruit la table entière : sans cette garantie, il pourrait remplir le disque du serveur.`
    case 'blocked_disk':
      return `Espace disque insuffisant : ${go(disk.freeMb ?? 0)} libres pour ${go(requiredMb)} nécessaires. Le compactage réécrit la table entière avant de remplacer l'ancien fichier.`
    case 'pointless':
      return `Seulement ${go(sizes?.dataFreeMb ?? 0)} à récupérer pour ${go(sizes?.totalSizeMb ?? 0)} à réécrire : le compactage ne vaut pas son coût. L'espace libre dans le fichier est de toute façon réutilisé par les écritures suivantes.`
    case 'useful':
      return `${go(sizes?.dataFreeMb ?? 0)} seraient rendus au disque. L'opération réécrit ${go(sizes?.totalSizeMb ?? 0)} et peut durer plusieurs dizaines de minutes.`
  }
}

export async function assessOptimize(table: string): Promise<OptimizeAssessment> {
  const [sizes, disk, run] = await Promise.all([
    readTableSizes(table),
    readDiskSpace(),
    readOptimizeRunForDisplay(),
  ])

  const requiredMb = Math.round((sizes?.totalSizeMb ?? 0) * DISK_HEADROOM_RATIO)

  let verdict: OptimizeVerdict
  if (run?.status === 'running') verdict = 'running'
  else if (!disk.measured || disk.freeMb === null) verdict = 'blocked_unknown_disk'
  else if (disk.freeMb < requiredMb) verdict = 'blocked_disk'
  else if ((sizes?.dataFreeMb ?? 0) < MIN_RECLAIMABLE_MB) verdict = 'pointless'
  else verdict = 'useful'

  return { table, sizes, disk, requiredMb, verdict, reason: describe(verdict, sizes, disk, requiredMb) }
}

export async function readOptimizeRun(): Promise<OptimizeRunState | null> {
  const row = await prisma.appConfig.findUnique({ where: { key: OPTIMIZE_RUN_KEY } })
  if (!row?.value) return null
  try {
    return JSON.parse(row.value) as OptimizeRunState
  } catch {
    console.error('[table-maintenance] état de compactage illisible dans AppConfig')
    return null
  }
}

async function writeOptimizeRun(state: OptimizeRunState): Promise<void> {
  const value = JSON.stringify(state)
  await prisma.appConfig.upsert({
    where: { key: OPTIMIZE_RUN_KEY },
    update: { value },
    create: { key: OPTIMIZE_RUN_KEY, value },
  })
}

export function isOptimizeRunStale(state: OptimizeRunState, now: Date = new Date()): boolean {
  if (state.status !== 'running') return false
  return now.getTime() - new Date(state.updatedAt).getTime() > OPTIMIZE_RUN_STALE_MS
}

/**
 * Un compactage dont le battement de cœur s'est tu n'a pas forcément échoué : MariaDB peut très
 * bien continuer sans nous. On le dit plutôt que d'afficher une progression figée.
 */
export async function readOptimizeRunForDisplay(now: Date = new Date()): Promise<OptimizeRunState | null> {
  const state = await readOptimizeRun()
  if (!state || !isOptimizeRunStale(state, now)) return state
  return {
    ...state,
    status: 'failed',
    error:
      'Suivi perdu : le processus qui pilotait le compactage s’est arrêté. MariaDB peut encore être en train de travailler — vérifiez la taille de la table avant de relancer.',
    finishedAt: state.updatedAt,
  }
}

async function runOptimize(table: string, sizeBeforeMb: number, startedAt: string): Promise<void> {
  // La reconstruction est une seule requête, sans étape intermédiaire : le battement de cœur est
  // porté par un minuteur, sinon l'état paraîtrait orphelin au bout de cinq minutes.
  const heartbeat = setInterval(() => {
    void writeOptimizeRun({
      status: 'running',
      table,
      startedAt,
      updatedAt: new Date().toISOString(),
      sizeBeforeMb,
    }).catch(() => {})
  }, 30_000)

  try {
    await prisma.$queryRawUnsafe(`OPTIMIZE TABLE \`${table}\``)
    const after = await readTableSizes(table)
    const sizeAfterMb = after?.totalSizeMb ?? sizeBeforeMb
    await writeOptimizeRun({
      status: 'done',
      table,
      startedAt,
      updatedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      sizeBeforeMb,
      sizeAfterMb,
      reclaimedMb: Math.max(0, Math.round(sizeBeforeMb - sizeAfterMb)),
    })
    console.info(`[table-maintenance] ${table} compactée : ${sizeBeforeMb} Mo -> ${sizeAfterMb} Mo`)
  } catch (error) {
    console.error(`[table-maintenance] compactage de ${table} en échec`, error)
    await writeOptimizeRun({
      status: 'failed',
      table,
      startedAt,
      updatedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      sizeBeforeMb,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }).catch(() => {})
  } finally {
    clearInterval(heartbeat)
  }
}

export type StartOptimizeResult =
  | { started: true; state: OptimizeRunState }
  | { started: false; assessment: OptimizeAssessment }

/**
 * Démarre le compactage **si et seulement si** le verdict l'autorise, puis rend la main : la
 * reconstruction survit à la réponse HTTP, qui ne l'attend donc plus (fini les 504).
 */
export async function startOptimizeRun(table: string, options?: { force?: boolean }): Promise<StartOptimizeResult> {
  const assessment = await assessOptimize(table)

  // `force` autorise un compactage jugé inutile, jamais un compactage jugé dangereux.
  const autorise =
    assessment.verdict === 'useful' || (options?.force === true && assessment.verdict === 'pointless')
  if (!autorise) return { started: false, assessment }

  const startedAt = new Date().toISOString()
  const sizeBeforeMb = assessment.sizes?.totalSizeMb ?? 0
  const state: OptimizeRunState = {
    status: 'running',
    table,
    startedAt,
    updatedAt: startedAt,
    sizeBeforeMb,
  }
  await writeOptimizeRun(state)

  void runOptimize(table, sizeBeforeMb, startedAt)

  return { started: true, state }
}

/** `ANALYZE TABLE` ne reconstruit rien : il échantillonne les index. Il reste synchrone. */
export async function analyzeTable(table: string): Promise<TableSizes | null> {
  await prisma.$executeRawUnsafe(`ANALYZE TABLE \`${table}\``)
  return readTableSizes(table)
}
