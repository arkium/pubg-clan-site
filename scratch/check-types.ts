import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const types = await prisma.squadMatch.groupBy({
    by: ['matchType'],
    _count: { id: true },
  })
  console.log(types)
  await prisma.$disconnect()
}
main().catch(console.error)
