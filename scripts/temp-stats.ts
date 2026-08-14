import { prisma } from '../src/lib/prisma';
async function main() {
  const clan = await prisma.clan.findFirst({ where: { isActive: true }, select: { clanStats: true } });
  console.log(JSON.stringify(clan?.clanStats, null, 2));
}
main().finally(() => prisma.$disconnect());
