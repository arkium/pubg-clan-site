const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const clans = await prisma.clan.findMany({
    where: { tag: 'FR' }
  })
  console.log("CLANS (tracked):", clans)

  const opponentClans = await prisma.opponentClan.findMany({
    where: { tag: 'FR' }
  })
  console.log("OPPONENT CLANS:", opponentClans)
}

main().catch(console.error).finally(() => prisma.$disconnect())
