/**
 * Rattrapage de `SafeZonePhaseStat` (zones sûres par phase, « cercle moyen » de la page Positions) pour les matchs
 * dont la télémétrie est en `success` et qui n'ont encore aucune ligne. Relançable : les matchs déjà couverts sont ignorés.
 *
 * Usage :
 *   npm run telemetry:safe-zones:backfill                          # tous les clans
 *   npm run telemetry:safe-zones:backfill -- --clan 1 --limit 500  # un clan, 500 matchs au plus
 */
import 'dotenv/config'

import { prisma } from '@/lib/prisma'
import { backfillSafeZonePhaseStats } from '@/lib/safe-zone-phase-stats'

function readPositiveInteger(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} requires a positive integer`)
  }
  return value
}

async function main() {
  const clanId = readPositiveInteger('--clan')
  const limit = readPositiveInteger('--limit')
  const startedAt = Date.now()
  let lastLog = 0
  const result = await backfillSafeZonePhaseStats({
    clanId,
    limit,
    onProgress: (processed, total) => {
      if (processed === total || Date.now() - lastLog > 5000) {
        lastLog = Date.now()
        console.info(`[SafeZoneBackfill] ${processed}/${total}`)
      }
    },
  })
  console.info('[SafeZoneBackfill]', { clanId: clanId ?? 'all', ...result, durationMs: Date.now() - startedAt })
}

main()
  .catch((error) => {
    console.error('[SafeZoneBackfill] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
