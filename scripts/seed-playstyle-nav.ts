/**
 * Ajoute l'entrée de navigation « Style de jeu » du joueur : `member.playstyle`, après la carrière (`member.stats`).
 * Idempotent. La source de vérité des permissions est la table `NavItem` ; le registre TypeScript n'est qu'un repli
 * initial (src/lib/nav-permissions-registry.ts).
 *
 * Usage : npx tsx scripts/seed-playstyle-nav.ts
 */
import 'dotenv/config'

import { prisma } from '@/lib/prisma'

const ITEMS = [
  {
    navKey: 'member.playstyle',
    after: 'member.stats',
    data: {
      section: 'member-section',
      label: 'Style de jeu',
      hrefTemplate: '/members/:memberId/playstyle',
      defaultRole: 'none',
      description: 'Télémétrie du joueur comparée au clan : profil par rôle, mobilité, cercle, survie, coopération.',
    },
  },
]

async function main() {
  for (const entry of ITEMS) {
    const previous = await prisma.navItem.findUnique({ where: { navKey: entry.after } })
    const item = await prisma.navItem.upsert({
      where: { navKey: entry.navKey },
      update: entry.data,
      create: { navKey: entry.navKey, ...entry.data, sortOrder: (previous?.sortOrder ?? 0) + 1 },
    })
    console.info('[SeedNav]', entry.navKey, {
      role: item.roleOverride ?? item.defaultRole,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
    })
  }
}

main()
  .catch((error) => {
    console.error('[SeedNav] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
