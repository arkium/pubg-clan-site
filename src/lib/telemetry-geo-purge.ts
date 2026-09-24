import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Purge de l'historique de géolocalisation (`SquadMatchTelemetry.positionSamples` et
 * `.trajectorySegments`) — logique partagée par la page SuperUser, la route API et le cron.
 *
 * Trois contraintes ont façonné ce module, toutes mesurées en production le 2026-09-23
 * (détail dans `docs/TODO/todo.md`, Administration, Lot 2) :
 *
 * 1. **Compter coûte 247 s.** `positionSamples IS NOT NULL` place la colonne dans le read set :
 *    InnoDB va chercher les pages externes du blob et lit les ~22 Go de la table. Aucun index ne
 *    peut aider. Le comptage est donc fait UNE fois par nuit, pour TOUS les seuils à la fois
 *    (une seule passe suffit), et le résultat est servi depuis `AppConfig`.
 * 2. **La borne est figée à minuit.** Comptage et purge partageaient chacun leur propre `NOW()`,
 *    d'où un écart constaté entre le nombre annoncé et le nombre réellement purgé. La borne est
 *    désormais « minuit moins N jours » : stable toute la journée, la journée en cours n'entre
 *    jamais dans la cible, et la purge applique exactement la borne annoncée.
 * 3. **La purge s'exécute côté serveur.** Elle était pilotée par le navigateur (une requête par
 *    lot) : quitter la page l'interrompait. L'état vit maintenant en base, la page ne fait que
 *    le lire — on peut fermer l'onglet sans rien casser.
 */

/** Seuils proposés par l'interface, en jours. `'all'` purge sans condition d'ancienneté. */
export const GEO_PURGE_THRESHOLDS = [7, 14, 30, 60, 90] as const
export type GeoPurgeThreshold = (typeof GEO_PURGE_THRESHOLDS)[number]
export type GeoPurgeSelection = GeoPurgeThreshold | 'all'

export const GEO_PURGE_COUNTS_KEY = 'telemetry_geo_purge_counts'
export const GEO_PURGE_RUN_KEY = 'telemetry_geo_purge_run'

/** Taille d'un lot : ~7 s de sélection et ~11 s d'écriture, mesurées. */
export const GEO_PURGE_BATCH_SIZE = 250

/**
 * Un run dont le battement de cœur date de plus de 10 min a perdu son processus (déploiement,
 * redémarrage). Le plus long lot observé — celui qui parcourt la table sans trouver de candidat —
 * tient en ~3 min : la marge est large.
 */
export const GEO_PURGE_RUN_STALE_MS = 10 * 60 * 1000

/**
 * Matchs soustraits à la purge, à la demande de l'exploitant :
 *  - **Top 1** (`placement = 1`) : les victoires sont les replays qu'on rejoue.
 *  - **Matchs personnalisés** (`matchType = 'custom'`) : support des tournois. On protège tous les
 *    customs, pas seulement ceux d'un tournoi existant, parce qu'un tournoi se déclare *après* les
 *    parties : il sélectionne les customs d'une fenêtre de dates (`getTournamentMatches`). Purger
 *    un custom parce qu'aucun tournoi ne le réclame encore interdirait de créer ce tournoi ensuite.
 */
const PROTECTED = Prisma.sql`(m.placement = 1 OR m.matchType = 'custom')`
/** Les deux formats de stockage coexistent le temps du rattrapage : les quatre colonnes comptent. */
const HAS_GEO = Prisma.sql`(t.positionSamples IS NOT NULL OR t.trajectorySegments IS NOT NULL
  OR t.positionSamplesGz IS NOT NULL OR t.trajectorySegmentsGz IS NOT NULL)`
/** Date de référence d'une ligne : la génération du fichier PUBG, à 31 min près de la date de match. */
const ROW_DATE = Prisma.sql`COALESCE(t.sourceGeneratedAt, t.parsedAt, t.createdAt)`

export type GeoPurgeThresholdCount = {
  /** Borne appliquée (ISO), `null` pour « tous les matchs ». */
  cutoff: string | null
  /** Matchs porteurs de géoloc plus anciens que la borne, protections comprises. */
  targeted: number
  /** Parmi eux, ceux que les protections mettent hors d'atteinte. */
  protectedMatches: number
  /** Ce que la purge retirerait réellement. */
  purgeable: number
}

export type GeoPurgeCounts = {
  computedAt: string
  durationMs: number
  /** Lignes de `SquadMatchTelemetry`, toutes confondues. */
  totalRows: number
  /** Lignes portant encore une géolocalisation. */
  totalWithGeo: number
  /** Protégées sur l'ensemble de la base, indépendamment du seuil. */
  protectedMatches: number
  byThreshold: Record<string, GeoPurgeThresholdCount>
}

export type GeoPurgeRunState = {
  status: 'running' | 'done' | 'cancelled' | 'failed'
  olderThanDays: GeoPurgeSelection
  cutoff: string | null
  target: number
  purged: number
  startedAt: string
  /** Battement de cœur : réécrit à chaque lot, sert à détecter un run orphelin. */
  updatedAt: string
  finishedAt?: string
  error?: string
  cancelRequested?: boolean
}

/**
 * Borne d'ancienneté figée au dernier minuit : le résultat ne bouge pas de la journée et la
 * journée en cours n'est jamais purgée.
 *
 * Minuit du fuseau du processus (UTC en production, heure locale en développement). La borne est
 * donc plus conservatrice que l'ancien « maintenant moins N jours » — de quelques heures, jamais
 * l'inverse : aucun match n'est purgé plus tôt qu'avant.
 */
export function resolveCutoff(selection: GeoPurgeSelection, now: Date = new Date()): Date | null {
  if (selection === 'all') return null
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  midnight.setDate(midnight.getDate() - selection)
  return midnight
}

export function parseSelection(raw: string | number | null | undefined): GeoPurgeSelection {
  if (raw === 'all' || raw === '0' || raw === 0) return 'all'
  const parsed = Number(raw)
  const match = GEO_PURGE_THRESHOLDS.find((d) => d === parsed)
  return match ?? 14
}

// --------------------------------------------------------------------------------------------
// Comptage — une seule passe pour tous les seuils
// --------------------------------------------------------------------------------------------

type CountRow = Record<string, bigint | number | null>

/**
 * Compte, en UN seul parcours, ce que chaque seuil purgerait. Coûte ~247 s : réservé au cron et
 * au recomptage explicite, jamais au rendu d'une page.
 */
export async function computeGeoPurgeCounts(now: Date = new Date()): Promise<GeoPurgeCounts> {
  const startedAt = Date.now()
  const cutoffs = GEO_PURGE_THRESHOLDS.map((days) => ({ days, cutoff: resolveCutoff(days, now)! }))

  const perThreshold = cutoffs.flatMap(({ days, cutoff }) => [
    Prisma.sql`SUM(${ROW_DATE} < ${cutoff}) AS t${Prisma.raw(String(days))}`,
    Prisma.sql`SUM(${ROW_DATE} < ${cutoff} AND ${PROTECTED}) AS p${Prisma.raw(String(days))}`,
  ])

  const [row] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS withGeo,
           SUM(${PROTECTED}) AS protectedAll,
           ${Prisma.join(perThreshold, ', ')}
    FROM SquadMatchTelemetry t
    JOIN SquadMatch m ON m.id = t.squadMatchId
    WHERE ${HAS_GEO}
  `

  const totalRowsRes = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*) AS total FROM SquadMatchTelemetry
  `

  const num = (value: unknown) => Number(value ?? 0)
  const totalWithGeo = num(row?.withGeo)
  const protectedAll = num(row?.protectedAll)

  const byThreshold: Record<string, GeoPurgeThresholdCount> = {}
  for (const { days, cutoff } of cutoffs) {
    const targeted = num(row?.[`t${days}`])
    const protectedMatches = num(row?.[`p${days}`])
    byThreshold[String(days)] = {
      cutoff: cutoff.toISOString(),
      targeted,
      protectedMatches,
      purgeable: Math.max(0, targeted - protectedMatches),
    }
  }
  byThreshold.all = {
    cutoff: null,
    targeted: totalWithGeo,
    protectedMatches: protectedAll,
    purgeable: Math.max(0, totalWithGeo - protectedAll),
  }

  return {
    computedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totalRows: Number(totalRowsRes[0]?.total ?? 0),
    totalWithGeo,
    protectedMatches: protectedAll,
    byThreshold,
  }
}

export async function readGeoPurgeCounts(): Promise<GeoPurgeCounts | null> {
  const row = await prisma.appConfig.findUnique({ where: { key: GEO_PURGE_COUNTS_KEY } })
  if (!row?.value) return null
  try {
    return JSON.parse(row.value) as GeoPurgeCounts
  } catch {
    // Une valeur illisible ne doit pas casser la page : on la traite comme « jamais calculé ».
    console.error('[geo-purge] snapshot de comptage illisible dans AppConfig')
    return null
  }
}

export async function writeGeoPurgeCounts(counts: GeoPurgeCounts): Promise<void> {
  const value = JSON.stringify(counts)
  await prisma.appConfig.upsert({
    where: { key: GEO_PURGE_COUNTS_KEY },
    update: { value },
    create: { key: GEO_PURGE_COUNTS_KEY, value },
  })
}

/** Point d'entrée du cron : recompte tout et publie le résultat. */
export async function refreshGeoPurgeCounts(now: Date = new Date()): Promise<GeoPurgeCounts> {
  const counts = await computeGeoPurgeCounts(now)
  await writeGeoPurgeCounts(counts)
  return counts
}

// --------------------------------------------------------------------------------------------
// Purge — exécution côté serveur, état en base
// --------------------------------------------------------------------------------------------

export async function selectPurgeBatch(cutoff: Date | null, batchSize: number): Promise<string[]> {
  const ageCondition = cutoff ? Prisma.sql`AND ${ROW_DATE} < ${cutoff}` : Prisma.empty
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT t.id FROM SquadMatchTelemetry t
    JOIN SquadMatch m ON m.id = t.squadMatchId
    WHERE ${HAS_GEO} AND NOT ${PROTECTED} ${ageCondition}
    LIMIT ${batchSize}
  `
  return rows.map((row) => row.id)
}

export async function purgeBatch(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  return prisma.$executeRaw`
    UPDATE SquadMatchTelemetry
    SET positionSamples = NULL, trajectorySegments = NULL,
        positionSamplesGz = NULL, trajectorySegmentsGz = NULL
    WHERE id IN (${Prisma.join(ids)})
  `
}

export async function readGeoPurgeRun(): Promise<GeoPurgeRunState | null> {
  const row = await prisma.appConfig.findUnique({ where: { key: GEO_PURGE_RUN_KEY } })
  if (!row?.value) return null
  try {
    return JSON.parse(row.value) as GeoPurgeRunState
  } catch {
    console.error('[geo-purge] état de purge illisible dans AppConfig')
    return null
  }
}

async function writeGeoPurgeRun(state: GeoPurgeRunState): Promise<void> {
  const value = JSON.stringify(state)
  await prisma.appConfig.upsert({
    where: { key: GEO_PURGE_RUN_KEY },
    update: { value },
    create: { key: GEO_PURGE_RUN_KEY, value },
  })
}

/** Un run « running » dont le battement de cœur est trop vieux a perdu son processus. */
export function isRunStale(state: GeoPurgeRunState, now: Date = new Date()): boolean {
  if (state.status !== 'running') return false
  return now.getTime() - new Date(state.updatedAt).getTime() > GEO_PURGE_RUN_STALE_MS
}

/**
 * État tel qu'il doit être présenté : un run orphelin est requalifié en échec plutôt que
 * d'afficher une progression figée indéfiniment.
 */
export async function readGeoPurgeRunForDisplay(now: Date = new Date()): Promise<GeoPurgeRunState | null> {
  const state = await readGeoPurgeRun()
  if (!state) return null
  if (!isRunStale(state, now)) return state
  return {
    ...state,
    status: 'failed',
    error: 'Purge interrompue : le processus qui l’exécutait s’est arrêté. Relancez-la, elle reprendra où elle en est.',
    finishedAt: state.updatedAt,
  }
}

export async function requestGeoPurgeCancel(): Promise<boolean> {
  const state = await readGeoPurgeRun()
  if (!state || state.status !== 'running') return false
  await writeGeoPurgeRun({ ...state, cancelRequested: true, updatedAt: new Date().toISOString() })
  return true
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Boucle de purge. Tourne détachée de la requête HTTP qui l'a lancée : elle ne renvoie rien, elle
 * publie son avancement dans `AppConfig` à chaque lot.
 */
async function runPurgeLoop(selection: GeoPurgeSelection, cutoff: Date | null, target: number, startedAt: string) {
  let purged = 0
  try {
    for (;;) {
      const current = await readGeoPurgeRun()
      if (current?.cancelRequested) {
        await writeGeoPurgeRun({
          status: 'cancelled',
          olderThanDays: selection,
          cutoff: cutoff?.toISOString() ?? null,
          target,
          purged,
          startedAt,
          updatedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        })
        return
      }

      const ids = await selectPurgeBatch(cutoff, GEO_PURGE_BATCH_SIZE)
      if (ids.length > 0) {
        await purgeBatch(ids)
        purged += ids.length
      }

      const done = ids.length < GEO_PURGE_BATCH_SIZE
      await writeGeoPurgeRun({
        status: done ? 'done' : 'running',
        olderThanDays: selection,
        cutoff: cutoff?.toISOString() ?? null,
        target,
        purged,
        startedAt,
        updatedAt: new Date().toISOString(),
        ...(done ? { finishedAt: new Date().toISOString() } : {}),
      })

      if (done) {
        console.info(`[geo-purge] purge terminée : ${purged} matchs nettoyés (seuil ${selection})`)
        return
      }
      await sleep(250)
    }
  } catch (error) {
    console.error('[geo-purge] purge interrompue par une erreur', error)
    await writeGeoPurgeRun({
      status: 'failed',
      olderThanDays: selection,
      cutoff: cutoff?.toISOString() ?? null,
      target,
      purged,
      startedAt,
      updatedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }).catch(() => {})
  } finally {
    // Le comptage publié ne vaut plus rien après une purge : on le recalcule en arrière-plan.
    refreshGeoPurgeCounts().catch((error) => {
      console.error('[geo-purge] recomptage après purge impossible', error)
    })
  }
}

export type StartPurgeResult =
  | { started: true; state: GeoPurgeRunState }
  | { started: false; reason: 'already_running'; state: GeoPurgeRunState }

/**
 * Démarre une purge et rend la main immédiatement : la boucle survit à la réponse HTTP, donc à la
 * fermeture de l'onglet.
 */
export async function startGeoPurgeRun(
  selection: GeoPurgeSelection,
  target: number,
  now: Date = new Date()
): Promise<StartPurgeResult> {
  const existing = await readGeoPurgeRun()
  if (existing && existing.status === 'running' && !isRunStale(existing, now)) {
    return { started: false, reason: 'already_running', state: existing }
  }

  const cutoff = resolveCutoff(selection, now)
  const startedAt = now.toISOString()
  const state: GeoPurgeRunState = {
    status: 'running',
    olderThanDays: selection,
    cutoff: cutoff?.toISOString() ?? null,
    target,
    purged: 0,
    startedAt,
    updatedAt: startedAt,
  }
  await writeGeoPurgeRun(state)

  void runPurgeLoop(selection, cutoff, target, startedAt)

  return { started: true, state }
}
