/**
 * Emplacements des véhicules observés de la Carte des ressources (docs/features/carte-ressources.md) — même calcul
 * que le cron `resource_vehicle_spots` (06:30).
 *
 *   npx tsx scripts/compute-resource-vehicle-spots.ts --dry-run [--limit 150]   # lecture seule, résumé
 *   npx tsx scripts/compute-resource-vehicle-spots.ts                           # ÉCRIT : remplace les emplacements
 *
 * `--limit <n>` : au plus n parties par carte, les plus récentes. Sans `--dry-run`, le script remplace
 * `ResourceVehicleSpot` et `ResourceVehicleMapStat` carte par carte (premier remplissage après la migration
 * `20261005090000_add_resource_map`) ; avec `--limit`, l'agrégat écrit ne porte que sur cet échantillon.
 */
import 'dotenv/config'

import { prisma } from '@/lib/prisma'
import { OBSERVED_FAMILIES, gridLabel, isSpotShown, resourceMap, spotShare, topMatchesByFamily } from '@/lib/resources/resource-map'
import { computeResourceVehicleSpots, formatResourceVehicleMapSummary } from '@/lib/resources/resource-vehicle-spots'

/** Emplacements affichables listés par carte dans le résumé. */
const TOP_SPOTS = 8

function readPositiveInteger(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} attend un entier positif`)
  return value
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const limit = readPositiveInteger('--limit')
  console.info(
    `[ResourceVehicleSpots] ${dryRun ? 'SIMULATION (lecture seule)' : 'ÉCRITURE'}` +
      (limit ? ` — ${limit} parties par carte au plus` : ' — toutes les parties de la fenêtre')
  )

  const summary = await computeResourceVehicleSpots({
    dryRun,
    limit,
    onMap: (map, spots) => {
      console.info(`  ${formatResourceVehicleMapSummary(map)}`)
      const definition = resourceMap(map.mapName)
      const familyTop = topMatchesByFamily(spots)
      const shown = spots
        .filter((spot) => isSpotShown(spot, map.analysedMatches, familyTop.get(spot.family) ?? 0))
        .sort((a, b) => b.matches - a.matches || b.observations - a.observations)
        .slice(0, TOP_SPOTS)
      for (const spot of shown) {
        const grid = definition ? gridLabel(definition, spot.x, spot.y) : '?'
        console.info(
          `    ${spot.family.padEnd(6)} ${grid} (${spot.x}, ${spot.y}) — ${spot.matches} parties ` +
            `(${Math.round(spotShare(spot, map.analysedMatches) * 100)} %), ${spot.observations} montées`
        )
      }
    },
  })

  console.info(
    `[ResourceVehicleSpots] fenêtre ${summary.windowDays} j (depuis ${summary.since.toISOString()}), ` +
      `${(summary.durationMs / 1000).toFixed(1)} s, tas max ${summary.peakHeapMb} Mo, ` +
      `RSS ${Math.round(process.memoryUsage().rss / (1024 * 1024))} Mo`
  )
  console.table(
    summary.maps.map((map) => ({
      carte: map.label,
      parties: map.analysedMatches,
      'montées lobby': map.lobbyRides,
      ...Object.fromEntries(OBSERVED_FAMILIES.map((family) => [`${family} affich./empl.`, `${map.shownSpots[family]}/${map.spots[family]}`])),
    }))
  )
  if (!dryRun) console.info('[ResourceVehicleSpots] emplacements et statistiques écrits.')
}

main()
  .catch((error) => {
    console.error('[ResourceVehicleSpots] échec', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
