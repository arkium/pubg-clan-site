const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const matches = await prisma.$queryRawUnsafe("SELECT id, pubgMatchId, memberId, pubgCreatedAt, matchType FROM `Match` WHERE matchType = 'casual' LIMIT 1");
  console.log('Casual match:', matches);
}
main().finally(() => prisma.$disconnect());
