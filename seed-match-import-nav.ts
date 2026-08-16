import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const lastSuperUserItem = await prisma.navItem.findFirst({
    where: { section: 'superuser-menu' },
    orderBy: { sortOrder: 'desc' },
  })
  const sortOrder = (lastSuperUserItem?.sortOrder ?? 0) + 1

  await prisma.navItem.upsert({
    where: { navKey: 'superuser.match-import' },
    update: {
      section: 'superuser-menu',
      label: 'Import de matchs PUBG',
      hrefTemplate: '/settings/match-import',
      defaultRole: 'superuser',
      description: "Vérification et import manuel des derniers matchs PUBG d'un membre, tous clans confondus.",
    },
    create: {
      navKey: 'superuser.match-import',
      section: 'superuser-menu',
      label: 'Import de matchs PUBG',
      hrefTemplate: '/settings/match-import',
      defaultRole: 'superuser',
      description: "Vérification et import manuel des derniers matchs PUBG d'un membre, tous clans confondus.",
      sortOrder,
    },
  })
  console.log('Nav item superuser.match-import seeded successfully.')
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
