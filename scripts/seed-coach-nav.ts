import { PrismaClient } from '@prisma/client'

/**
 * Inscrit l'entrée « Coach IA » (/clans/[clanId]/coach) dans le menu du clan (`NavItem`). ÉCRIT dans la base de
 * DATABASE_URL — à lancer une fois après le déploiement du Coach IA (docs/TODO/chatbot-ia.md, lot 5) :
 *
 *   npx tsx scripts/seed-coach-nav.ts
 *
 * Même modèle que seed-league-settings-nav.ts : à la suite des entrées de la section du clan, idempotent (upsert).
 * Rôle `member` : visible des membres connectés, jamais des visiteurs (un visiteur a le teaser du tiroir).
 */
const prisma = new PrismaClient()

const ITEM = {
  section: 'clan-section',
  label: 'Coach IA',
  hrefTemplate: '/clans/:clanId/coach',
  defaultRole: 'member',
  description: 'Coach IA du clan : débriefings, armes et adversaires expliqués à partir de la télémétrie, pour les membres connectés.',
}

async function main() {
  const lastClanItem = await prisma.navItem.findFirst({
    where: { section: 'clan-section' },
    orderBy: { sortOrder: 'desc' },
  })
  const sortOrder = (lastClanItem?.sortOrder ?? 0) + 1

  await prisma.navItem.upsert({
    where: { navKey: 'clan.coach' },
    update: ITEM,
    create: { navKey: 'clan.coach', ...ITEM, sortOrder },
  })
  console.log('Nav item clan.coach seeded successfully.')
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
