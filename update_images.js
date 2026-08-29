const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const clans = await prisma.clan.findMany({
    where: { name: { in: ['Crazy-Academy', 'Ungrouped'] } }
  })
  
  for (const clan of clans) {
    console.log(`Found clan ${clan.name} with ID ${clan.id}`)
    const imageUrl = `/clans/${clan.name === 'Crazy-Academy' ? 'crazyacademy' : 'ungrouped'}.jpg`
    await prisma.clanConfig.upsert({
      where: { clanId_key: { clanId: clan.id, key: 'login_welcome_image_url' } },
      update: { value: imageUrl },
      create: { clanId: clan.id, key: 'login_welcome_image_url', value: imageUrl },
    })
    console.log(`Updated imageUrl to ${imageUrl} for clan ${clan.name}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
