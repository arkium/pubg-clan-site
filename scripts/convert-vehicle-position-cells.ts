/**
 * Convertit les cellules « Véhicules » d'avant le 2026-10-04 (`PositionMetricCell`, metric = 'vehicle' : une montée ou
 * une descente par passager, avion compris) en véhicules pris / laissés (`vehicle_ride` / `vehicle_leave` : un par
 * véhicule, avion, planeur, ballon et mortier exclus). Déduction depuis `vehicleSamples` ; chaque membre garde le clan
 * de ses cellules d'origine, les autres métriques ne sont pas touchées (voir `convertLegacyVehiclePositionCells`).
 *
 * SIMULATION PAR DÉFAUT — n'écrit rien, affiche ce qui serait écrit :
 *   npx tsx scripts/convert-vehicle-position-cells.ts [--clan 13] [--limit 500]
 * Écriture (base de DATABASE_URL), par pages de 200 matchs, une transaction par page, reprise par --after :
 *   npx tsx scripts/convert-vehicle-position-cells.ts --write [--after <squadMatchId>]
 *
 * À lancer juste APRÈS le déploiement de `web` et `telemetry-worker` : d'ici là, l'ancien code écrit encore des
 * cellules `vehicle`, et le nouveau ne les affiche pas. Relancer reprend les matchs restants (idempotent).
 */
import 'dotenv/config'

import { convertLegacyVehiclePositionCells } from '@/lib/position-metric-cells'
import { prisma } from '@/lib/prisma'

function readFlag(flag: string) {
  const index = process.argv.indexOf(flag)
  return index < 0 ? undefined : process.argv[index + 1]
}

function readPositiveInteger(flag: string) {
  const raw = readFlag(flag)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} requires a positive integer`)
  return value
}

async function main() {
  const write = process.argv.includes('--write')
  const started = performance.now()
  let pages = 0
  const result = await convertLegacyVehiclePositionCells({
    clanId: readPositiveInteger('--clan'),
    limit: readPositiveInteger('--limit'),
    pageSize: readPositiveInteger('--page-size'),
    after: readFlag('--after'),
    write,
    onPage: (page) => {
      pages += 1
      if (pages % 10 === 0) {
        console.info(`[VehicleCells] ${pages} pages · dernier match ${page.lastSquadMatchId} · ${Math.round((performance.now() - started) / 1000)} s`)
      }
    },
  })
  console.info(`[VehicleCells] ${write ? 'ÉCRIT' : 'SIMULATION (rien écrit, --write pour appliquer)'}`, {
    ...result,
    seconds: Math.round((performance.now() - started) / 1000),
  })
}

main()
  .catch((error) => {
    console.error('[VehicleCells] failed', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
