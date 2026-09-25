/**
 * Que gagnerait-on à compresser les colonnes JSON restantes ? — lecture seule.
 *
 * Après la géolocalisation, il reste ~5,7 Go de JSON en clair sur les 6,99 Go de données vivantes.
 * Or l'espace disque nécessaire à un `OPTIMIZE TABLE` suit le poids des données vivantes : les
 * compresser ferait passer la reconstruction sous le seuil des 4,3 Go actuellement libres.
 *
 * Usage : npx tsx scripts/check-remaining-columns-compressibility.ts [nbMatchs=8]
 */
import 'dotenv/config'

import { gzipSync } from 'node:zlib'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'

const COLONNES = [
  'weaponStats',
  'memberStats',
  'deathSamples',
  'landingSamples',
  'phaseSnapshots',
  'killSamples',
  'shotSamples',
  'damageSamples',
  'knockoutSamples',
  'reviveSamples',
  'vehicleSamples',
  'killFeedSamples',
  'carePackageSamples',
] as const

const mo = (o: number) => `${(o / 1024 / 1024).toFixed(2)} Mo`

async function main() {
  const nb = Number(process.argv[2]) || 8

  const ids = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM SquadMatchTelemetry
    WHERE status = 'success'
    ORDER BY parsedAt DESC
    LIMIT ${nb}
  `)

  const totaux = new Map<string, { brut: number; gz: number }>()
  const selection = COLONNES.map((c) => `CAST(\`${c}\` AS CHAR) AS \`${c}\``).join(', ')

  for (const { id } of ids) {
    const [ligne] = await prisma.$queryRawUnsafe<Array<Record<string, string | null>>>(
      `SELECT ${selection} FROM SquadMatchTelemetry WHERE id = ?`,
      id
    )
    if (!ligne) continue
    for (const colonne of COLONNES) {
      const valeur = ligne[colonne]
      if (!valeur) continue
      const brut = Buffer.from(valeur, 'utf8')
      const cumul = totaux.get(colonne) ?? { brut: 0, gz: 0 }
      cumul.brut += brut.length
      cumul.gz += gzipSync(brut, { level: 6 }).length
      totaux.set(colonne, cumul)
    }
  }

  console.log(`=== ${ids.length} matchs récents ===`)
  console.log('colonne              |      brut |      gzip | ratio')
  let brutTotal = 0
  let gzTotal = 0
  for (const colonne of COLONNES) {
    const t = totaux.get(colonne)
    if (!t || t.brut === 0) continue
    brutTotal += t.brut
    gzTotal += t.gz
    console.log(
      `${colonne.padEnd(20)} | ${mo(t.brut).padStart(9)} | ${mo(t.gz).padStart(9)} | ${(t.brut / t.gz).toFixed(1)}x`
    )
  }
  console.log(`${'TOTAL'.padEnd(20)} | ${mo(brutTotal).padStart(9)} | ${mo(gzTotal).padStart(9)} | ${(brutTotal / gzTotal).toFixed(1)}x`)

  // Projection : 5,70 Go de colonnes JSON encore en clair (mesure du 2026-09-24)
  const ratio = gzTotal / brutTotal
  const restantGo = 5.7
  const apres = restantGo * ratio
  const geoGo = 1.28
  const vivantApres = apres + geoGo

  console.log('\n=== Projection sur les données vivantes ===')
  console.log(`JSON en clair aujourd'hui   : ${restantGo.toFixed(2)} Go`)
  console.log(`Après compression           : ${apres.toFixed(2)} Go`)
  console.log(`Données vivantes totales    : 6,99 Go -> ${vivantApres.toFixed(2)} Go`)
  console.log(`Fichier reconstruit ≈       : ${(vivantApres * 1.15).toFixed(2)} Go`)
  console.log(`Disque libre nécessaire ≈   : ${(vivantApres * 1.15 * 1.2).toFixed(2)} Go  (disponible : 4,3 Go)`)
  console.log(`Espace rendu au système ≈   : ${(22 - vivantApres * 1.15).toFixed(2)} Go`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
