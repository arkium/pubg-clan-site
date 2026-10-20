import { NextRequest } from 'next/server'
import { withAdminActionLog } from '@/lib/admin-action-log'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'
import { getSessionFromRequest } from '@/lib/auth-session'
import {
  PLAYER_CLAN_CHANGE_SOURCES,
  recordPlayerClanChange,
} from '@/lib/player-clan-change'
import { syncOpponentIdentityForMemberId } from '@/lib/player-clan-identity'
import { classifyMember, type MemberClassification } from '@/lib/players-directory'

function reactivationNotice(status: MemberClassification['status'], playerName: string, clanText: string) {
  if (status === 'pending') {
    return `${playerName} a une demande d’adhésion en attente${clanText} : le suivre l’active sans attendre la décision de l’Owner.`
  }
  if (status === 'archived') return `${playerName} a été archivé avec le parking des inactifs${clanText}.`
  return `${playerName} n’est plus suivi${clanText}.`
}

async function handlePost(req: NextRequest) {
  try {
    const permissionError = await requireSuperUser(req)
    if (permissionError) return permissionError

    const body = await req.json()
    let { playerId, targetClanId } = body
    const confirmMove = body?.confirmMove === true
    const confirmReactivation = body?.confirmReactivation === true

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
      // l'effectif » de `/settings/clans` le déplaçait sans trace ni
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
              'Confirme le transfert pour le déplacer.',
            currentClan,
          },
          { status: 409 }
        )
      }

      // Même garde-fou pour un membre qui n'est pas actif : demande /join en attente (la suivre l'active sans la
      // décision de l'Owner), parking archivé, départ, refus. L'annuaire demandait confirmation côté interface,
      // l'écran Clans non (docs/TODO/players.md §10, décision du 2026-10-20).
      const reactivates = !(existingMember.isActive && existingMember.joinStatus === 'active')
      if (reactivates && !confirmReactivation) {
        const { status } = classifyMember({ ...existingMember, clan: null })
        const currentClan =
          existingMember.clanId != null
            ? await prisma.clan.findUnique({
                where: { id: existingMember.clanId },
                select: { id: true, tag: true, name: true },
              })
            : null
        const clanText = currentClan ? ` dans ${currentClan.tag ? `[${currentClan.tag}] ` : ''}${currentClan.name}` : ''
        return Response.json(
          {
            error: 'member_needs_reactivation',
            message: `${reactivationNotice(status, player.pubgPlayerName, clanText)} Confirme pour le réactiver.`,
            trackingStatus: status,
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

export const POST = withAdminActionLog('settings/opponents/track', handlePost)
