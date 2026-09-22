import { prisma } from '@/lib/prisma'
import {
  PLAYER_CLAN_CHANGE_SOURCES,
  PLAYER_CLAN_CHANGE_STATUSES,
  recordPlayerClanChange,
} from '@/lib/player-clan-change'
import { syncOpponentIdentityForMemberId } from '@/lib/player-clan-identity'

/**
 * Chantier 2 — application des mouvements différés à l'approbation d'un clan.
 *
 * Quand le cron détecte qu'un joueur a rejoint un clan absent de la base, il crée ce
 * clan **inactif** et enregistre le mouvement en `pending` sans déplacer personne :
 * faire entrer un clan dans la ligue reste une décision SuperUser.
 *
 * C'est ici que la décision se matérialise : au moment où le clan est approuvé, les
 * mouvements en attente qui le visaient sont appliqués.
 */

export type AppliedPromotion = {
  memberId: number
  memberName: string
  fromClanId: number | null
}

/**
 * Applique les `PlayerClanChange` en attente pointant vers ce clan.
 * Idempotent : une ligne déjà appliquée n'est plus en `pending`, donc ignorée.
 */
export async function applyPendingPromotionsForClan(
  clanId: number,
  triggeredByUserId?: number | null
): Promise<AppliedPromotion[]> {
  const pending = await prisma.playerClanChange.findMany({
    where: { newClanId: clanId, status: PLAYER_CLAN_CHANGE_STATUSES.pending },
    select: {
      id: true,
      clanMemberId: true,
      pubgAccountId: true,
      platformShard: true,
      previousClanId: true,
      previousPubgClanId: true,
      previousPubgClanTag: true,
      newPubgClanId: true,
      newPubgClanTag: true,
      clanMember: { select: { id: true, displayName: true, clanId: true, isActive: true } },
    },
  })

  const applied: AppliedPromotion[] = []

  for (const row of pending) {
    const member = row.clanMember

    // Le membre a pu être retiré, ou déplacé entre-temps par un autre chemin :
    // on ne force rien, on clôt simplement la ligne devenue caduque.
    if (!member || !member.isActive || member.clanId === clanId) {
      await prisma.playerClanChange.update({
        where: { id: row.id },
        data: { status: PLAYER_CLAN_CHANGE_STATUSES.ignored },
      })
      continue
    }

    // Même règle que partout ailleurs : le mouvement et sa trace ensemble.
    await prisma.$transaction(async (tx) => {
      await tx.clanMember.update({ where: { id: member.id }, data: { clanId } })

      await tx.playerClanChange.update({
        where: { id: row.id },
        data: { status: PLAYER_CLAN_CHANGE_STATUSES.applied, appliedAt: new Date() },
      })

      await recordPlayerClanChange(tx, {
        clanMemberId: member.id,
        pubgAccountId: row.pubgAccountId,
        platformShard: row.platformShard,
        previousClanId: member.clanId,
        newClanId: clanId,
        previousPubgClanId: row.previousPubgClanId,
        previousPubgClanTag: row.previousPubgClanTag,
        newPubgClanId: row.newPubgClanId,
        newPubgClanTag: row.newPubgClanTag,
        source: PLAYER_CLAN_CHANGE_SOURCES.ungroupedPromotion,
        status: PLAYER_CLAN_CHANGE_STATUSES.applied,
        triggeredByUserId: triggeredByUserId ?? null,
      })
    })

    // Après la transaction : réaligne Player/EncounteredPlayer sur le nouveau
    // clan, sinon le joueur reste listé comme candidat de son ancien clan sur
    // `/settings/opponents`.
    await syncOpponentIdentityForMemberId(member.id)

    applied.push({
      memberId: member.id,
      memberName: member.displayName,
      fromClanId: member.clanId,
    })
  }

  return applied
}

/** Nombre de mouvements en attente visant ce clan — pour l'UI de validation. */
export async function countPendingPromotionsForClan(clanId: number) {
  return prisma.playerClanChange.count({
    where: { newClanId: clanId, status: PLAYER_CLAN_CHANGE_STATUSES.pending },
  })
}
