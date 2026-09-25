/**
 * Vérifie que les colonnes compressées se relisent réellement — lecture seule.
 *
 * Rejoue ce que fait l'application : sélectionne les colonnes `*Gz`, les passe à
 * `decodeTelemetryRow` et contrôle que chaque section est exploitable. C'est le test de bout en
 * bout à passer avant toute reconstruction de la table.
 *
 * Usage : npx tsx scripts/check-compression-readback.ts [nbMatchs=10]
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { COMPRESSED_JSON_COLUMNS, decodeTelemetryRow } from '../src/lib/pubg-telemetry/json-codec'

const n = (v: unknown) => Number(v ?? 0)

async function main() {
  const nb = Number(process.argv[2]) || 10

  // 1. Répartition des formats
  const [formats] = await prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
    `SELECT COUNT(*) AS total,
            SUM(${COMPRESSED_JSON_COLUMNS.map((c) => `${c} IS NOT NULL`).join(' OR ')}) AS enClair,
            SUM(${COMPRESSED_JSON_COLUMNS.map((c) => `${c}Gz IS NOT NULL`).join(' OR ')}) AS compresse
     FROM SquadMatchTelemetry`
  )
  console.log('=== Répartition des formats ===')
  console.log(`Lignes totales              : ${n(formats?.total).toLocaleString()}`)
  console.log(`Encore en clair (à migrer)  : ${n(formats?.enClair).toLocaleString()}`)
  console.log(`Compressées                 : ${n(formats?.compresse).toLocaleString()}`)

  // 2. Relecture réelle
  const colonnes = COMPRESSED_JSON_COLUMNS.flatMap((c) => [c, `${c}Gz`])
  const lignes = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT squadMatchId, ${colonnes.join(', ')}
     FROM SquadMatchTelemetry
     WHERE status = 'success'
     ORDER BY parsedAt DESC
     LIMIT ${nb}`
  )

  console.log(`\n=== Relecture de ${lignes.length} matchs récents ===`)
  let echecs = 0
  const remplies = new Map<string, number>()

  for (const ligne of lignes) {
    const id = String(ligne.squadMatchId)
    try {
      const normalisee = decodeTelemetryRow({ ...ligne })
      const sections: string[] = []
      for (const colonne of COMPRESSED_JSON_COLUMNS) {
        const valeur = normalisee[colonne]
        const taille = Array.isArray(valeur) ? valeur.length : valeur ? 1 : 0
        if (taille > 0) {
          remplies.set(colonne, (remplies.get(colonne) ?? 0) + 1)
          sections.push(`${colonne}:${taille}`)
        }
      }
      console.log(`  ✔ ${id} — ${sections.length} sections (${sections.slice(0, 4).join(', ')}…)`)
    } catch (error) {
      echecs += 1
      console.log(`  ✘ ${id} — ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log('\n=== Couverture par colonne sur l’échantillon ===')
  for (const colonne of COMPRESSED_JSON_COLUMNS) {
    console.log(`  ${colonne.padEnd(20)} ${remplies.get(colonne) ?? 0} / ${lignes.length}`)
  }

  console.log(
    echecs === 0
      ? '\n✔ Toutes les lignes se relisent correctement.'
      : `\n✘ ${echecs} lignes illisibles — ne pas reconstruire la table avant d’avoir compris pourquoi.`
  )
  if (echecs > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
