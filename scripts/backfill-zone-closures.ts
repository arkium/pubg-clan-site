/**
 * Rattrapage de `ZoneClosurePosition` (positions d'arrivée à chaque fermeture de zone) pour les matchs dont la
 * télémétrie garde encore ses `positionSamples`. Les matchs dont les positions ont été purgées sont ignorés :
 * leurs fins de zone sont définitivement perdues.
 *
 * Usage :
 *   npm run telemetry:zone-closures:backfill
 *   npm run telemetry:zone-closures:backfill -- --clan 1 --limit 500
 */
import 'dotenv/config'

import { prisma } from '@/lib/prisma'
import { backfillZoneClosurePositions } from '@/lib/zone-closure-positions'

function readPositiveInteger(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} requires a positive integer`)
  return value
}

async function main() {
  const clanId = readPositiveInteger('--clan')
  const limit = readPositiveInteger('--limit')
  const startedAt = Date.now()
  let lastLog = 0

  const result = await backfillZoneClosurePositions({
    clanId,
    limit,
    onProgress: (processed, total) => {
      if (processed === total || Date.now() - lastLog > 5000) {
        lastLog = Date.now()
        console.info(`[ZoneClosureBackfill] ${processed}/${total}`)
      }
    },
  })

  console.info('[ZoneClosureBackfill]', { clanId: clanId ?? 'all', ...result, durationMs: Date.now() - startedAt })
}

main()
  .catch((error) => {
    console.error('[ZoneClosureBackfill] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
