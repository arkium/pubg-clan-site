import { PrismaClient } from '@prisma/client'
import { NAV_REGISTRY } from '../src/lib/nav-permissions-registry'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding NavItem table...')

  for (let i = 0; i < NAV_REGISTRY.length; i++) {
    const item = NAV_REGISTRY[i]
    await prisma.navItem.upsert({
      where: { navKey: item.navKey },
      create: {
        navKey: item.navKey,
        section: item.section,
        label: item.label,
        hrefTemplate: item.hrefTemplate,
        defaultRole: item.defaultRole,
        description: item.description,
        sortOrder: i,
        isActive: true,
      },
      update: {
        section: item.section,
        label: item.label,
        hrefTemplate: item.hrefTemplate,
        defaultRole: item.defaultRole,
        description: item.description,
        sortOrder: i,
      },
    })
    console.log(`  upserted: ${item.navKey}`)
  }

  const count = await prisma.navItem.count()
  console.log(`Done. ${count} NavItem rows in DB.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
