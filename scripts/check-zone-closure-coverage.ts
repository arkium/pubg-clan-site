/**
 * Couverture de `ZoneClosurePosition` après rattrapage — lecture seule, sans toucher aux blobs
 * de télémétrie (donc rapide).
 *
 * Usage : npx tsx scripts/check-zone-closure-coverage.ts
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'

const n = (v: unknown) => Number(v ?? 0)

async function main() {
  const [global] = await prisma.$queryRaw<Array<{ matchs: bigint; lignes: bigint }>>`
    SELECT COUNT(DISTINCT squadMatchId) AS matchs, COUNT(*) AS lignes FROM ZoneClosurePosition
  `
  console.log(`ZoneClosurePosition : ${n(global?.lignes).toLocaleString()} lignes sur ${n(global?.matchs).toLocaleString()} matchs`)

  const [fenetre] = await prisma.$queryRaw<Array<{ matchs: bigint; avec: bigint }>>`
    SELECT COUNT(*) AS matchs,
           SUM(EXISTS(SELECT 1 FROM ZoneClosurePosition z WHERE z.squadMatchId = m.id)) AS avec
    FROM SquadMatch m
    WHERE m.createdAt >= '2026-08-18' AND m.createdAt < NOW() - INTERVAL 14 DAY
  `
  const total = n(fenetre?.matchs)
  const avec = n(fenetre?.avec)
  console.log(
    `Fenêtre purgeable (18/08 -> J-14) : ${avec.toLocaleString()} / ${total.toLocaleString()} matchs couverts ` +
      `(${total > 0 ? Math.round((avec / total) * 100) : 0} %)`
  )

  const [recents] = await prisma.$queryRaw<Array<{ matchs: bigint; avec: bigint }>>`
    SELECT COUNT(*) AS matchs,
           SUM(EXISTS(SELECT 1 FROM ZoneClosurePosition z WHERE z.squadMatchId = m.id)) AS avec
    FROM SquadMatch m
    WHERE m.createdAt >= NOW() - INTERVAL 14 DAY
  `
  console.log(
    `Matchs récents (< 14 j, non purgeables) : ${n(recents?.avec).toLocaleString()} / ${n(recents?.matchs).toLocaleString()} couverts`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
