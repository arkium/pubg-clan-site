/**
 * Nettoie les menus d'administration — docs/TODO/administration.md §6, lot 2.
 *
 * - supprime les doublons et les liens morts (`owner.nav-permissions`, `owner.switch-clan`,
 *   `superuser.switch-clan`, `admin.weapon-categories`, `clan.reports`, `clan.items`) ;
 * - crée `primary.mortar`, `primary.resources`, `primary.zone-reading`, écrits en dur dans la barre latérale ;
 * - aligne les libellés de base francisés sur le registre (et efface une surcharge devenue identique) ;
 * - lots 3a et 3b : crée `superuser.players`, `superuser.privacy-requests`, `superuser.delegation`, et suit les nouvelles adresses des pages
 *   Plateforme déplacées (`/settings/clans`, `/settings/clans/lifecycle`, `/settings/database`, `/settings/telemetry`) ;
 * - lot 3b : place « Adversaires rencontrés » dans les statistiques du clan (rôle membre, surcharges effacées) ;
 * - §8 (2026-10-11) : supprime les cinq cartes `owner.telemetry-*`, crée `superuser.clan-data` (seule carte « Dépannage
 *   du clan sélectionné ») et renomme en `superuser.*` les clés `owner.*` réservées au SuperUser, surcharges conservées ;
 * - page Cartes du clan (2026-10-23) : `clan.heatmap-kills` prend le libellé « Cartes », l'adresse `/stats/maps` et perd
 *   sa surcharge « SuperUser » (ouverte aux visiteurs).
 *
 * Simulation par défaut : affiche le plan sans rien écrire. Avec `--apply`, affiche le plan puis demande de taper « oui »
 * (terminal interactif obligatoire) avant d'écrire, en une seule transaction. Idempotent : relancé, il ne trouve plus
 * rien à faire. Les rôles `admin` restants sont traités par scripts/remove-admin-moderator-roles.ts.
 *
 * Usage :
 *   npx tsx scripts/cleanup-admin-nav.ts            # simulation
 *   npx tsx scripts/cleanup-admin-nav.ts --apply    # plan, confirmation, écriture
 */
import 'dotenv/config'

import { createInterface } from 'node:readline/promises'

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
      roleOverride: true,
      sectionOverride: true,
    },
  })
  const plan = planNavCleanup(rows, NAV_REGISTRY)

  const guarded = plan.deletes.filter((navKey) => (NAV_GUARD_KEYS as readonly string[]).includes(navKey))
  if (guarded.length > 0) {
    throw new Error(`Refus : ces clés protègent des routes d'API, les supprimer les rendrait publiques : ${guarded.join(', ')}`)
  }

  console.info(`[cleanup-admin-nav] ${rows.length} entrées en base`)
  console.info('  À supprimer :', plan.deletes.length ? plan.deletes.join(', ') : 'aucune')
  for (const rename of plan.renames) {
    const cleared = [rename.clearSectionOverride ? 'section' : null, rename.clearRoleOverride ? 'rôle' : null].filter(Boolean)
    const note = cleared.length ? `, surcharge de ${cleared.join(' et ')} effacée (identique)` : ''
    console.info(`  Renommée    : ${rename.from} → ${rename.to} (${rename.section}, rôle ${rename.defaultRole}${note})`)
  }
  console.info('  À créer     :', plan.creates.length ? plan.creates.map((item) => item.navKey).join(', ') : 'aucune')
  for (const update of plan.labelUpdates) {
    console.info(`  Libellé     : ${update.navKey} « ${update.from} » → « ${update.to} »${update.clearOverride ? ' (surcharge effacée)' : ''}`)
  }
  for (const update of plan.hrefUpdates) {
    console.info(`  Adresse     : ${update.navKey} ${update.from} → ${update.to}`)
  }
  for (const reset of plan.resets) {
    console.info(`  Déplacée    : ${reset.navKey} → ${reset.section}, ${reset.hrefTemplate}, rôle ${reset.defaultRole} (surcharges effacées)`)
  }

  if (isEmptyNavCleanupPlan(plan)) {
    console.info('[cleanup-admin-nav] Rien à faire.')
    return
  }
  if (!apply) {
    console.info('[cleanup-admin-nav] Simulation : relancer avec --apply pour écrire.')
    return
  }
  if (!(await confirm())) {
    console.info('[cleanup-admin-nav] Annulé : rien n’a été écrit.')
    return
  }

  await prisma.$transaction([
    prisma.navItem.deleteMany({ where: { navKey: { in: plan.deletes } } }),
    // Avant les libellés : ils visent les nouvelles clés.
    ...plan.renames.map((rename) =>
      prisma.navItem.update({
        where: { navKey: rename.from },
        data: {
          navKey: rename.to,
          section: rename.section,
          defaultRole: rename.defaultRole,
          ...(rename.clearSectionOverride ? { sectionOverride: null } : {}),
          ...(rename.clearRoleOverride ? { roleOverride: null } : {}),
        },
      })
    ),
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
    ...plan.resets.map((reset) =>
      prisma.navItem.update({
        where: { navKey: reset.navKey },
        data: {
          section: reset.section,
          hrefTemplate: reset.hrefTemplate,
          defaultRole: reset.defaultRole,
          roleOverride: null,
          sectionOverride: null,
        },
      })
    ),
  ])
  console.info('[cleanup-admin-nav] Écrit.')
}

/** Confirmation au clavier : « oui » écrit, toute autre réponse annule. Jamais d'écriture sans terminal. */
async function confirm() {
  if (!process.stdin.isTTY) {
    console.error('[cleanup-admin-nav] Confirmation impossible sans terminal interactif : rien n’a été écrit.')
    return false
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await prompt.question('Écrire ces modifications dans la base ? Tapez « oui » pour confirmer : ')
    return answer.trim().toLowerCase() === 'oui'
  } finally {
    prompt.close()
  }
}

main()
  .catch((error) => {
    console.error('[cleanup-admin-nav] échec', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
