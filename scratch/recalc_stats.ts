import { recalculateStatsForClan } from '../src/lib/stats-calculator'

async function main() {
  await recalculateStatsForClan(4)
  console.log('Stats recalculated for clan 4')
}

main()
  .catch(e => console.error(e))
  .finally(() => process.exit(0))
