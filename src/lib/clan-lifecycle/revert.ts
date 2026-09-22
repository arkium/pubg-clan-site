import { prisma } from '@/lib/prisma'
import {
  PLAYER_CLAN_CHANGE_SOURCES,
  PLAYER_CLAN_CHANGE_STATUSES,
  recordPlayerClanChange,
} from '@/lib/player-clan-change'
import { syncOpponentIdentityForMemberId } from '@/lib/player-clan-identity'

/**
 * Annulation d'un mouvement — garde-fou **E** de « Sûreté d'exécution ».
 *
 * Trois règles, toutes destinées à empêcher une annulation de restaurer un état faux :
 *
 *  1. **Seul le dernier mouvement appliqué d'un membre est annulable.** Si un joueur
 *     a fait A→B puis B→UNG, annuler le premier le renverrait dans A alors qu'il est
 *     dans UNG : on écraserait un mouvement plus récent.
 *  2. **L'état courant doit correspondre.** Si le `clanId` du membre n'est plus celui
 *     que l'événement a posé, c'est que quelque chose d'autre est passé entre-temps —
 *     on refuse plutôt que de deviner.
 *  3. **Rien n'est effacé.** L'annulation écrit une ligne inverse (`manual_revert`)
 *     et marque l'originale `reverted`. Le journal reste un journal.
 */

export type RevertRefusalReason =
  | 'not_found'
  | 'not_applied'
  | 'superseded'
  | 'state_mismatch'
  | 'member_missing'
  | 'no_previous_clan'

export type RevertOutcome =
  | { ok: true; memberId: number; memberName: string; restoredClanId: number }
  | { ok: false; reason: RevertRefusalReason; detail: string }

export async function revertPlayerClanChange(
  changeId: string,
  triggeredByUserId?: number | null
): Promise<RevertOutcome> {
  const change = await prisma.playerClanChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      status: true,
      clanMemberId: true,
      pubgAccountId: true,
      platformShard: true,
      previousClanId: true,
      previousPubgClanId: true,
      previousPubgClanTag: true,
      newClanId: true,
      newPubgClanId: true,
      newPubgClanTag: true,
      appliedAt: true,
      detectedAt: true,
      clanMember: { select: { id: true, displayName: true, clanId: true, isActive: true } },
    },
  })

  if (!change) {
    return { ok: false, reason: 'not_found', detail: "Ce mouvement n'existe pas." }
  }

  if (change.status !== PLAYER_CLAN_CHANGE_STATUSES.applied) {
    return {
      ok: false,
      reason: 'not_applied',
      detail: `Seul un mouvement appliqué peut être annulé (statut actuel : ${change.status}).`,
    }
  }

  const member = change.clanMember
  if (!member || !member.isActive || !change.clanMemberId) {
    return {
      ok: false,
      reason: 'member_missing',
      detail: "Le membre concerné n'est plus suivi.",
    }
  }

  if (change.previousClanId === null) {
    return {
      ok: false,
      reason: 'no_previous_clan',
      detail: "Ce mouvement n'a pas de clan d'origine connu : rien à restaurer.",
    }
  }

  // Regle 1 : un mouvement plus recent a-t-il eu lieu depuis ?
  const newer = await prisma.playerClanChange.findFirst({
    where: {
      clanMemberId: change.clanMemberId,
      status: PLAYER_CLAN_CHANGE_STATUSES.applied,
      id: { not: change.id },
      detectedAt: { gt: change.detectedAt },
    },
    select: { id: true, detectedAt: true },
    orderBy: { detectedAt: 'desc' },
  })

  if (newer) {
    return {
      ok: false,
      reason: 'superseded',
      detail:
        'Un mouvement plus récent existe pour ce membre : annulez-le d’abord, sinon celui-ci écraserait ' +
        'un état plus à jour.',
    }
  }

  // Regle 2 : l'etat courant correspond-il encore a ce que ce mouvement a pose ?
  if (member.clanId !== change.newClanId) {
    return {
      ok: false,
      reason: 'state_mismatch',
      detail:
        "Le clan actuel du membre ne correspond plus à ce mouvement — il a été déplacé autrement depuis.",
    }
  }

  const restoredClanId = change.previousClanId

  // Regle 3 : on ecrit, on n'efface pas. Mouvement et traces dans la meme transaction.
  await prisma.$transaction(async (tx) => {
    await tx.clanMember.update({
      where: { id: member.id },
      data: { clanId: restoredClanId },
    })

    await tx.playerClanChange.update({
      where: { id: change.id },
      data: { status: PLAYER_CLAN_CHANGE_STATUSES.reverted },
    })

    await recordPlayerClanChange(tx, {
      clanMemberId: member.id,
      pubgAccountId: change.pubgAccountId,
      platformShard: change.platformShard,
      // Le mouvement inverse : on repart de la ou le mouvement annule avait mene.
      previousClanId: change.newClanId,
      previousPubgClanId: change.newPubgClanId,
      previousPubgClanTag: change.newPubgClanTag,
      newClanId: restoredClanId,
      newPubgClanId: change.previousPubgClanId,
      newPubgClanTag: change.previousPubgClanTag,
      source: PLAYER_CLAN_CHANGE_SOURCES.manualRevert,
      status: PLAYER_CLAN_CHANGE_STATUSES.applied,
      triggeredByUserId: triggeredByUserId ?? null,
    })
  })

  // Le miroir adversaire suit l'annulation comme il suit le mouvement.
  await syncOpponentIdentityForMemberId(member.id)

  return {
    ok: true,
    memberId: member.id,
    memberName: member.displayName,
    restoredClanId,
  }
}

/**
 * Marque un événement comme relu, sans rien déplacer.
 *
 * Le nom technique reste `acknowledge` (et `acknowledgedAt` en base), mais l'UI dit
 * **« Marquer comme vu »** : « acquitter » venait du vocabulaire de supervision et
 * n'était pas compris à l'usage.
 */
export async function acknowledgePlayerClanChange(changeId: string, userId: number) {
  await prisma.playerClanChange.update({
    where: { id: changeId },
    data: { acknowledgedAt: new Date(), acknowledgedByUserId: userId },
  })
}
