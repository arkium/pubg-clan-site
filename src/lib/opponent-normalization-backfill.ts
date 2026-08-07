import { prisma } from '@/lib/prisma'

/**
 * Peuple Player/OpponentClan/ClanEncounter à partir des lignes EncounteredPlayer
 * existantes. Idempotent — ré-exécutable sans dupliquer (upserts sur les mêmes
 * clés uniques que le dual-write de captureEncounteredPlayers/resolveEncounteredPlayerClans).
 *
 * Tri par lastSeenAt croissant : quand un même joueur a été croisé par plusieurs
 * clans suivis, la dernière ligne traitée (la plus récente) l'emporte sur
 * Player.pubgPlayerName/clanResolvedAt — approche suffisante pour un backfill
 * ponctuel, pas une garantie de fraîcheur absolue si `limit` tronque l'historique
 * d'un même compte.
 */
export async function backfillOpponentNormalization(
  input: { clanId?: number; limit?: number } = {}
) {
  const limit = Math.max(1, Math.min(input.limit ?? 10_000, 100_000))

  const rows = await prisma.encounteredPlayer.findMany({
    where: input.clanId ? { clanId: input.clanId } : undefined,
    orderBy: { lastSeenAt: 'asc' },
    take: limit,
  })

  let encountersUpserted = 0

  for (const row of rows) {
    let opponentClanId: string | null = null

    if (row.pubgClanId) {
      const opponentClan = await prisma.opponentClan.upsert({
        where: {
          pubgClanId_platformShard: { pubgClanId: row.pubgClanId, platformShard: row.platformShard },
        },
        update: {
          tag: row.pubgClanTag,
          name: row.pubgClanName,
          resolvedAt: row.clanResolvedAt ?? new Date(),
        },
        create: {
          pubgClanId: row.pubgClanId,
          platformShard: row.platformShard,
          tag: row.pubgClanTag,
          name: row.pubgClanName,
          resolvedAt: row.clanResolvedAt ?? new Date(),
        },
      })
      opponentClanId = opponentClan.id
    }

    const player = await prisma.player.upsert({
      where: {
        pubgAccountId_platformShard: { pubgAccountId: row.pubgAccountId, platformShard: row.platformShard },
      },
      update: {
        pubgPlayerName: row.pubgPlayerName,
        lastSeenAt: row.lastSeenAt,
        ...(row.clanResolvedAt ? { opponentClanId, clanResolvedAt: row.clanResolvedAt } : {}),
      },
      create: {
        pubgAccountId: row.pubgAccountId,
        platformShard: row.platformShard,
        pubgPlayerName: row.pubgPlayerName,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        opponentClanId,
        clanResolvedAt: row.clanResolvedAt,
        resolveAttempts: row.resolveAttempts,
      },
    })

    await prisma.clanEncounter.upsert({
      where: { clanId_playerId: { clanId: row.clanId, playerId: player.id } },
      update: {
        encounterCount: row.encounterCount,
        teammateEncounterCount: row.teammateEncounterCount,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
      },
      create: {
        clanId: row.clanId,
        playerId: player.id,
        encounterCount: row.encounterCount,
        teammateEncounterCount: row.teammateEncounterCount,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
      },
    })

    encountersUpserted += 1
  }

  const [playerCount, opponentClanCount, encounterCount] = await Promise.all([
    prisma.player.count(),
    prisma.opponentClan.count(),
    prisma.clanEncounter.count(),
  ])

  return {
    sourceRows: rows.length,
    encountersUpserted,
    playerCount,
    opponentClanCount,
    encounterCount,
  }
}
