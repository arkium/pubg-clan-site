/**
 * Mesure le poids réel des données d'une table et publie le résultat dans `AppConfig`.
 *
 * `DATA_LENGTH` dit ce que le fichier `.ibd` occupe, pas ce que les lignes pèsent. Un
 * `OPTIMIZE TABLE` écrit un fichier neuf dimensionné par les **lignes vivantes** : c'est donc
 * cette mesure, et non la taille du fichier, qui détermine l'espace disque nécessaire. Sans elle,
 * la page SuperUser reste volontairement prudente et interdit le compactage.
 *
 * Parcours complet (~130 s sur `SquadMatchTelemetry`), lecture seule sur les données.
 *
 * Usage : npx tsx scripts/refresh-table-live-size.ts [table=SquadMatchTelemetry] [--dry-run]
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'
import { measureLiveDataSize, readTableSizes, writeLiveSize } from '../src/lib/table-maintenance'

const go = (mo: number) => `${(mo / 1024).toFixed(2)} Go`

async function main() {
  const table = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1])
    ?? 'SquadMatchTelemetry'
  const dryRun = process.argv.includes('--dry-run')

  const mesure = await measureLiveDataSize(table)
  const tailles = await readTableSizes(table)

  console.log(`Table : ${table}`)
  console.log(`Poids réel des données   : ${go(mesure.liveDataMb)}  (mesuré en ${(mesure.durationMs / 1000).toFixed(0)}s)`)
  if (tailles) {
    const reconstruit = Math.round(mesure.liveDataMb * 1.15)
    console.log(`Le fichier occupe        : ${go(tailles.totalSizeMb)}`)
    console.log(`Fichier reconstruit ≈    : ${go(reconstruit)}`)
    console.log(`Rendu au disque ≈        : ${go(Math.max(0, tailles.totalSizeMb - reconstruit))}`)
    console.log(`Disque libre nécessaire ≈: ${go(Math.round(reconstruit * 1.2))}`)
  }

  if (dryRun) {
    console.log('\n--dry-run : mesure non publiée.')
    return
  }

  await writeLiveSize(mesure)
  console.log('\nMesure publiée dans AppConfig (table_live_size) — la page SuperUser s’en sert pour son verdict.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
