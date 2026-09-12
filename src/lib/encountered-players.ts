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
  const opponents = new Map<string, { pubgPlayerName: string; wasTeammate: boolean }>()

  for (const roster of matchDetails.rosters) {
    // A roster containing at least one tracked clan member is our squad this
    // match — everyone else on that same roster is a random teammate, not an
    // adversary, even though they show up in the same match rosters we scan.
    const isOurRoster = roster.participants.some(
      (participant) => participant.playerId && knownAccountIds.has(participant.playerId)
    )

    for (const participant of roster.participants) {
      const accountId = participant.playerId

      if (!accountId || isBotAccountId(accountId) || knownAccountIds.has(accountId)) {
        continue
      }

      const existing = opponents.get(accountId)
      if (existing) {
        existing.wasTeammate = existing.wasTeammate || isOurRoster
      } else {
        opponents.set(accountId, { pubgPlayerName: participant.playerName, wasTeammate: isOurRoster })
      }
    }
  }

  if (opponents.size === 0) {
    return
  }

  const now = new Date()
  const opponentAccountIds = Array.from(opponents.keys())

  // Détecter si des joueurs rencontrés font déjà partie de nos clans suivis
  const trackedMembers = await prisma.clanMember.findMany({
    where: { pubgAccountId: { in: opponentAccountIds } },
    select: {
      pubgAccountId: true,
      clan: {
        select: {
          pubgClanId: true,
          name: true,
          tag: true,
        },
      },
    },
  })

  const trackedClanByAccountId = new Map(
    trackedMembers
      .filter((m) => Boolean(m.pubgAccountId && m.clan))
      .map((m) => [m.pubgAccountId as string, m.clan])
  )

  await Promise.all(
    Array.from(opponents.entries()).map(async ([pubgAccountId, { pubgPlayerName, wasTeammate }]) => {
      const trackedClan = trackedClanByAccountId.get(pubgAccountId)

      await prisma.encounteredPlayer.upsert({
        where: { clanId_pubgAccountId: { clanId, pubgAccountId } },
        update: {
          pubgPlayerName,
          lastSeenAt: now,
          encounterCount: { increment: 1 },
          ...(wasTeammate ? { teammateEncounterCount: { increment: 1 } } : {}),
          ...(trackedClan
            ? {
                pubgClanId: trackedClan.pubgClanId,
                pubgClanName: trackedClan.name,
                pubgClanTag: trackedClan.tag,
                clanResolvedAt: now,
              }
            : {}),
        },
        create: {
          clanId,
          pubgAccountId,
          pubgPlayerName,
          platformShard,
          firstSeenAt: now,
          lastSeenAt: now,
          teammateEncounterCount: wasTeammate ? 1 : 0,
          pubgClanId: trackedClan?.pubgClanId ?? null,
          pubgClanName: trackedClan?.name ?? null,
          pubgClanTag: trackedClan?.tag ?? null,
          clanResolvedAt: trackedClan ? now : null,
        },
      })

      // Écriture en double vers le modèle normalisé (Player/ClanEncounter) pendant
      // la transition — voir docs/TODO/todo.md, section "Adversaires — Vue
      // superadmin globale". Les lectures existantes restent sur EncounteredPlayer.
      const player = await prisma.player.upsert({
        where: { pubgAccountId_platformShard: { pubgAccountId, platformShard } },
        update: {
          pubgPlayerName,
          lastSeenAt: now,
          ...(trackedClan ? { clanResolvedAt: now } : {}),
        },
        create: {
          pubgAccountId,
          pubgPlayerName,
          platformShard,
          firstSeenAt: now,
          lastSeenAt: now,
          clanResolvedAt: trackedClan ? now : null,
        },
      })

      await prisma.clanEncounter.upsert({
        where: { clanId_playerId: { clanId, playerId: player.id } },
        update: {
          lastSeenAt: now,
          encounterCount: { increment: 1 },
          ...(wasTeammate ? { teammateEncounterCount: { increment: 1 } } : {}),
        },
        create: {
          clanId,
          playerId: player.id,
          firstSeenAt: now,
          lastSeenAt: now,
          teammateEncounterCount: wasTeammate ? 1 : 0,
        },
      })
    })
  )
}
