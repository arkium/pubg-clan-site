import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting backfill for combatInteractionsCount...')

  const result = await prisma.$executeRaw`
    UPDATE EncounteredPlayer ep
    LEFT JOIN (
      SELECT clanId, accountId, SUM(kills) as interactions
      FROM (
        SELECT clanId, victimAccountId as accountId, COUNT(*) as kills
        FROM KillEvent
        WHERE killerMemberId IS NOT NULL AND victimAccountId NOT LIKE 'ai.%'
        GROUP BY clanId, victimAccountId
        
        UNION ALL
        
        SELECT clanId, killerAccountId as accountId, COUNT(*) as kills
        FROM KillEvent
        WHERE victimMemberId IS NOT NULL AND killerAccountId NOT LIKE 'ai.%'
        GROUP BY clanId, killerAccountId
      ) AS kills
      GROUP BY clanId, accountId
    ) AS kc ON ep.clanId = kc.clanId AND ep.pubgAccountId = kc.accountId
    SET ep.combatInteractionsCount = COALESCE(kc.interactions, 0);
  `

  console.log(`Backfill complete. Affected rows: ${result}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
