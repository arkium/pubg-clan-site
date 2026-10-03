import 'server-only'

import { prisma } from '@/lib/prisma'
import { syncOpponentIdentityForMember } from '@/lib/player-clan-identity'
import { fetchPlayerIdentity } from '@/lib/pubg'

/**
 * Noms des adversaires du kill feed jamais relevés dans un lobby (« Joueur inconnu » de la Némésis,
 * docs/features/nemesis.md). Le cron de résolution des joueurs croisés (`resolveEncounteredPlayerClans`) les traite
 * **en priorité**, dans le même lot et le même quota : un appel `/players/{id}` donne le nom **et** le clan, écrits dans
 * `Player` / `OpponentClan` par le même chemin que les joueurs croisés (`syncOpponentIdentityForMember`).
 *
 * Mesuré le 2026-10-03 : 1 511 comptes sans nom sur 68 878 ; 884 déjà nommés par `Player` (lus par la page sans appel),
 * 627 à demander à l'API.
 */

export type KillFeedCandidate = { pubgAccountId: string; platformShard: string }

/** Au-delà, un compte en échec (hors « introuvable ») n'est plus redemandé. */
export const KILL_FEED_MAX_ATTEMPTS = 3

/**
 * La découverte relit `KillEvent` (~128 000 lignes, pas d'index sur la date : 3 à 6 s mesurées) : au plus toutes les
 * 6 h, pas à chaque passage du cron (toutes les 30 min). Entre deux découvertes, le lot est pris dans la liste en cache.
 */
const DISCOVERY_TTL_MS = 6 * 60 * 60 * 1000
const DISCOVERY_LIMIT = 2_000

type DiscoveryCache = { computedAt: number; candidates: KillFeedCandidate[] }
const globalForKillFeed = globalThis as typeof globalThis & { killFeedNameDiscovery?: DiscoveryCache }

const keyOf = (candidate: KillFeedCandidate) => `${candidate.platformShard}:${candidate.pubgAccountId}`

/** Réservé aux tests : vide la liste en cache. */
export function resetKillFeedDiscoveryCache() {
  globalForKillFeed.killFeedNameDiscovery = undefined
}

async function discoverUnnamedAccounts(): Promise<KillFeedCandidate[]> {
  return prisma.$queryRaw<KillFeedCandidate[]>`
    SELECT DISTINCT opp.accountId AS pubgAccountId, c.platformShard AS platformShard
      FROM (
        SELECT clanId, killerAccountId AS accountId FROM KillEvent
         WHERE victimMemberId IS NOT NULL AND killerMemberId IS NULL
           AND killerAccountId IS NOT NULL AND killerAccountId NOT LIKE 'ai.%'
        UNION
        SELECT clanId, victimAccountId FROM KillEvent
         WHERE killerMemberId IS NOT NULL AND victimMemberId IS NULL
           AND victimAccountId IS NOT NULL AND victimAccountId NOT LIKE 'ai.%'
      ) opp
      JOIN Clan c ON c.id = opp.clanId
      LEFT JOIN Player p ON p.pubgAccountId = opp.accountId AND p.platformShard = c.platformShard
      LEFT JOIN KillFeedAccountLookup l ON l.pubgAccountId = opp.accountId AND l.platformShard = c.platformShard
     WHERE p.id IS NULL
       AND NOT EXISTS (SELECT 1 FROM EncounteredPlayer ep WHERE ep.pubgAccountId = opp.accountId AND ep.platformShard = c.platformShard)
       AND (l.pubgAccountId IS NULL OR (l.notFound = false AND l.attempts < ${KILL_FEED_MAX_ATTEMPTS}))
     LIMIT ${DISCOVERY_LIMIT}`
}

/** Comptes de la liste nommés ou abandonnés depuis la découverte (par un autre chemin, ou un passage précédent). */
async function settledKeys(candidates: KillFeedCandidate[]) {
  if (candidates.length === 0) return new Set<string>()
  const where = { OR: candidates.map(({ pubgAccountId, platformShard }) => ({ pubgAccountId, platformShard })) }
  const [players, encountered, lookups] = await Promise.all([
    prisma.player.findMany({ where, select: { pubgAccountId: true, platformShard: true } }),
    prisma.encounteredPlayer.findMany({ where, select: { pubgAccountId: true, platformShard: true } }),
    prisma.killFeedAccountLookup.findMany({
      where: { AND: [where, { OR: [{ notFound: true }, { attempts: { gte: KILL_FEED_MAX_ATTEMPTS } }] }] },
      select: { pubgAccountId: true, platformShard: true },
    }),
  ])
  return new Set([...players, ...encountered, ...lookups].map(keyOf))
}

/**
 * Jusqu'à `limit` comptes sans nom à traiter en tête du lot du cron. Une liste vide ne relance pas la découverte avant
 * l'échéance : le backlog épuisé ne coûte plus qu'un passage tous les 6 h.
 */
export async function selectUnnamedKillFeedAccounts(limit: number, now = Date.now()): Promise<KillFeedCandidate[]> {
  if (limit <= 0) return []
  let cache = globalForKillFeed.killFeedNameDiscovery
  if (!cache || now - cache.computedAt > DISCOVERY_TTL_MS) {
    cache = { computedAt: now, candidates: await discoverUnnamedAccounts() }
    globalForKillFeed.killFeedNameDiscovery = cache
  }

  const selected: KillFeedCandidate[] = []
  while (selected.length < limit && cache.candidates.length > 0) {
    const chunk = cache.candidates.splice(0, Math.max(limit * 2, 20))
    const settled = await settledKeys(chunk)
    for (const candidate of chunk) {
      if (settled.has(keyOf(candidate))) continue
      if (selected.length < limit) selected.push(candidate)
      else cache.candidates.unshift(candidate)
    }
  }
  return selected
}

export type KillFeedResolutionResult =
  | { outcome: 'resolved_with_clan' | 'resolved_without_clan'; name: string }
  | { outcome: 'not_found' }
  | { outcome: 'failed'; error: unknown }

const isNotFound = (error: unknown) => (error as { status?: number } | null)?.status === 404

/** Un compte : nom et clan en un appel, puis le même enregistrement qu'un joueur croisé. */
export async function resolveKillFeedAccount(candidate: KillFeedCandidate): Promise<KillFeedResolutionResult> {
  const where = { pubgAccountId_platformShard: candidate }
  try {
    const { name, clan } = await fetchPlayerIdentity(candidate.pubgAccountId, candidate.platformShard, { source: 'kill-feed-name-resolution-cron' })
    if (!name) {
      await prisma.killFeedAccountLookup.upsert({
        where,
        update: { notFound: true, attempts: { increment: 1 }, lastAttemptAt: new Date() },
        create: { ...candidate, notFound: true, attempts: 1 },
      })
      return { outcome: 'not_found' }
    }
    await syncOpponentIdentityForMember({
      pubgAccountId: candidate.pubgAccountId,
      platformShard: candidate.platformShard,
      pubgPlayerName: name,
      clan: clan?.id ? { pubgClanId: clan.id, tag: clan.tag ?? null, name: clan.name ?? null } : null,
    })
    await prisma.killFeedAccountLookup.deleteMany({ where: candidate })
    return { outcome: clan?.id ? 'resolved_with_clan' : 'resolved_without_clan', name }
  } catch (error) {
    const notFound = isNotFound(error)
    await prisma.killFeedAccountLookup
      .upsert({
        where,
        update: { notFound, attempts: { increment: 1 }, lastAttemptAt: new Date() },
        create: { ...candidate, notFound, attempts: 1 },
      })
      .catch(() => undefined)
    return notFound ? { outcome: 'not_found' } : { outcome: 'failed', error }
  }
}
