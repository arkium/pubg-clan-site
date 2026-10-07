/**
 * Quatre profils (docs/TODO/administration.md §5.3, lot 2) — calcul pur, appliqué par
 * `scripts/remove-admin-moderator-roles.ts` (simulation par défaut, `--apply` pour écrire).
 *
 * À lancer seulement une fois le code des quatre profils en production : l'ancien `initializeDefaultRoles`
 * recréait les rôles Admin et Moderator à chaque appel.
 */

export const LEGACY_CLAN_ROLE_NAMES = ['Admin', 'Moderator'] as const

export type LegacyClanRole = { id: number; clanId: number; name: string; assignmentCount: number }
export type NavRoleRow = { navKey: string; defaultRole: string; roleOverride: string | null }

export type AdminRoleCleanupPlan = {
  /** Rôles encore attribués : le script refuse d'écrire tant qu'il en reste. */
  blockers: LegacyClanRole[]
  roleIdsToDelete: number[]
  navRoleFixes: Array<{ navKey: string; defaultRole: string; roleOverride: string | null }>
}

export function planAdminRoleCleanup(
  legacyRoles: readonly LegacyClanRole[],
  navRows: readonly NavRoleRow[]
): AdminRoleCleanupPlan {
  const blockers = legacyRoles.filter((role) => role.assignmentCount > 0)

  const navRoleFixes: AdminRoleCleanupPlan['navRoleFixes'] = []
  for (const row of navRows) {
    if (row.defaultRole !== 'admin' && row.roleOverride !== 'admin') continue
    const defaultRole = row.defaultRole === 'admin' ? 'owner' : row.defaultRole
    const override = row.roleOverride === 'admin' ? 'owner' : row.roleOverride
    navRoleFixes.push({ navKey: row.navKey, defaultRole, roleOverride: override === defaultRole ? null : override })
  }

  return {
    blockers,
    roleIdsToDelete: legacyRoles.map((role) => role.id),
    navRoleFixes,
  }
}
