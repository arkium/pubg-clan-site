/**
 * Ajoute l'entrée de navigation clan « Fin de zone » (`clan.zone-closures`). Idempotent.
 * La source de vérité des permissions est la table `NavItem` ; le registre TypeScript n'est qu'un repli initial.
 *
 * Usage : npx tsx scripts/seed-zone-closures-nav.ts
 */
import 'dotenv/config'

import { prisma } from '@/lib/prisma'

const NAV_ITEM = {
  section: 'clan-section',
  label: 'Fin de zone',
  hrefTemplate: '/clans/:clanId/stats/zone-closures',
  defaultRole: 'none',
  description: 'Densité des positions d’arrivée à chaque fermeture de cercle — API /telemetry/zone-closures.',
}

async function main() {
  // Juste après « Cartographie tactique », pour rester dans le groupe des pages de carte.
  const positions = await prisma.navItem.findUnique({ where: { navKey: 'clan.positions' } })
  const sortOrder = (positions?.sortOrder ?? 0) + 1

  const item = await prisma.navItem.upsert({
    where: { navKey: 'clan.zone-closures' },
    update: NAV_ITEM,
    create: { navKey: 'clan.zone-closures', ...NAV_ITEM, sortOrder },
  })

  console.info('[SeedNav] clan.zone-closures', {
    role: item.roleOverride ?? item.defaultRole,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
  })
}

main()
  .catch((error) => {
    console.error('[SeedNav] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
