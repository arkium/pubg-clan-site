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

type ResolutionThresholds = { minEncounters: number; maxAttempts: number }

type IdentityKey = { pubgAccountId: string; platformShard: string }

/**
 * Classement complet mis en cache (palier 2). Recalculer ce classement coûte ~48 s sur la
 * base de production (regroupement de ~560 000 lignes, table temporaire et tri) — il ne
 * l'est donc qu'au plus toutes les `RANKING_CACHE_TTL_MS`, et pas du tout tant que le
 * palier 1 suffit. Mesures et justification : docs/ops/database-performance.md.
 */
const RANKING_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const RANKING_CACHE_SIZE = 1000
/** Un classement épuisé n'est pas recalculé plus d'une fois par intervalle. */
const RANKING_CACHE_MIN_REFRESH_INTERVAL_MS = 10 * 60 * 1000
/** Taille des listes `OR` envoyées pour revérifier l'éligibilité des identités en cache. */
const ELIGIBILITY_CHUNK_SIZE = 200

type RankingCache = { thresholdsKey: string; computedAt: number; identities: IdentityKey[] }

const globalForResolution = globalThis as typeof globalThis & {
  encounteredPlayerRankingCache?: RankingCache
}

/** Réservé aux tests : vide le classement en cache. */
export function resetEncounteredPlayerRankingCache() {
  globalForResolution.encounteredPlayerRankingCache = undefined
}

const identityKey = (identity: IdentityKey) => `${identity.platformShard}:${identity.pubgAccountId}`

function eligibilityWhere(thresholds: ResolutionThresholds) {
  return {
    clanResolvedAt: null,
    encounterCount: { gte: thresholds.minEncounters },
    resolveAttempts: { lt: thresholds.maxAttempts },
  }
}

type IdentityGroup = IdentityKey & {
  distinctClanCount: number
  totalEncounterCount: number
  lastSeenAt: Date | null
}

async function groupEligibleIdentities(
  thresholds: ResolutionThresholds,
  take: number,
  restrictTo?: IdentityKey[]
): Promise<IdentityGroup[]> {
  const rows = await prisma.encounteredPlayer.groupBy({
    by: ['pubgAccountId', 'platformShard'],
    where: {
      ...eligibilityWhere(thresholds),
      ...(restrictTo
        ? {
            OR: restrictTo.map((identity) => ({
              pubgAccountId: identity.pubgAccountId,
              platformShard: identity.platformShard,
            })),
          }
        : {}),
    },
    _count: { clanId: true },
    _sum: { encounterCount: true, combatInteractionsCount: true },
    _max: { lastSeenAt: true },
    // Ordre de priorité inchangé ; `pubgAccountId` ne sert qu'à départager les ex æquo
    // stricts, que MariaDB ordonnait arbitrairement d'une exécution à l'autre.
    orderBy: [
      { _sum: { combatInteractionsCount: 'desc' } },
      { _count: { clanId: 'desc' } },
      { _sum: { encounterCount: 'desc' } },
      { _max: { lastSeenAt: 'desc' } },
      { pubgAccountId: 'asc' },
    ],
    take,
  })

  return rows.map((row) => ({
    pubgAccountId: row.pubgAccountId,
    platformShard: row.platformShard,
    // Assert typings because Prisma's groupBy types can be loose with selections
    distinctClanCount: (row._count as { clanId: number }).clanId,
    totalEncounterCount: (row._sum as { encounterCount: number | null }).encounterCount ?? 0,
    lastSeenAt: (row._max as { lastSeenAt: Date | null }).lastSeenAt,
  }))
}

async function getRankingCache(thresholds: ResolutionThresholds, forceRefresh: boolean) {
  const thresholdsKey = JSON.stringify(thresholds)
  const cached = globalForResolution.encounteredPlayerRankingCache
  const now = Date.now()
  const fresh =
    cached &&
    cached.thresholdsKey === thresholdsKey &&
    now - cached.computedAt < RANKING_CACHE_TTL_MS &&
    !(forceRefresh && now - cached.computedAt >= RANKING_CACHE_MIN_REFRESH_INTERVAL_MS)
  if (fresh) return cached

  const ranking = await groupEligibleIdentities(thresholds, RANKING_CACHE_SIZE)
  const next: RankingCache = {
    thresholdsKey,
    computedAt: now,
    identities: ranking.map((group) => ({ pubgAccountId: group.pubgAccountId, platformShard: group.platformShard })),
  }
  globalForResolution.encounteredPlayerRankingCache = next
  return next
}

/**
 * Palier 2 : parcourt le classement en cache dans son ordre et ne garde que les identités
 * encore éligibles (déjà résolues ou abandonnées entre-temps = écartées), avec des agrégats
 * relus en base. Renvoie aussi si le cache a été entièrement consommé.
 */
async function takeFromRanking(
  thresholds: ResolutionThresholds,
  ranking: RankingCache,
  take: number,
  exclude: Set<string>
): Promise<{ groups: IdentityGroup[]; exhausted: boolean }> {
  const remaining = ranking.identities.filter((identity) => !exclude.has(identityKey(identity)))
  const selected: IdentityGroup[] = []

  for (let offset = 0; offset < remaining.length && selected.length < take; offset += ELIGIBILITY_CHUNK_SIZE) {
    const chunk = remaining.slice(offset, offset + ELIGIBILITY_CHUNK_SIZE)
    const eligible = await groupEligibleIdentities(thresholds, chunk.length, chunk)
    const byKey = new Map(eligible.map((group) => [identityKey(group), group]))
    for (const identity of chunk) {
      const group = byKey.get(identityKey(identity))
      if (group) selected.push(group)
      if (selected.length === take) break
    }
  }

  return { groups: selected, exhausted: selected.length < take }
}

// Sélectionne les identités globales (pubgAccountId+platformShard) non
// résolues et éligibles, priorisées par combatInteractionsCount DESC, puis
// distinctClanCount DESC, totalEncounterCount DESC et lastSeenAt DESC — un joueur
// croisé par plusieurs clans suivis retire plusieurs lignes EncounteredPlayer du
// backlog pour un seul appel PUBG une fois résolu (voir docs/TODO/todo.md, section
// "Priorisation cross-clan"). @@unique([clanId, pubgAccountId]) garantit
// qu'une identité n'apparaît jamais deux fois pour un même clan, donc le
// nombre de lignes du groupe = le nombre de clans distincts qui l'ont croisé.
//
// Sélection en deux paliers (2026-09-15) pour éviter le regroupement complet à chaque
// passage du cron (48 s mesurées en production, toutes les 30 min) :
// 1. identités ayant au moins une interaction de combat — l'index
//    (clanResolvedAt, combatInteractionsCount) les isole en ~1 s, et comme le premier
//    critère de tri est SUM(combatInteractionsCount), elles précèdent toujours les autres :
//    ce palier est exact et frais à chaque passage ;
// 2. si le lot n'est pas rempli, suite du classement complet mis en cache (au plus toutes
//    les 6 h), revérifiée identité par identité.
// Seul écart avec l'ancien calcul : une identité SANS combat devenue prioritaire depuis
// le dernier calcul du classement attend son rafraîchissement (6 h au plus).
export async function selectPrioritizedEncounteredPlayerIdentities(
  batchSize: number,
  thresholds: ResolutionThresholds
): Promise<PrioritizedIdentityCandidate[]> {
  const combatIdentities = await prisma.encounteredPlayer.findMany({
    where: { ...eligibilityWhere(thresholds), combatInteractionsCount: { gt: 0 } },
    select: { pubgAccountId: true, platformShard: true },
    distinct: ['pubgAccountId', 'platformShard'],
  })

  const groups: IdentityGroup[] =
    combatIdentities.length > 0 ? await groupEligibleIdentities(thresholds, batchSize, combatIdentities) : []

  if (groups.length < batchSize) {
    const exclude = new Set(groups.map(identityKey))
    let ranking = await getRankingCache(thresholds, false)
    let result = await takeFromRanking(thresholds, ranking, batchSize - groups.length, exclude)

    if (result.exhausted) {
      const refreshed = await getRankingCache(thresholds, true)
      if (refreshed !== ranking) {
        ranking = refreshed
        const alreadyTaken = new Set([...exclude, ...result.groups.map(identityKey)])
        const more = await takeFromRanking(
          thresholds,
          ranking,
          batchSize - groups.length - result.groups.length,
          alreadyTaken
        )
        result = { groups: [...result.groups, ...more.groups], exhausted: more.exhausted }
      }
    }

    groups.push(...result.groups)
  }

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

  const nameByIdentity = new Map(representativeRows.map((row) => [identityKey(row), row.pubgPlayerName]))

  return groups.map((group) => ({
    pubgAccountId: group.pubgAccountId,
    platformShard: group.platformShard,
    pubgPlayerName: nameByIdentity.get(identityKey(group)) ?? '',
    distinctClanCount: group.distinctClanCount,
    totalEncounterCount: group.totalEncounterCount,
    lastSeenAt: group.lastSeenAt ?? new Date(0),
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
      const identity = await syncOpponentIdentityForMember({
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
        updatedRowCount: identity?.encounteredRowsUpdated ?? 0,
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

    // Même écriture que pour un membre suivi, un seul chemin : `OpponentClan`,
    // `Player` puis toutes les lignes `EncounteredPlayer` du compte.
    const identity = await syncOpponentIdentityForMember({
      pubgAccountId: candidate.pubgAccountId,
      platformShard: candidate.platformShard,
      pubgPlayerName: candidate.pubgPlayerName,
      clan: clan?.id ? { pubgClanId: clan.id, tag: clan.tag ?? null, name: clan.name ?? null } : null,
    })
    const count = identity?.encounteredRowsUpdated ?? 0

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
