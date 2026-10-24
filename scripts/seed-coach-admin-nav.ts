import { PrismaClient } from '@prisma/client'

/**
 * Inscrit l'entrée « Coach IA » (/settings/coach) dans le menu SuperUser (`NavItem`). ÉCRIT dans la base de
 * DATABASE_URL — à lancer une fois après le déploiement du Coach IA (docs/TODO/chatbot-ia.md, lot 7), avec
 * `scripts/seed-coach-nav.ts` pour l'entrée du clan :
 *
 *   npx tsx scripts/seed-coach-admin-nav.ts
 *
 * Même modèle que seed-league-settings-nav.ts : à la suite des entrées SuperUser, idempotent (upsert).
 */
const prisma = new PrismaClient()

const ITEM = {
  section: 'superuser-menu',
  label: 'Coach IA',
  hrefTemplate: '/settings/coach',
  defaultRole: 'superuser',
  description: 'Interrupteur, modèle Gemini, budgets et limites du Coach IA ; consommation du mois et réponses à relire.',
}

async function main() {
  const lastSuperUserItem = await prisma.navItem.findFirst({
    where: { section: 'superuser-menu' },
    orderBy: { sortOrder: 'desc' },
  })
  const sortOrder = (lastSuperUserItem?.sortOrder ?? 0) + 1

  await prisma.navItem.upsert({
    where: { navKey: 'superuser.coach' },
    update: ITEM,
    create: { navKey: 'superuser.coach', ...ITEM, sortOrder },
  })
  console.log('Nav item superuser.coach seeded successfully.')
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
