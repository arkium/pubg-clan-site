import type { Prisma } from '@prisma/client'

import { assignDefaultMemberRole } from '@/lib/role-service'

/**
 * Rôles d'un membre qui change de clan — règle du 2026-11-09 : **il redevient simple Membre**, un Owner compris.
 *
 * Les permissions réunissent tous les rôles d'un membre sans regarder à quel clan ils appartiennent
 * (`resolveMemberPermissionState` et `hasAnyRole`, `role-service.ts`) : un rôle gardé de l'ancien clan donne ses droits
 * dans le nouveau. Avant cette règle, la synchronisation de nuit déplaçait les joueurs sans toucher à leurs rôles, et un
 * ancien Owner passait les gardes Owner de son nouveau clan (5 cas en production le 2026-11-09).
 *
 * Tout chemin qui change `ClanMember.clanId` appelle `clearRolesForClanChange` dans la transaction du mouvement, puis
 * `assignMemberRoleAfterClanChange` une fois la transaction écrite — contrôle statique dans `member-clan-roles.test.ts`.
 */

export async function clearRolesForClanChange(tx: Prisma.TransactionClient, memberIds: number[]) {
  if (memberIds.length === 0) return
  await tx.clanMemberRole.deleteMany({ where: { memberId: { in: memberIds } } })
}

/**
 * Rôle Membre du nouveau clan. Hors transaction : `assignDefaultMemberRole` passe par le client global. Un échec ne
 * défait pas le mouvement déjà écrit ni n'interrompt un passage de nuit : la liste des membres du clan
 * (`GET /api/clans/[clanId]/members`) repose le rôle manquant à sa prochaine lecture.
 */
export async function assignMemberRoleAfterClanChange(memberId: number, clanId: number) {
  try {
    await assignDefaultMemberRole(memberId, clanId)
  } catch (error) {
    console.warn(
      '[member-clan-roles] Rôle Membre non posé après un changement de clan',
      { memberId, clanId },
      error instanceof Error ? error.message : error
    )
  }
}
