import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const NAV_KEY = 'admin.discord-notifications'
const NAV_ITEM = {
  section: 'admin-menu',
  label: 'Notifications Discord',
  hrefTemplate: '/clans/:clanId/settings/discord',
  defaultRole: 'admin',
  description: 'Alertes Top 1 publiées sur un canal Discord via webhook — configurable par clan.',
}

async function main() {
  const lastAdminItem = await prisma.navItem.findFirst({
    where: { section: NAV_ITEM.section },
    orderBy: { sortOrder: 'desc' },
  })

  await prisma.navItem.upsert({
    where: { navKey: NAV_KEY },
    update: NAV_ITEM,
    create: { navKey: NAV_KEY, ...NAV_ITEM, sortOrder: (lastAdminItem?.sortOrder ?? 0) + 1 },
  })

  console.log(`Nav item ${NAV_KEY} seeded successfully.`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
