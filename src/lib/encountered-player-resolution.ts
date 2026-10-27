import 'server-only'

import { PLAYER_CLAN_RESOLUTION_FRESHNESS_DAYS } from '@/lib/encountered-player-resolution-constants'
import { prisma } from '@/lib/prisma'
import { syncOpponentIdentityForMember } from '@/lib/player-clan-identity'
import { fetchPlayerClan, type PubgApiCallContext } from '@/lib/pubg'

export type ResolveOneCandidateInput = {
  pubgAccountId: string
  platformShard: string
  pubgPlayerName: string
}

export type ResolveOneCandidateResult =
  | { outcome: 'cache_hit'; pubgClanId: string | null; pubgClanTag: string | null; pubgClanName: string | null }
  | { outcome: 'resolved_with_clan'; pubgClanId: string; pubgClanTag: string | null; pubgClanName: string | null }
  | { outcome: 'resolved_without_clan' }
  | { outcome: 'failed'; error: unknown }

export type PrioritizedIdentityCandidate = {
  pubgAccountId: string
  platformShard: string
  pubgPlayerName: string
  distinctClanCount: number
  totalEncounterCount: number
  lastSeenAt: Date
}

type ResolutionThresholds = { minEncounters: number; maxAttempts: number }

// Sélectionne les identités globales non résolues et éligibles — au moins `minEncounters` rencontres **au total**,
// tous clans suivis confondus (décision du 2026-10-21), moins de `maxAttempts` échecs — priorisées par interactions
// de combat, puis rencontres, puis échecs passés (une relance avant un premier essai à égalité), puis les identités
// les plus récentes.
//
// Fin d'EncounteredPlayer, étape 3 (docs/TODO/inventaire-2026-10-20.md §6) : une ligne `Player` par identité porte
// ses compteurs tous clans (étape 2). L'index `idx_player_resolution_priority` (clanResolvedAt,
// combatInteractionsCount, encounterCount, resolveAttempts) sert le filtre et le tri, lu à rebours : la base s'arrête
// au lot. Il remplace le regroupement des lignes `EncounteredPlayer` (48 s en production), son classement mis en
// cache 6 h et la sélection en deux paliers (2026-09-15). Le nombre de clans suivis qui ont croisé le joueur ne
// départage plus : une identité se résout désormais en une ligne, et ses rencontres dans plusieurs clans pèsent déjà
// dans `encounterCount`.
export async function selectPrioritizedEncounteredPlayerIdentities(
  batchSize: number,
  thresholds: ResolutionThresholds
): Promise<PrioritizedIdentityCandidate[]> {
  const players = await prisma.player.findMany({
    where: {
      clanResolvedAt: null,
      encounterCount: { gte: thresholds.minEncounters },
      resolveAttempts: { lt: thresholds.maxAttempts },
    },
    orderBy: [
      { combatInteractionsCount: 'desc' },
      { encounterCount: 'desc' },
      { resolveAttempts: 'desc' },
      { id: 'desc' },
    ],
    take: batchSize,
    select: { id: true, pubgAccountId: true, platformShard: true, pubgPlayerName: true, encounterCount: true, lastSeenAt: true },
  })

  if (players.length === 0) {
    return []
  }

  // Clans suivis qui l'ont croisé : compteur du journal des passages (`crossClanCandidatesSelected`), pas un critère.
  const clanCounts = await prisma.clanEncounter.groupBy({
    by: ['playerId'],
    where: { playerId: { in: players.map((player) => player.id) } },
    _count: { _all: true },
  })
  const clanCountByPlayer = new Map(clanCounts.map((row) => [row.playerId, row._count._all]))

  return players.map((player) => ({
    pubgAccountId: player.pubgAccountId,
    platformShard: player.platformShard,
    pubgPlayerName: player.pubgPlayerName,
    distinctClanCount: clanCountByPlayer.get(player.id) ?? 0,
    totalEncounterCount: player.encounterCount,
    lastSeenAt: player.lastSeenAt,
  }))
}

// Résout le clan PUBG d'un compte croisé, partagée entre le cron
// (resolveEncounteredPlayerClans) et la résolution manuelle SuperUser — un
// seul appel PUBG par compte, jamais un par clan qui l'a croisé.
//
// Écrit sur l'identité globale `Player` seule : un compte a un seul statut de
// résolution, échecs compris, quel que soit le nombre de clans suivis qui l'ont
// croisé. Les copies par clan d'`EncounteredPlayer` ne sont plus écrites depuis la
// fin d'EncounteredPlayer, étape 4 (docs/TODO/inventaire-2026-10-20.md §6).
export async function resolveOneEncounteredPlayerCandidate(
  candidate: ResolveOneCandidateInput,
  options?: { source?: 'cron' | 'manual' }
): Promise<ResolveOneCandidateResult> {
  const freshnessCutoff = new Date(
    Date.now() - PLAYER_CLAN_RESOLUTION_FRESHNESS_DAYS * 24 * 60 * 60 * 1000
  )

  try {
    // Le clan suivi fait autorité sur le cache : un compte devenu membre d'un
    // clan suivi (ou déplacé entre clans suivis) doit repartir de `ClanMember`,
    // pas d'un `Player.opponentClanId` écrit avant le mouvement. Un lookup
    // indexé de plus par candidat (`idx_clan_member_pubg_account`), contre un
    // décalage qui, lui, ne se résorbait jamais tout seul.
    const trackedClanMember = await prisma.clanMember.findFirst({
      where: {
        pubgAccountId: candidate.pubgAccountId,
        isActive: true,
        joinStatus: 'active',
      },
      include: { clan: true },
    })

    // Le raccourci ne vaut que si le clan suivi porte un vrai `pubgClanId`. Un
    // membre garé dans le parking `Ungrouped` n'a pas « aucun clan PUBG » : le
    // site n'a simplement pas d'avis, et c'est l'API qui doit trancher — sinon on
    // perdrait la découverte du clan non suivi qu'il vient peut-être de rejoindre.
    if (trackedClanMember?.clan?.pubgClanId) {
      await syncOpponentIdentityForMember({
        pubgAccountId: candidate.pubgAccountId,
        platformShard: candidate.platformShard,
        pubgPlayerName: candidate.pubgPlayerName,
        clan: {
          pubgClanId: trackedClanMember.clan.pubgClanId,
          tag: trackedClanMember.clan.tag,
          name: trackedClanMember.clan.name,
        },
      })

      return {
        outcome: 'resolved_with_clan',
        pubgClanId: trackedClanMember.clan.pubgClanId,
        pubgClanTag: trackedClanMember.clan.tag ?? null,
        pubgClanName: trackedClanMember.clan.name ?? null,
      }
    }

    const cachedPlayer = await prisma.player.findUnique({
      where: {
        pubgAccountId_platformShard: {
          pubgAccountId: candidate.pubgAccountId,
          platformShard: candidate.platformShard,
        },
      },
      include: { opponentClan: true },
    })

    // Déjà résolu récemment (par un autre chemin depuis la sélection) : rien à écrire, `Player` fait foi.
    if (cachedPlayer?.clanResolvedAt && cachedPlayer.clanResolvedAt >= freshnessCutoff) {
      return {
        outcome: 'cache_hit',
        pubgClanId: cachedPlayer.opponentClan?.pubgClanId ?? null,
        pubgClanTag: cachedPlayer.opponentClan?.tag ?? null,
        pubgClanName: cachedPlayer.opponentClan?.name ?? null,
      }
    }

    // Le cron de résolution est une tâche de fond : la synchronisation des parties passe devant dans la file PUBG.
    const apiContext: PubgApiCallContext = {
      source:
        options?.source === 'manual'
          ? 'encountered-player-resolution-manual'
          : 'encountered-player-resolution-cron',
      priority: options?.source === 'manual' ? 'normal' : 'low',
    }

    const clan = await fetchPlayerClan(candidate.pubgAccountId, candidate.platformShard, apiContext)

    // Même écriture que pour un membre suivi, un seul chemin : `OpponentClan` puis `Player`.
    await syncOpponentIdentityForMember({
      pubgAccountId: candidate.pubgAccountId,
      platformShard: candidate.platformShard,
      pubgPlayerName: candidate.pubgPlayerName,
      clan: clan?.id ? { pubgClanId: clan.id, tag: clan.tag ?? null, name: clan.name ?? null } : null,
    })

    return clan?.id
      ? {
          outcome: 'resolved_with_clan',
          pubgClanId: clan.id,
          pubgClanTag: clan.tag ?? null,
          pubgClanName: clan.name ?? null,
        }
      : { outcome: 'resolved_without_clan' }
  } catch (error) {
    // Un échec qui ne serait pas compté ferait retenter ce compte à chaque passage : l'écriture est journalisée, mais
    // ne transforme pas l'échec PUBG en échec du lot.
    await prisma.player
      .updateMany({
        where: { pubgAccountId: candidate.pubgAccountId, platformShard: candidate.platformShard },
        data: { resolveAttempts: { increment: 1 } },
      })
      .catch((writeError) => {
        console.error(`[Résolution] Échec non compté pour ${candidate.pubgAccountId}`, writeError)
      })

    return { outcome: 'failed', error }
  }
}
