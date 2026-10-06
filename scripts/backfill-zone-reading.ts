/**
 * Rattrapage de `ZoneReadingMatch` (Lecture de zone : ligne de vol du C-130 et cercles stables de chaque partie) pour
 * les parties déjà analysées. `vehicleSamples`, `landingSamples` et `phaseSnapshots` ne sont jamais purgés : tout
 * l'historique est couvert. Relançable : les parties déjà écrites sont ignorées.
 *
 * Usage :
 *   npm run telemetry:zone-reading:backfill
 *   npm run telemetry:zone-reading:backfill -- --limit 500
 */
import 'dotenv/config'

import { prisma } from '@/lib/prisma'
import { backfillZoneReadingMatches } from '@/lib/zone-reading/zone-reading-match'

function readPositiveInteger(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} requires a positive integer`)
  return value
}

async function main() {
  const limit = readPositiveInteger('--limit')
  const startedAt = Date.now()
  let lastLog = 0

  const result = await backfillZoneReadingMatches({
    limit,
    onProgress: (processed, total, written) => {
      if (processed === total || Date.now() - lastLog > 5000) {
        lastLog = Date.now()
        console.info(`[ZoneReadingBackfill] ${processed}/${total} parties lues, ${written} écrites`)
      }
    },
  })

  console.info('[ZoneReadingBackfill]', { ...result, durationMs: Date.now() - startedAt })
}

main()
  .catch((error) => {
    console.error('[ZoneReadingBackfill] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
