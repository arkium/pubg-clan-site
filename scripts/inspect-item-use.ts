/**
 * Contrôle du parser des objets consommés sur une capture réelle : compare le comptage brut des événements
 * `LogItemUse` du fichier avec ce que produisent le parser puis le service de persistance. Lecture seule.
 *
 * Usage : npx tsx scripts/inspect-item-use.ts [chemin du fichier .json]
 *         (sans argument : première capture trouvée dans .telemetry-captured/)
 */
import 'dotenv/config'

import { createReadStream, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildMemberItemUseStatRows } from '../src/lib/item-use-persistence'
import { parseTelemetrySnapshotFromStream } from '../src/lib/pubg-telemetry/parser'

function pickCaptureFile() {
  const argument = process.argv[2]
  if (argument) return argument
  const directory = '.telemetry-captured'
  const file = readdirSync(directory).find((name) => name.endsWith('.json'))
  if (!file) throw new Error('Aucune capture dans .telemetry-captured/')
  return join(directory, file)
}

function nodeReadableToWebStream(path: string): ReadableStream<Uint8Array> {
  // Adaptateur manuel : `Readable.toWeb()` est interdit dans ce dépôt (crash V8 sur Node 22).
  const readable = createReadStream(path, { highWaterMark: 64 * 1024 })
  return new ReadableStream<Uint8Array>({
    start(controller) {
      readable.on('data', (chunk) => {
        controller.enqueue(chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk)))
        readable.pause()
      })
      readable.on('end', () => controller.close())
      readable.on('error', (error) => controller.error(error))
    },
    pull() {
      readable.resume()
    },
    cancel() {
      readable.destroy()
    },
  })
}

async function main() {
  const path = pickCaptureFile()
  console.log(`Capture : ${path}`)

  // Comptage manuel, indépendant du parser. Les captures sont tronquées à une taille maximale, donc illisibles
  // par `JSON.parse` : on lit le texte brut, événement par événement.
  const raw = readFileSync(path, 'utf8')
  const manual = new Map<string, number>()
  let manualUse = 0
  for (const chunk of raw.split('{"_T":"')) {
    if (!chunk.startsWith('LogItemUse')) continue
    const itemId = /"itemId":"([^"]*)"/.exec(chunk)?.[1] ?? '?'
    const category = /"category":"([^"]*)"/.exec(chunk)?.[1] ?? '?'
    const subCategory = /"subCategory":"([^"]*)"/.exec(chunk)?.[1] ?? '?'
    manual.set(`${category}/${subCategory}/${itemId}`, (manual.get(`${category}/${subCategory}/${itemId}`) ?? 0) + 1)
    if (category === 'Use') manualUse += 1
  }

  const { snapshot } = await parseTelemetrySnapshotFromStream(
    nodeReadableToWebStream(path),
    512 * 1024 * 1024
  )

  console.log(`Événements LogItemUse dans le fichier : ${[...manual.values()].reduce((a, b) => a + b, 0)} (dont catégorie Use : ${manualUse})`)
  console.log(`Échantillons produits par le parser  : ${snapshot.itemUseSamples.length}`)
  console.log('\nDétail lu à la main :')
  for (const [key, count] of [...manual.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(count).padStart(4)} × ${key}`)
  }

  // Persistance simulée sur les acteurs les plus actifs, sans écrire en base.
  const actors = new Map<string, number>()
  for (const sample of snapshot.itemUseSamples) {
    if (!sample.actorKey) continue
    actors.set(sample.actorKey, (actors.get(sample.actorKey) ?? 0) + 1)
  }
  const topActors = [...actors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const clanMembers = topActors.map(([key], index) => ({
    id: index + 1,
    pubgAccountId: key,
    pubgPlayerName: key,
  }))
  const rows = buildMemberItemUseStatRows(
    { id: 'simulation', createdAt: new Date() },
    clanMembers,
    snapshot.itemUseSamples
  )
  console.log('\nLignes qui seraient persistées pour les 3 joueurs les plus actifs :')
  for (const row of rows) {
    console.log(`  membre ${row.memberId} · ${row.subCategory.padEnd(8)} ${row.itemId} ×${row.count}`)
  }

  const boosted = snapshot.memberStats.filter((member) => member.boostsUsed > 0).length
  console.log(`\nJoueurs avec au moins un boost compté par le parser : ${boosted}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
