/**
 * Mesure, en LECTURE SEULE, les types de partie (`SquadMatch.matchType`) joués par les clans de la Ligue Inter-Clans
 * (membres actifs des clans suivis), pour la période donnée — sert au filtre « type de match » de /clans-leaderboard.
 *
 *   npx tsx scripts/measure-league-match-types.ts [jours, 30 par défaut]
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

async function main() {
  const days = Number(process.argv[2] ?? 30)
  const since = new Date(Date.now() - days * 86_400_000)
  const rows = await prisma.$queryRaw<Array<{ matchType: string | null; matches: bigint; clans: bigint }>>(Prisma.sql`
    SELECT sm.matchType AS matchType, COUNT(DISTINCT sm.id) AS matches, COUNT(DISTINCT cm.clanId) AS clans
    FROM SquadMember sq
    INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
    INNER JOIN ClanMember cm ON cm.id = sq.memberId
    INNER JOIN Clan c ON c.id = cm.clanId
    WHERE cm.isActive = 1 AND cm.joinStatus = 'active' AND c.isActive = 1 AND c.pubgClanId IS NOT NULL
      AND sm.createdAt >= ${since}
    GROUP BY sm.matchType
    ORDER BY matches DESC
  `)
  console.log(`Parties des clans de la ligue, ${days} derniers jours :`)
  for (const row of rows) {
    console.log(`  ${String(row.matchType).padEnd(14)} ${String(row.matches).padStart(6)} parties · ${row.clans} clans`)
  }
  const modes = await prisma.$queryRaw<Array<{ matchType: string | null; gameMode: string | null; matches: bigint }>>(Prisma.sql`
    SELECT sm.matchType AS matchType, sm.gameMode AS gameMode, COUNT(*) AS matches
    FROM SquadMatch sm
    WHERE sm.createdAt >= ${since}
    GROUP BY sm.matchType, sm.gameMode
    ORDER BY matches DESC
    LIMIT 25
  `)
  console.log('\nType × mode (toutes escouades suivies) :')
  for (const row of modes) console.log(`  ${String(row.matchType).padEnd(14)} ${String(row.gameMode).padEnd(16)} ${row.matches}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
