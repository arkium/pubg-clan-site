const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const matches = await prisma.$queryRawUnsafe("SELECT id, memberId, gameMode FROM `Match` WHERE gameMode LIKE '%ai%' LIMIT 5");
  console.log('AI Matches:', matches);
  if(matches.length > 0) { 
    for(const m of matches) {
      await prisma.$queryRawUnsafe("UPDATE `Match` SET matchType = 'casual' WHERE id = ?", m.id);
      await prisma.$queryRawUnsafe("UPDATE `SquadMatch` SET matchType = 'casual' WHERE pubgMatchId = (SELECT pubgMatchId FROM `Match` WHERE id = ?)", m.id);
    }
    const member = await prisma.clanMember.findUnique({where: {id: matches[0].memberId}});
    console.log('Updated to casual! Member ID:', matches[0].memberId, 'Player:', member?.pubgPlayerName); 
  } else {
    // If no AI match, let's just make the first match of member 90 casual
    const randomMatches = await prisma.$queryRawUnsafe("SELECT id, memberId, pubgMatchId FROM `Match` LIMIT 1");
    if(randomMatches.length > 0) {
      await prisma.$queryRawUnsafe("UPDATE `Match` SET matchType = 'casual' WHERE id = ?", randomMatches[0].id);
      const member = await prisma.clanMember.findUnique({where: {id: randomMatches[0].memberId}});
      console.log('Forced 1 match to casual! Member ID:', randomMatches[0].memberId, 'Player:', member?.pubgPlayerName);
    }
  }
}
main().finally(() => prisma.$disconnect());
