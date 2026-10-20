import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

/**
 * Rattachement d'une fiche `ClanMember` à l'identité globale `Player` (docs/TODO/inventaire-2026-10-20.md §2.A).
 *
 * À la différence de `syncOpponentIdentityForMemberId` (src/lib/player-clan-identity.ts), ce lien ne touche **jamais**
 * au clan PUBG du joueur (`Player.opponentClanId`, `clanResolvedAt`, `EncounteredPlayer`) : il convient donc aussi à
 * une demande `/join` en attente, dont le clan n'est pas encore décidé. Il ne remplace pas un lien existant.
 */

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/** Ligne `Player` du compte, créée si besoin, sans clan ; `null` sans compte PUBG. */
async function findOrCreatePlayer(input: { pubgAccountId: string; platformShard: string; pubgPlayerName: string }) {
  const key = { pubgAccountId_platformShard: { pubgAccountId: input.pubgAccountId, platformShard: input.platformShard } }
  const existing = await prisma.player.findUnique({ where: key, select: { id: true } })
  if (existing) return existing.id

  try {
    const created = await prisma.player.create({
      data: {
        pubgAccountId: input.pubgAccountId,
        platformShard: input.platformShard,
        pubgPlayerName: input.pubgPlayerName || input.pubgAccountId,
      },
      select: { id: true },
    })
    return created.id
  } catch (error) {
    // Créée entre-temps par un autre écrivain (synchronisation des matchs, recherche de pseudo) : on la relit.
    if (!isUniqueViolation(error)) throw error
    const raced = await prisma.player.findUnique({ where: key, select: { id: true } })
    return raced?.id ?? null
  }
}

/** Pose `ClanMember.playerId` si absent. Renvoie l'identifiant `Player`, ou `null` (pas de compte PUBG connu). */
export async function linkMemberToPlayer(memberId: number): Promise<string | null> {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
    select: { playerId: true, pubgAccountId: true, platformShard: true, pubgPlayerName: true },
  })
  if (!member?.pubgAccountId) return null
  if (member.playerId) return member.playerId

  const playerId = await findOrCreatePlayer({
    pubgAccountId: member.pubgAccountId,
    platformShard: member.platformShard,
    pubgPlayerName: member.pubgPlayerName,
  })
  if (!playerId) return null

  // Conditionnel : un lien posé entre-temps n'est pas écrasé.
  await prisma.clanMember.updateMany({ where: { id: memberId, playerId: null }, data: { playerId } })
  return playerId
}

/**
 * Variante des routes : un échec du lien ne doit jamais faire échouer l'inscription, l'ajout ou la validation qui
 * l'appelle — l'annuaire retombe sur le compte PUBG en attendant (src/lib/players-directory.ts).
 */
export async function ensurePlayerLinkForMember(memberId: number): Promise<void> {
  try {
    await linkMemberToPlayer(memberId)
  } catch (error) {
    console.warn(
      '[MemberPlayerLink] Lien ClanMember → Player non posé',
      memberId,
      error instanceof Error ? error.message : error
    )
  }
}
