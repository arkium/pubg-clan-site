import { prisma } from '@/lib/prisma'

/**
 * Miroir « adversaire » de l'appartenance de clan d'un compte PUBG.
 *
 * Le même fait — « dans quel clan PUBG est ce compte ? » — est stocké à trois
 * endroits que rien ne reliait :
 *
 * 1. `ClanMember.clanId` → `Clan` — le clan suivi sur le site, écrit par le cycle
 *    de vie (cron d'appartenance, promotion depuis `Ungrouped`, transfert manuel,
 *    annulation).
 * 2. `Player.opponentClanId` → `OpponentClan` — l'identité globale, écrite par la
 *    résolution des joueurs croisés.
 * 3. `EncounteredPlayer.pubgClanId/Tag/Name` — une copie par clan suivi ayant
 *    croisé ce compte.
 *
 * Quand un joueur changeait de clan, seul (1) bougeait. (2) et (3) restaient figés
 * sur l'ancien clan, et comme `Player.clanResolvedAt` était repoussé à chaque
 * rencontre sans que `opponentClanId` soit réécrit, la fenêtre de fraîcheur de
 * 7 jours n'expirait jamais : le décalage devenait permanent. Symptôme constaté le
 * 2026-09-22 : WESTEN88, promu de `UNG` vers `47R`, restait listé comme
 * « candidat détecté » de BOFTEAM sur `/settings/opponents`.
 *
 * Ce module est le point unique par lequel (2) et (3) sont réalignés sur (1).
 *
 * Règle : le clan suivi fait autorité. Si le clan suivi n'a pas de `pubgClanId`
 * (cas du parking `Ungrouped`), le compte n'a pas de clan PUBG et le miroir est
 * remis à `null` — ce n'est pas une absence d'information, c'est l'information.
 *
 * Voir `docs/features/cycle-de-vie-clan.md` §11.
 */

export type TrackedClanIdentity = {
  pubgClanId: string | null
  tag: string | null
  name: string | null
}

export type SyncOpponentIdentityInput = {
  pubgAccountId: string | null
  platformShard: string
  /** Renseigné uniquement pour créer une ligne `Player` absente. */
  pubgPlayerName?: string | null
  /** Clan suivi qui fait autorité, ou `null` si le membre n'est plus rattaché. */
  clan: TrackedClanIdentity | null
}

export type SyncOpponentIdentityResult = {
  playerId: string
  opponentClanId: string | null
  encounteredRowsUpdated: number
}

/**
 * Réaligne `Player` et `EncounteredPlayer` sur le clan suivi passé en argument.
 *
 * Renvoie `null` si le compte PUBG est inconnu (rien à réaligner).
 */
export async function syncOpponentIdentityForMember(
  input: SyncOpponentIdentityInput
): Promise<SyncOpponentIdentityResult | null> {
  const { pubgAccountId, platformShard, clan } = input
  if (!pubgAccountId) return null

  const now = new Date()
  const hasPubgClan = Boolean(clan?.pubgClanId)
  let opponentClanId: string | null = null

  if (clan?.pubgClanId) {
    const opponentClan = await prisma.opponentClan.upsert({
      where: {
        pubgClanId_platformShard: { pubgClanId: clan.pubgClanId, platformShard },
      },
      update: { tag: clan.tag ?? null, name: clan.name ?? null, resolvedAt: now },
      create: {
        pubgClanId: clan.pubgClanId,
        platformShard,
        tag: clan.tag ?? null,
        name: clan.name ?? null,
        resolvedAt: now,
      },
    })
    opponentClanId = opponentClan.id
  }

  const player = await prisma.player.upsert({
    where: { pubgAccountId_platformShard: { pubgAccountId, platformShard } },
    update: {
      opponentClanId,
      clanResolvedAt: now,
      ...(input.pubgPlayerName ? { pubgPlayerName: input.pubgPlayerName } : {}),
    },
    create: {
      pubgAccountId,
      platformShard,
      pubgPlayerName: input.pubgPlayerName ?? pubgAccountId,
      opponentClanId,
      clanResolvedAt: now,
    },
  })

  // Toutes les lignes du compte, pas seulement celles d'un clan : un compte a une
  // seule appartenance, quel que soit le nombre de clans suivis qui l'ont croisé
  // (même règle que `resolveOneEncounteredPlayerCandidate`).
  const { count } = await prisma.encounteredPlayer.updateMany({
    where: { pubgAccountId, platformShard },
    data: {
      playerId: player.id,
      clanResolvedAt: now,
      pubgClanId: hasPubgClan ? clan!.pubgClanId : null,
      pubgClanTag: hasPubgClan ? clan!.tag ?? null : null,
      pubgClanName: hasPubgClan ? clan!.name ?? null : null,
    },
  })

  return { playerId: player.id, opponentClanId, encounteredRowsUpdated: count }
}

/**
 * Variante « après mouvement » : recharge le membre pour lire son clan courant.
 *
 * À appeler **après** la transaction qui déplace le membre, jamais dedans : le
 * miroir est un cache de lecture, pas une trace d'audit. Un échec ici ne doit
 * pas annuler un mouvement déjà décidé — il est donc journalisé, pas propagé.
 */
export async function syncOpponentIdentityForMemberId(memberId: number): Promise<void> {
  try {
    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: {
        pubgAccountId: true,
        pubgPlayerName: true,
        platformShard: true,
        isActive: true,
        clan: { select: { pubgClanId: true, tag: true, name: true } },
      },
    })

    if (!member?.pubgAccountId) return

    await syncOpponentIdentityForMember({
      pubgAccountId: member.pubgAccountId,
      platformShard: member.platformShard,
      pubgPlayerName: member.pubgPlayerName,
      // Un membre désactivé n'est plus rattaché à un clan suivi : son clan PUBG
      // redevient inconnu et sera re-résolu par le cron des joueurs croisés.
      clan: member.isActive ? member.clan : null,
    })
  } catch (error) {
    console.warn(
      '[PlayerClanIdentity] Miroir adversaire non réaligné pour le membre',
      memberId,
      error instanceof Error ? error.message : error
    )
  }
}
