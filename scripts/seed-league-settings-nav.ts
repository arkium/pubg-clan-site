import { PrismaClient } from '@prisma/client'

/**
 * Inscrit l'entrée « Réglages de la ligue » (/settings/league) dans le menu SuperUser (`NavItem`). ÉCRIT dans la base
 * de DATABASE_URL — à lancer une fois après le déploiement :
 *
 *   npx tsx scripts/seed-league-settings-nav.ts
 *
 * Même modèle que seed-match-import-nav.ts : à la suite des entrées SuperUser, idempotent (upsert).
 */
const prisma = new PrismaClient()

const ITEM = {
  section: 'superuser-menu',
  label: 'Réglages de la ligue',
  hrefTemplate: '/settings/league',
  defaultRole: 'superuser',
  description: 'Barème de placement, coefficients, pondération et seuils du Power score de la Ligue Inter-Clans.',
}

async function main() {
  const lastSuperUserItem = await prisma.navItem.findFirst({
    where: { section: 'superuser-menu' },
    orderBy: { sortOrder: 'desc' },
  })
  const sortOrder = (lastSuperUserItem?.sortOrder ?? 0) + 1

  await prisma.navItem.upsert({
    where: { navKey: 'superuser.league-settings' },
    update: ITEM,
    create: { navKey: 'superuser.league-settings', ...ITEM, sortOrder },
  })
  console.log('Nav item superuser.league-settings seeded successfully.')
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
