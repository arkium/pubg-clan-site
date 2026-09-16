/**
 * Recalcule `DropPressureStat.pressureLevel` sur les adversaires à moins de 250 m (repli : tous les joueurs quand les
 * équipes sont inconnues), décision du 2026-09-16. Les compteurs ne changent pas, seul le niveau est dérivé à nouveau.
 *
 * Usage :
 *   npx tsx scripts/recompute-drop-pressure-levels.ts          # simulation : répartition avant/après, lignes touchées
 *   npx tsx scripts/recompute-drop-pressure-levels.ts --yes    # écrit en base
 *
 * À lancer APRÈS le déploiement du code qui calcule le niveau sur les adversaires : avant, les synchronisations de
 * la production continuent d'écrire des niveaux calculés sur tous les joueurs.
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'

// Mêmes seuils que `dropPressureLevel` (src/lib/drop-zone-pressure.ts).
const LEVEL_SQL = `CASE
  WHEN COALESCE(nearbyOpponentCount250m, nearbyPlayerCount250m) >= 16 THEN 'very_hot'
  WHEN COALESCE(nearbyOpponentCount250m, nearbyPlayerCount250m) >= 8 THEN 'hot'
  WHEN COALESCE(nearbyOpponentCount250m, nearbyPlayerCount250m) >= 3 THEN 'contested'
  ELSE 'calm'
END`

async function distribution(expression: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ level: string; n: bigint }>>(
    `SELECT ${expression} AS level, COUNT(*) AS n FROM DropPressureStat GROUP BY level ORDER BY level`
  )
  const total = rows.reduce((sum, row) => sum + Number(row.n), 0)
  return rows.map((row) => `${row.level} ${Number(row.n)} (${((100 * Number(row.n)) / Math.max(1, total)).toFixed(1)} %)`).join(' · ')
}

async function main() {
  const write = process.argv.includes('--yes')
  const [toChange] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM DropPressureStat WHERE pressureLevel <> ${LEVEL_SQL}`
  )

  console.log('Répartition actuelle   :', await distribution('pressureLevel'))
  console.log('Répartition recalculée :', await distribution(LEVEL_SQL))
  console.log('Lignes dont le niveau change :', Number(toChange.n))

  if (!write) {
    console.log('\nSimulation : rien n’a été écrit. Relancer avec --yes pour appliquer.')
    return
  }

  const updated = await prisma.$executeRawUnsafe(
    `UPDATE DropPressureStat SET pressureLevel = ${LEVEL_SQL} WHERE pressureLevel <> ${LEVEL_SQL}`
  )
  console.log(`\n${updated} ligne(s) mise(s) à jour.`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
