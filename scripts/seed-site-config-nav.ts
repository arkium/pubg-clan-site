import { PrismaClient } from '@prisma/client'

/**
 * Inscrit l'entrée « Configuration du site » (/settings/configuration) dans le menu SuperUser (`NavItem`). ÉCRIT dans
 * la base de DATABASE_URL — à lancer une fois APRÈS le déploiement de la page (sinon l'entrée mène à une 404) :
 *
 *   npx tsx scripts/seed-site-config-nav.ts
 *
 * Même modèle que seed-league-settings-nav.ts : à la suite des entrées SuperUser, idempotent (upsert).
 */
const prisma = new PrismaClient()

const NAV_KEY = 'superuser.site-config'

const ITEM = {
  section: 'superuser-menu',
  label: 'Configuration du site',
  hrefTemplate: '/settings/configuration',
  defaultRole: 'superuser',
  description: 'Réglages du .env contrôlés et expliqués : adresses, secrets, e-mails, API PUBG, tâches, télémétrie.',
}

async function main() {
  const lastSuperUserItem = await prisma.navItem.findFirst({
    where: { section: 'superuser-menu' },
    orderBy: { sortOrder: 'desc' },
  })
  const sortOrder = (lastSuperUserItem?.sortOrder ?? 0) + 1

  await prisma.navItem.upsert({
    where: { navKey: NAV_KEY },
    update: ITEM,
    create: { navKey: NAV_KEY, ...ITEM, sortOrder },
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
