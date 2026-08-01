import 'dotenv/config'

import { backfillPositionMetricCells } from '@/lib/position-metric-cells'
import { prisma } from '@/lib/prisma'

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
  const result = await backfillPositionMetricCells({ clanId, limit })
  console.info('[PositionMetricBackfill]', { clanId: clanId ?? 'all', ...result })
}

main()
  .catch((error) => {
    console.error('[PositionMetricBackfill] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })