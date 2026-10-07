/**
 * Quatre profils — docs/TODO/administration.md §5.3, lot 2 : supprime les rôles de clan Admin et Moderator et
 * passe à `owner` les entrées de menu encore en `admin`.
 *
 * À LANCER SEULEMENT UNE FOIS LE CODE DES QUATRE PROFILS EN PRODUCTION : l'ancien `initializeDefaultRoles`
 * recréait ces rôles au premier appel. Refuse d'écrire si un de ces rôles est encore attribué (recompté dans la
 * transaction). Simulation par défaut ; idempotent.
 *
 * Usage :
 *   npx tsx scripts/remove-admin-moderator-roles.ts            # simulation
 *   npx tsx scripts/remove-admin-moderator-roles.ts --apply    # écriture
 */
import 'dotenv/config'

import { LEGACY_CLAN_ROLE_NAMES, planAdminRoleCleanup } from '../src/lib/admin-roles-cleanup'
import { prisma } from '../src/lib/prisma'

async function readState() {
  const [roles, navRows] = await Promise.all([
    prisma.clanRole.findMany({
      where: { name: { in: [...LEGACY_CLAN_ROLE_NAMES] } },
      select: { id: true, clanId: true, name: true, _count: { select: { members: true } } },
      orderBy: [{ clanId: 'asc' }, { name: 'asc' }],
    }),
    prisma.navItem.findMany({
      where: { OR: [{ defaultRole: 'admin' }, { roleOverride: 'admin' }] },
      select: { navKey: true, defaultRole: true, roleOverride: true },
    }),
  ])
  const legacyRoles = roles.map((role) => ({
    id: role.id,
    clanId: role.clanId,
    name: role.name,
    assignmentCount: role._count.members,
  }))
  return planAdminRoleCleanup(legacyRoles, navRows)
}

async function main() {
  const apply = process.argv.includes('--apply')
  const plan = await readState()

  console.info(`[remove-admin-moderator-roles] Rôles Admin/Moderator en base : ${plan.roleIdsToDelete.length}`)
  for (const blocker of plan.blockers) {
    console.info(`  ATTRIBUÉ : rôle ${blocker.name} du clan ${blocker.clanId} (${blocker.assignmentCount} membre(s))`)
  }
  for (const fix of plan.navRoleFixes) {
    console.info(`  Menu : ${fix.navKey} → défaut ${fix.defaultRole}, surcharge ${fix.roleOverride ?? 'aucune'}`)
  }

  if (plan.blockers.length > 0) {
    console.error('[remove-admin-moderator-roles] Refus : des membres portent encore ces rôles. Les passer Owner ou Member d’abord.')
    process.exitCode = 1
    return
  }
  if (plan.roleIdsToDelete.length === 0 && plan.navRoleFixes.length === 0) {
    console.info('[remove-admin-moderator-roles] Rien à faire.')
    return
  }
  if (!apply) {
    console.info('[remove-admin-moderator-roles] Simulation : relancer avec --apply pour écrire.')
    return
  }

  await prisma.$transaction(async (tx) => {
    // Recompte juste avant d'écrire : une attribution faite entre-temps annule tout
    const assigned = await tx.clanMemberRole.count({ where: { roleId: { in: plan.roleIdsToDelete } } })
    if (assigned > 0) {
      throw new Error(`${assigned} attribution(s) apparue(s) depuis la lecture : rien n'est écrit`)
    }
    for (const fix of plan.navRoleFixes) {
      await tx.navItem.update({
        where: { navKey: fix.navKey },
        data: { defaultRole: fix.defaultRole, roleOverride: fix.roleOverride },
      })
    }
    await tx.clanRole.deleteMany({ where: { id: { in: plan.roleIdsToDelete } } })
  })
  console.info('[remove-admin-moderator-roles] Écrit.')
}

main()
  .catch((error) => {
    console.error('[remove-admin-moderator-roles] échec', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
