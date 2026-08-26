import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const airoyaleSquadMatches = await prisma.squadMatch.findMany({
    where: {
      matchType: 'airoyale'
    },
    include: {
      members: {
        include: {
          member: true
        }
      }
    },
    take: 1
  })

  console.log(JSON.stringify(airoyaleSquadMatches, null, 2))
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
