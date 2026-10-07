/**
 * Nettoie les menus d'administration — docs/TODO/administration.md §6, lot 2.
 *
 * - supprime les doublons et les liens morts (`owner.nav-permissions`, `owner.switch-clan`,
 *   `superuser.switch-clan`, `admin.weapon-categories`, `clan.reports`, `clan.items`) ;
 * - crée `primary.mortar`, `primary.resources`, `primary.zone-reading`, écrits en dur dans la barre latérale ;
 * - aligne les libellés de base francisés sur le registre (et efface une surcharge devenue identique) ;
 * - lots 3a et 3b : crée `superuser.players`, `superuser.privacy-requests`, `superuser.delegation`, et suit les nouvelles adresses des pages
 *   Plateforme déplacées (`/settings/clans`, `/settings/clans/lifecycle`, `/settings/database`, `/settings/telemetry`).
 *
 * Simulation par défaut : affiche le plan sans rien écrire. Idempotent : relancé, il ne trouve plus rien à faire.
 * Les rôles `admin` restants sont traités par scripts/remove-admin-moderator-roles.ts.
 *
 * Usage :
 *   npx tsx scripts/cleanup-admin-nav.ts            # simulation
 *   npx tsx scripts/cleanup-admin-nav.ts --apply    # écriture
 */
import 'dotenv/config'

import { isEmptyNavCleanupPlan, planNavCleanup } from '../src/lib/admin-nav-cleanup'
import { NAV_REGISTRY } from '../src/lib/nav-permissions-registry'
import { NAV_GUARD_KEYS } from '../src/lib/nav-permissions-service'
import { prisma } from '../src/lib/prisma'

async function main() {
  const apply = process.argv.includes('--apply')

  const rows = await prisma.navItem.findMany({
    select: {
      navKey: true,
      section: true,
      label: true,
      hrefTemplate: true,
      defaultRole: true,
      description: true,
      sortOrder: true,
      labelOverride: true,
    },
  })
  const plan = planNavCleanup(rows, NAV_REGISTRY)

  const guarded = plan.deletes.filter((navKey) => (NAV_GUARD_KEYS as readonly string[]).includes(navKey))
  if (guarded.length > 0) {
    throw new Error(`Refus : ces clés protègent des routes d'API, les supprimer les rendrait publiques : ${guarded.join(', ')}`)
  }

  console.info(`[cleanup-admin-nav] ${rows.length} entrées en base`)
  console.info('  À supprimer :', plan.deletes.length ? plan.deletes.join(', ') : 'aucune')
  console.info('  À créer     :', plan.creates.length ? plan.creates.map((item) => item.navKey).join(', ') : 'aucune')
  for (const update of plan.labelUpdates) {
    console.info(`  Libellé     : ${update.navKey} « ${update.from} » → « ${update.to} »${update.clearOverride ? ' (surcharge effacée)' : ''}`)
  }
  for (const update of plan.hrefUpdates) {
    console.info(`  Adresse     : ${update.navKey} ${update.from} → ${update.to}`)
  }

  if (isEmptyNavCleanupPlan(plan)) {
    console.info('[cleanup-admin-nav] Rien à faire.')
    return
  }
  if (!apply) {
    console.info('[cleanup-admin-nav] Simulation : relancer avec --apply pour écrire.')
    return
  }

  await prisma.$transaction([
    prisma.navItem.deleteMany({ where: { navKey: { in: plan.deletes } } }),
    ...plan.creates.map((item) =>
      prisma.navItem.create({
        data: {
          navKey: item.navKey,
          section: item.section,
          label: item.label,
          hrefTemplate: item.hrefTemplate,
          defaultRole: item.defaultRole,
          description: item.description,
          sortOrder: item.sortOrder,
          isActive: true,
        },
      })
    ),
    ...plan.labelUpdates.map((update) =>
      prisma.navItem.update({
        where: { navKey: update.navKey },
        data: { label: update.to, ...(update.clearOverride ? { labelOverride: null } : {}) },
      })
    ),
    ...plan.hrefUpdates.map((update) =>
      prisma.navItem.update({ where: { navKey: update.navKey }, data: { hrefTemplate: update.to } })
    ),
  ])
  console.info('[cleanup-admin-nav] Écrit.')
}

main()
  .catch((error) => {
    console.error('[cleanup-admin-nav] échec', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
