import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.navItem.upsert({
    where: { navKey: 'primary.ligue' },
    update: {
      section: 'nav-primary',
      label: 'Ligue',
      hrefTemplate: '/clans-leaderboard',
      defaultRole: 'none',
      description: 'Classement public de tous les clans actifs.',
    },
    create: {
      navKey: 'primary.ligue',
      section: 'nav-primary',
      label: 'Ligue',
      hrefTemplate: '/clans-leaderboard',
      defaultRole: 'none',
      description: 'Classement public de tous les clans actifs.',
      sortOrder: 4,
    }
  })
  console.log('Nav item primary.ligue seeded successfully.')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
