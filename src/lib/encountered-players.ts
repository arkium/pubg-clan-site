import { prisma } from '@/lib/prisma'
import type { ResolvedPubgMatch } from '@/lib/pubg'

const BOT_ACCOUNT_PREFIX = 'ai.'

export function isBotAccountId(accountId: string): boolean {
  return accountId.startsWith(BOT_ACCOUNT_PREFIX)
}

/** Nombre de bots distincts (tout le lobby, toutes équipes confondues) dans un match. */
export function countBotsInMatch(matchDetails: ResolvedPubgMatch): number {
  const botIds = new Set<string>()

  for (const roster of matchDetails.rosters) {
    for (const participant of roster.participants) {
      if (participant.playerId && isBotAccountId(participant.playerId)) {
        botIds.add(participant.playerId)
      }
    }
  }

  return botIds.size
}

/**
 * Capture les participants adverses (hors clan suivi, hors bots) d'un match déjà
 * synchronisé, pour identifier plus tard des clans PUBG non trackés et mesurer la
 * fréquence de croisement. Ne coûte aucun appel API : les rosters sont déjà
 * chargés par fetchMatchDetails() pour la détection d'escouade.
 */
export async function captureEncounteredPlayers(
  clanId: number,
  matchDetails: ResolvedPubgMatch,
  platformShard: string,
  knownAccountIds: Set<string>
): Promise<void> {
  const opponents = new Map<string, string>()

  for (const roster of matchDetails.rosters) {
    for (const participant of roster.participants) {
      const accountId = participant.playerId

      if (!accountId || isBotAccountId(accountId) || knownAccountIds.has(accountId)) {
        continue
      }

      opponents.set(accountId, participant.playerName)
    }
  }

  if (opponents.size === 0) {
    return
  }

  const now = new Date()

  await Promise.all(
    Array.from(opponents.entries()).map(([pubgAccountId, pubgPlayerName]) =>
      prisma.encounteredPlayer.upsert({
        where: { clanId_pubgAccountId: { clanId, pubgAccountId } },
        update: {
          pubgPlayerName,
          lastSeenAt: now,
          encounterCount: { increment: 1 },
        },
        create: {
          clanId,
          pubgAccountId,
          pubgPlayerName,
          platformShard,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      })
    )
  )
}
