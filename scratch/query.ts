import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const matches = await prisma.match.findMany({
    where: {
      memberId: 4,
      pubgCreatedAt: {
        gte: new Date('2026-08-26T00:00:00.000Z'),
        lt: new Date('2026-08-27T00:00:00.000Z')
      }
    },
    select: {
      id: true,
      pubgCreatedAt: true,
      mapName: true,
      matchType: true,
      gameMode: true,
      placement: true
    },
    orderBy: {
      pubgCreatedAt: 'desc'
    }
  })

  console.log(JSON.stringify(matches, null, 2))
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
