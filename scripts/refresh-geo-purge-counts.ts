/**
 * Déclenche à la main le comptage du volume purgeable des tracés GPS — ce que fait chaque nuit le
 * cron `telemetry_geo_purge_count`. Lecture seule sur les matchs ; écrit uniquement l'instantané
 * dans `AppConfig` (clé `telemetry_geo_purge_counts`).
 *
 * Compte environ 4 minutes : le parcours lit ~22 Go (voir `src/lib/telemetry-geo-purge.ts`).
 *
 * Usage : npx tsx scripts/refresh-geo-purge-counts.ts [--dry-run]
 *   --dry-run : calcule et affiche sans rien écrire.
 */
import { prisma } from '../src/lib/prisma'
import {
  computeGeoPurgeCounts,
  selectPurgeBatch,
  resolveCutoff,
  writeGeoPurgeCounts,
} from '../src/lib/telemetry-geo-purge'

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const counts = await computeGeoPurgeCounts()

  console.log(`Comptage terminé en ${(counts.durationMs / 1000).toFixed(0)}s`)
  console.log(`Lignes SquadMatchTelemetry : ${counts.totalRows.toLocaleString()}`)
  console.log(`Porteuses de tracés        : ${counts.totalWithGeo.toLocaleString()}`)
  console.log(`Protégées (Top 1 / custom) : ${counts.protectedMatches.toLocaleString()}\n`)
  console.log('seuil | borne             | ciblés | protégés | purgeables')
  for (const key of ['7', '14', '30', '60', '90', 'all']) {
    const t = counts.byThreshold[key]
    if (!t) continue
    const borne = t.cutoff ? new Date(t.cutoff).toISOString().slice(0, 16).replace('T', ' ') : '—'
    console.log(
      `${key.padStart(5)} | ${borne.padEnd(17)} | ${String(t.targeted).padStart(6)} | ` +
        `${String(t.protectedMatches).padStart(8)} | ${String(t.purgeable).padStart(10)}`
    )
  }

  // Vérifie que la sélection de purge s'exécute réellement (sans rien modifier).
  const echantillon = await selectPurgeBatch(resolveCutoff(14), 3)
  console.log(`\nSélection de purge (14 j, 3 lignes, aucune écriture) : ${echantillon.length} identifiants`)

  if (dryRun) {
    console.log('\n--dry-run : instantané non publié.')
    return
  }

  await writeGeoPurgeCounts(counts)
  console.log('\nInstantané publié dans AppConfig (telemetry_geo_purge_counts).')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
