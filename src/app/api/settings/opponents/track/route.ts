import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'
import { getSessionFromRequest } from '@/lib/auth-session'
import {
  PLAYER_CLAN_CHANGE_SOURCES,
  recordPlayerClanChange,
} from '@/lib/player-clan-change'
import { syncOpponentIdentityForMemberId } from '@/lib/player-clan-identity'

export async function POST(req: NextRequest) {
  try {
    const permissionError = await requireSuperUser(req)
    if (permissionError) return permissionError

    const body = await req.json()
    let { playerId, targetClanId } = body
    const confirmMove = body?.confirmMove === true

    if (!playerId) {
      return Response.json({ error: 'playerId is required' }, { status: 400 })
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId }
    })

    if (!player) {
      return Response.json({ error: 'Player not found' }, { status: 404 })
    }

    if (!targetClanId) {
      const { ensureTrackedClanForPlayer, getOrCreateUngroupedClan } = await import('@/lib/clan-service')
      const detectedClan = await ensureTrackedClanForPlayer(player.pubgAccountId, player.platformShard)
      targetClanId = detectedClan?.clan.id ?? (await getOrCreateUngroupedClan(player.platformShard)).id
    }

    // Check if player already exists in the system (a player can only be in one clan at a time)
    const existingMember = await prisma.clanMember.findFirst({
      where: {
        platformShard: player.platformShard,
        OR: [
          { pubgAccountId: player.pubgAccountId },
          { playerId: player.id },
          { pubgPlayerName: player.pubgPlayerName }
        ]
      }
    })

    if (existingMember) {
      if (existingMember.clanId === targetClanId && existingMember.joinStatus === 'active' && existingMember.isActive) {
        return Response.json({ error: 'Ce joueur est déjà un membre actif de ce clan.' }, { status: 400 })
      }

      // Garde-fou : un joueur déjà rattaché ailleurs n'est PAS un « candidat
      // manquant », c'est un conflit. Avant ce contrôle, le bouton « Ajouter à
      // l'effectif » de `/settings/opponents` le déplaçait sans trace ni
      // confirmation dès que le miroir adversaire était périmé (incident
      // WESTEN88 du 2026-09-22).
      const movesFromAnotherTrackedClan =
        existingMember.isActive &&
        existingMember.joinStatus === 'active' &&
        existingMember.clanId != null &&
        existingMember.clanId !== targetClanId

      if (movesFromAnotherTrackedClan && !confirmMove) {
        const currentClan = await prisma.clan.findUnique({
          where: { id: existingMember.clanId as number },
          select: { id: true, tag: true, name: true },
        })
        return Response.json(
          {
            error: 'member_tracked_elsewhere',
            message:
              `${player.pubgPlayerName} est déjà membre actif de ` +
              `${currentClan?.tag ? `[${currentClan.tag}] ` : ''}${currentClan?.name ?? 'un autre clan suivi'}. ` +
              'Confirmez le transfert pour le déplacer.',
            currentClan,
          },
          { status: 409 }
        )
      }

      const previousClanId = existingMember.clanId

      // A SuperUser explicitly confirming this player's clan membership is
      // equivalent to an approved join — no separate approval step exists
      // for scouted players (they have no site account to click "join").
      const updated = await prisma.$transaction(async (tx) => {
        const member = await tx.clanMember.update({
          where: { id: existingMember.id },
          data: {
            isActive: true,
            joinStatus: 'active',
            clanId: targetClanId,
            playerId: player.id,
            pubgAccountId: player.pubgAccountId,
            pubgPlayerName: player.pubgPlayerName
          }
        })

        // Même règle que partout ailleurs : le mouvement et sa trace ensemble.
        if (previousClanId !== targetClanId) {
          const [previousClan, targetClan] = await Promise.all([
            previousClanId
              ? tx.clan.findUnique({ where: { id: previousClanId }, select: { pubgClanId: true, tag: true } })
              : Promise.resolve(null),
            tx.clan.findUnique({ where: { id: targetClanId }, select: { pubgClanId: true, tag: true } }),
          ])

          const session = await getSessionFromRequest(req)
          await recordPlayerClanChange(tx, {
            clanMemberId: member.id,
            pubgAccountId: player.pubgAccountId,
            platformShard: player.platformShard,
            previousClanId,
            newClanId: targetClanId,
            previousPubgClanId: previousClan?.pubgClanId ?? null,
            previousPubgClanTag: previousClan?.tag ?? null,
            newPubgClanId: targetClan?.pubgClanId ?? null,
            newPubgClanTag: targetClan?.tag ?? null,
            source: PLAYER_CLAN_CHANGE_SOURCES.manualTransfer,
            triggeredByUserId: session?.userId ?? null,
          })
        }

        return member
      })

      await syncOpponentIdentityForMemberId(updated.id)

      return Response.json(updated)
    }

    // Create new member — see note above on joinStatus: 'active'
    const newMember = await prisma.clanMember.create({
      data: {
        displayName: player.pubgPlayerName,
        pubgPlayerName: player.pubgPlayerName,
        pubgAccountId: player.pubgAccountId,
        platformShard: player.platformShard,
        isActive: true,
        joinStatus: 'active',
        clanId: targetClanId,
        playerId: player.id
      }
    })

    await syncOpponentIdentityForMemberId(newMember.id)

    return Response.json(newMember)
  } catch (error: any) {
    console.error('Failed to track player:', error)
    if (error.message === 'Forbidden') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
