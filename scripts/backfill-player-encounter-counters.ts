/**
 * Remplit les compteurs tous clans confondus de `Player` (fin d'EncounteredPlayer, étape 2 —
 * docs/TODO/inventaire-2026-10-20.md §6) :
 *
 *   - `encounterCount`          = somme des `ClanEncounter.encounterCount` du joueur ;
 *   - `combatInteractionsCount` = somme des `EncounteredPlayer.combatInteractionsCount` du compte ;
 *   - `resolveAttempts`         = le plus grand de `Player.resolveAttempts` et des `EncounteredPlayer.resolveAttempts`.
 *
 * Depuis la migration 20261021090000, la capture, les deltas des kills et les échecs de résolution alimentent ces
 * colonnes ; ce script rattrape l'historique. Il pose des valeurs absolues : on peut le relancer sans risque. Un joueur
 * croisé pendant le passage peut garder un écart d'une unité (la somme lue précède l'écriture) ; une seconde passe le
 * corrige. Rien n'est lu par les pages avant l'étape 3.
 *
 * Coût : `EncounteredPlayer` (3,6 M lignes, sans index par compte) est lue une fois dans l'ordre de sa clé primaire,
 * par tranches ; seules ses lignes non nulles restent en mémoire. `ClanEncounter` est lue par l'index de sa clé
 * étrangère `playerId`, lot par lot de `Player`. Écritures par lots de 500 lignes, seulement celles qui changent.
 *
 * ⚠️ DATABASE_URL vise la base de PRODUCTION. Le défaut est une simulation (lecture seule). À lancer sur le serveur.
 *
 * Usage :
 *   npx tsx scripts/backfill-player-encounter-counters.ts            # simulation : comptes et exemples
 *   npx tsx scripts/backfill-player-encounter-counters.ts --apply    # écrit
 */
import { prisma } from '../src/lib/prisma'

const apply = process.argv.slice(2).includes('--apply')

const SCAN_BATCH = 10_000
const PLAYER_BATCH = 1_000
const WRITE_BATCH = 500

type PlayerRow = {
  id: string
  pubgAccountId: string
  platformShard: string
  encounterCount: number
  combatInteractionsCount: number
  resolveAttempts: number
}

type PlayerUpdate = { id: string; encounterCount: number; combatInteractionsCount: number; resolveAttempts: number }

function identityKey(pubgAccountId: string, platformShard: string) {
  return `${pubgAccountId}\u0000${platformShard}`
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ')
}

async function assertColumnsExist() {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Player'
        AND COLUMN_NAME IN ('encounterCount', 'combatInteractionsCount')`
  )
  if (rows.length < 2) {
    throw new Error(
      'Colonnes Player.encounterCount / combatInteractionsCount absentes : la migration 20261021090000 n’est pas appliquée (deploy.sh).'
    )
  }
}

/** Sommes par compte des lignes `EncounteredPlayer` non nulles (les autres ne changent rien). */
async function readEncounteredPlayerTotals() {
  const totals = new Map<string, { combat: number; attempts: number }>()
  let afterId = ''
  let scanned = 0
  let batches = 0

  for (;;) {
    // Borne de la tranche, puis lecture filtrée de la même plage : deux parcours séquentiels des mêmes pages.
    const bound = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM EncounteredPlayer WHERE id > ? ORDER BY id LIMIT 1 OFFSET ${SCAN_BATCH - 1}`,
      afterId
    )
    const upperId = bound[0]?.id ?? null
    const rows = await prisma.$queryRawUnsafe<
      Array<{ pubgAccountId: string; platformShard: string; combat: number; attempts: number }>
    >(
      `SELECT pubgAccountId, platformShard, combatInteractionsCount AS combat, resolveAttempts AS attempts
         FROM EncounteredPlayer
        WHERE id > ? ${upperId ? 'AND id <= ?' : ''}
          AND (combatInteractionsCount <> 0 OR resolveAttempts > 0)`,
      ...(upperId ? [afterId, upperId] : [afterId])
    )
    for (const row of rows) {
      const key = identityKey(row.pubgAccountId, row.platformShard)
      const current = totals.get(key) ?? { combat: 0, attempts: 0 }
      current.combat += Number(row.combat)
      current.attempts = Math.max(current.attempts, Number(row.attempts))
      totals.set(key, current)
    }

    batches += 1
    scanned += upperId ? SCAN_BATCH : 0
    if (batches % 50 === 0) {
      console.log(`  EncounteredPlayer : ~${scanned.toLocaleString('fr-FR')} lignes parcourues, ${totals.size.toLocaleString('fr-FR')} comptes non nuls`)
    }
    if (!upperId) break
    afterId = upperId
  }

  return totals
}

async function readEncounterSums(playerIds: string[]) {
  const sums = new Map<string, number>()
  if (playerIds.length === 0) return sums
  const rows = await prisma.$queryRawUnsafe<Array<{ playerId: string; total: bigint }>>(
    `SELECT playerId, CAST(SUM(encounterCount) AS SIGNED) AS total
       FROM ClanEncounter WHERE playerId IN (${placeholders(playerIds.length)})
      GROUP BY playerId`,
    ...playerIds
  )
  for (const row of rows) sums.set(row.playerId, Number(row.total))
  return sums
}

async function writeUpdates(updates: PlayerUpdate[]) {
  for (let start = 0; start < updates.length; start += WRITE_BATCH) {
    const chunk = updates.slice(start, start + WRITE_BATCH)
    // `CASE id WHEN ?` compare la colonne à un paramètre (collation de la colonne, pas de mélange possible).
    const caseOf = () => `CASE id ${chunk.map(() => 'WHEN ? THEN ?').join(' ')} END`
    // `resolveAttempts` par GREATEST : un échec compté entre la lecture et l'écriture n'est jamais effacé.
    await prisma.$executeRawUnsafe(
      `UPDATE Player
          SET encounterCount = ${caseOf()},
              combatInteractionsCount = ${caseOf()},
              resolveAttempts = GREATEST(resolveAttempts, ${caseOf()})
        WHERE id IN (${placeholders(chunk.length)})`,
      ...chunk.flatMap((update) => [update.id, update.encounterCount]),
      ...chunk.flatMap((update) => [update.id, update.combatInteractionsCount]),
      ...chunk.flatMap((update) => [update.id, update.resolveAttempts]),
      ...chunk.map((update) => update.id)
    )
  }
}

async function main() {
  await assertColumnsExist()
  const startedAt = Date.now()

  console.log('Lecture des compteurs d’EncounteredPlayer…')
  const epTotals = await readEncounteredPlayerTotals()
  console.log(`  ${epTotals.size.toLocaleString('fr-FR')} compte(s) avec des interactions de combat ou des échecs de résolution`)

  const [{ total: playerTotal }] = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>('SELECT COUNT(*) AS total FROM Player')
  console.log(`Parcours de Player (${Number(playerTotal).toLocaleString('fr-FR')} lignes)…`)

  let afterId = ''
  let read = 0
  let batches = 0
  const changed = { rows: 0, encounter: 0, combat: 0, attempts: 0, written: 0 }
  const examples: Array<PlayerRow & { next: PlayerUpdate }> = []

  for (;;) {
    const players = await prisma.$queryRawUnsafe<PlayerRow[]>(
      `SELECT id, pubgAccountId, platformShard, encounterCount, combatInteractionsCount, resolveAttempts
         FROM Player WHERE id > ? ORDER BY id LIMIT ${PLAYER_BATCH}`,
      afterId
    )
    if (players.length === 0) break
    afterId = players[players.length - 1].id
    read += players.length

    const encounterSums = await readEncounterSums(players.map((player) => player.id))
    const updates: PlayerUpdate[] = []
    for (const player of players) {
      const ep = epTotals.get(identityKey(player.pubgAccountId, player.platformShard))
      const next: PlayerUpdate = {
        id: player.id,
        encounterCount: encounterSums.get(player.id) ?? 0,
        combatInteractionsCount: ep?.combat ?? 0,
        resolveAttempts: Math.max(Number(player.resolveAttempts), ep?.attempts ?? 0),
      }
      const encounterChanged = next.encounterCount !== Number(player.encounterCount)
      const combatChanged = next.combatInteractionsCount !== Number(player.combatInteractionsCount)
      const attemptsChanged = next.resolveAttempts !== Number(player.resolveAttempts)
      if (!encounterChanged && !combatChanged && !attemptsChanged) continue

      updates.push(next)
      changed.rows += 1
      if (encounterChanged) changed.encounter += 1
      if (combatChanged) changed.combat += 1
      if (attemptsChanged) changed.attempts += 1
      if (examples.length < 10 && next.combatInteractionsCount > 0) examples.push({ ...player, next })
    }

    if (apply && updates.length > 0) {
      await writeUpdates(updates)
      changed.written += updates.length
    }

    batches += 1
    if (batches % 50 === 0) {
      const seconds = Math.round((Date.now() - startedAt) / 1000)
      console.log(`  ${read.toLocaleString('fr-FR')} lues, ${changed.rows.toLocaleString('fr-FR')} à corriger (${seconds} s)`)
    }
  }

  console.log(`\nPlayer lues                       : ${read.toLocaleString('fr-FR')}`)
  console.log(`Lignes à corriger                 : ${changed.rows.toLocaleString('fr-FR')}`)
  console.log(`  dont encounterCount             : ${changed.encounter.toLocaleString('fr-FR')}`)
  console.log(`  dont combatInteractionsCount    : ${changed.combat.toLocaleString('fr-FR')}`)
  console.log(`  dont resolveAttempts            : ${changed.attempts.toLocaleString('fr-FR')}`)
  for (const example of examples) {
    console.log(
      `    - ${example.pubgAccountId} : rencontres ${example.encounterCount} → ${example.next.encounterCount}, ` +
        `combats ${example.combatInteractionsCount} → ${example.next.combatInteractionsCount}, ` +
        `échecs ${example.resolveAttempts} → ${example.next.resolveAttempts}`
    )
  }
  console.log(`Durée                             : ${Math.round((Date.now() - startedAt) / 1000)} s`)

  if (!apply) {
    console.log('\nSimulation : rien n’a été écrit. Relancer avec --apply pour écrire.')
    return
  }
  console.log(`\nÉcrit : ${changed.written.toLocaleString('fr-FR')} ligne(s) Player.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
