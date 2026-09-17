/**
 * Ajoute les entrées de navigation « Objets consommés » : `clan.items` et `member.items`. Idempotent.
 * La source de vérité des permissions est la table `NavItem` ; le registre TypeScript n'est qu'un repli initial.
 *
 * Usage : npx tsx scripts/seed-item-use-nav.ts
 */
import 'dotenv/config'

import { prisma } from '@/lib/prisma'

const ITEMS = [
  {
    navKey: 'clan.items',
    after: 'clan.positions',
    data: {
      section: 'clan-section',
      label: 'Objets consommés',
      hrefTemplate: '/clans/:clanId/stats/items',
      defaultRole: 'none',
      description: 'Soins, boosts, carburant et gadgets consommés par le clan — API /telemetry/item-use.',
    },
  },
  {
    navKey: 'member.items',
    after: 'member.weapons',
    data: {
      section: 'member-section',
      label: 'Objets consommés',
      hrefTemplate: '/members/:memberId/items',
      defaultRole: 'none',
      description: 'Soins, boosts, carburant et gadgets consommés par le membre — API /members/[id]/item-use.',
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
