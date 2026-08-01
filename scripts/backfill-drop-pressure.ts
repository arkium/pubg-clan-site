import 'dotenv/config'

import { backfillDropPressureStats } from '@/lib/drop-pressure-persistence'
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
  const result = await backfillDropPressureStats({ clanId, limit })
  console.info('[DropPressureBackfill]', { clanId: clanId ?? 'all', ...result })
}

main()
  .catch((error) => {
    console.error('[DropPressureBackfill] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })