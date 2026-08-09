import 'server-only'

import { PLAYER_CLAN_RESOLUTION_FRESHNESS_DAYS } from '@/lib/encountered-player-resolution-constants'
import { prisma } from '@/lib/prisma'
import { fetchPlayerClan, type PubgApiCallContext } from '@/lib/pubg'

export type ResolveOneCandidateInput = {
  pubgAccountId: string
  platformShard: string
  pubgPlayerName: string
}

export type ResolveOneCandidateResult = {
  updatedRowCount: number
} & (
  | { outcome: 'cache_hit'; pubgClanId: string | null; pubgClanTag: string | null; pubgClanName: string | null }
  | { outcome: 'resolved_with_clan'; pubgClanId: string; pubgClanTag: string | null; pubgClanName: string | null }
  | { outcome: 'resolved_without_clan' }
  | { outcome: 'failed'; error: unknown }
)

export type PrioritizedIdentityCandidate = {
  pubgAccountId: string
  platformShard: string
  pubgPlayerName: string
  distinctClanCount: number
  totalEncounterCount: number
  lastSeenAt: Date
}

// Sélectionne les identités globales (pubgAccountId+platformShard) non
// résolues et éligibles, priorisées par distinctClanCount DESC puis
// totalEncounterCount DESC puis lastSeenAt DESC — un joueur croisé par
// plusieurs clans suivis retire plusieurs lignes EncounteredPlayer du backlog
// pour un seul appel PUBG une fois résolu (voir docs/TODO/todo.md, section
// "Priorisation cross-clan"). @@unique([clanId, pubgAccountId]) garantit
// qu'une identité n'apparaît jamais deux fois pour un même clan, donc le
// nombre de lignes du groupe = le nombre de clans distincts qui l'ont croisé.
export async function selectPrioritizedEncounteredPlayerIdentities(
  batchSize: number,
  thresholds: { minEncounters: number; maxAttempts: number }
): Promise<PrioritizedIdentityCandidate[]> {
  const groups = await prisma.encounteredPlayer.groupBy({
    by: ['pubgAccountId', 'platformShard'],
    where: {
      clanResolvedAt: null,
      encounterCount: { gte: thresholds.minEncounters },
      resolveAttempts: { lt: thresholds.maxAttempts },
    },
    _count: { clanId: true },
    _sum: { encounterCount: true },
    _max: { lastSeenAt: true },
    orderBy: [
      { _count: { clanId: 'desc' } },
      { _sum: { encounterCount: 'desc' } },
      { _max: { lastSeenAt: 'desc' } },
    ],
    take: batchSize,
  })

  if (groups.length === 0) {
    return []
  }

  // groupBy ne renvoie pas pubgPlayerName (non groupé) — une ligne
  // représentative par identité suffit pour le nom affiché/stocké.
  const representativeRows = await prisma.encounteredPlayer.findMany({
    where: {
      OR: groups.map((group) => ({
        pubgAccountId: group.pubgAccountId,
        platformShard: group.platformShard,
      })),
    },
    distinct: ['pubgAccountId', 'platformShard'],
    select: { pubgAccountId: true, platformShard: true, pubgPlayerName: true },
  })

  const nameByIdentity = new Map(
    representativeRows.map((row) => [`${row.platformShard}:${row.pubgAccountId}`, row.pubgPlayerName])
  )

  return groups.map((group) => ({
    pubgAccountId: group.pubgAccountId,
    platformShard: group.platformShard,
    pubgPlayerName: nameByIdentity.get(`${group.platformShard}:${group.pubgAccountId}`) ?? '',
    distinctClanCount: group._count.clanId,
    totalEncounterCount: group._sum.encounterCount ?? 0,
    lastSeenAt: group._max.lastSeenAt ?? new Date(0),
  }))
}

// Résout le clan PUBG d'un compte croisé, partagée entre le cron
// (resolveEncounteredPlayerClans) et la résolution manuelle SuperUser — un
// seul appel PUBG par compte, jamais un par clan qui l'a croisé.
//
// Écrit sur TOUTES les lignes EncounteredPlayer de ce compte (tous les clans
// suivis qui l'ont croisé), pas seulement `candidate` : un compte a un seul
// statut de résolution, y compris en cas d'échec (resolveAttempts incrémenté
// partout), pour ne jamais désynchroniser le statut affiché entre deux clans
// qui ont croisé le même adversaire.
export async function resolveOneEncounteredPlayerCandidate(
  candidate: ResolveOneCandidateInput,
  options?: { source?: 'cron' | 'manual' }
): Promise<ResolveOneCandidateResult> {
  const freshnessCutoff = new Date(
    Date.now() - PLAYER_CLAN_RESOLUTION_FRESHNESS_DAYS * 24 * 60 * 60 * 1000
  )

  try {
    const cachedPlayer = await prisma.player.findUnique({
      where: {
        pubgAccountId_platformShard: {
          pubgAccountId: candidate.pubgAccountId,
          platformShard: candidate.platformShard,
        },
      },
      include: { opponentClan: true },
    })

    if (cachedPlayer?.clanResolvedAt && cachedPlayer.clanResolvedAt >= freshnessCutoff) {
      const { count } = await prisma.encounteredPlayer.updateMany({
        where: { pubgAccountId: candidate.pubgAccountId, platformShard: candidate.platformShard },
        data: {
          playerId: cachedPlayer.id,
          clanResolvedAt: new Date(),
          pubgClanId: cachedPlayer.opponentClan?.pubgClanId ?? null,
          pubgClanTag: cachedPlayer.opponentClan?.tag ?? null,
          pubgClanName: cachedPlayer.opponentClan?.name ?? null,
        },
      })

      return {
        outcome: 'cache_hit',
        pubgClanId: cachedPlayer.opponentClan?.pubgClanId ?? null,
        pubgClanTag: cachedPlayer.opponentClan?.tag ?? null,
        pubgClanName: cachedPlayer.opponentClan?.name ?? null,
        updatedRowCount: count,
      }
    }

    const apiContext: PubgApiCallContext = {
      source:
        options?.source === 'manual'
          ? 'encountered-player-resolution-manual'
          : 'encountered-player-resolution-cron',
    }

    const clan = await fetchPlayerClan(candidate.pubgAccountId, candidate.platformShard, apiContext)
    const resolvedAt = new Date()

    let opponentClanId: string | null = null
    if (clan?.id) {
      const opponentClan = await prisma.opponentClan.upsert({
        where: {
          pubgClanId_platformShard: { pubgClanId: clan.id, platformShard: candidate.platformShard },
        },
        update: { tag: clan.tag ?? null, name: clan.name ?? null, resolvedAt },
        create: {
          pubgClanId: clan.id,
          platformShard: candidate.platformShard,
          tag: clan.tag ?? null,
          name: clan.name ?? null,
          resolvedAt,
        },
      })
      opponentClanId = opponentClan.id
    }

    const player = await prisma.player.upsert({
      where: {
        pubgAccountId_platformShard: {
          pubgAccountId: candidate.pubgAccountId,
          platformShard: candidate.platformShard,
        },
      },
      update: { opponentClanId, clanResolvedAt: resolvedAt },
      create: {
        pubgAccountId: candidate.pubgAccountId,
        platformShard: candidate.platformShard,
        pubgPlayerName: candidate.pubgPlayerName,
        opponentClanId,
        clanResolvedAt: resolvedAt,
      },
    })

    const { count } = await prisma.encounteredPlayer.updateMany({
      where: { pubgAccountId: candidate.pubgAccountId, platformShard: candidate.platformShard },
      data: {
        playerId: player.id,
        clanResolvedAt: resolvedAt,
        pubgClanId: clan?.id ?? null,
        pubgClanTag: clan?.tag ?? null,
        pubgClanName: clan?.name ?? null,
      },
    })

    return clan?.id
      ? {
          outcome: 'resolved_with_clan',
          pubgClanId: clan.id,
          pubgClanTag: clan.tag ?? null,
          pubgClanName: clan.name ?? null,
          updatedRowCount: count,
        }
      : { outcome: 'resolved_without_clan', updatedRowCount: count }
  } catch (error) {
    const updatedRowCount = await prisma.encounteredPlayer
      .updateMany({
        where: { pubgAccountId: candidate.pubgAccountId, platformShard: candidate.platformShard },
        data: { resolveAttempts: { increment: 1 } },
      })
      .then((result) => result.count)
      .catch(() => 0)

    return { outcome: 'failed', error, updatedRowCount }
  }
}
