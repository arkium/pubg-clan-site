import { NextRequest } from 'next/server'
import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import { syncTrackedClanStats } from '@/lib/clan-service'
import { prisma } from '@/lib/prisma'
import { assignDefaultMemberRole, initializeDefaultRoles } from '@/lib/role-service'
import {
  PLAYER_CLAN_CHANGE_SOURCES,
  recordPlayerClanChange,
} from '@/lib/player-clan-change'
import { syncOpponentIdentityForMemberId } from '@/lib/player-clan-identity'
import { requirePermission, requireSuperUser, requireSameClanAsMember } from '@/middleware/auth-permission'

function parseMemberId(id: string) {
  const parsed = Number(id)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const MoveMemberClanSchema = z.object({
  clanId: z.number().int().positive('Invalid clan id'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        displayName: true,
        pubgPlayerName: true,
        platformShard: true,
        isActive: true,
        identities: {
          select: {
            user: {
              select: {
                avatarUrl: true,
              },
            },
          },
          take: 1,
        },
      },
    })

    if (!member || !member.isActive) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    return Response.json({
      id: member.id,
      displayName: member.displayName,
      avatarUrl: member.identities[0]?.user.avatarUrl ?? null,
      pubgPlayerName: member.pubgPlayerName,
      platformShard: member.platformShard,
    })
  } catch (error) {
    console.error('Error fetching member:', error)
    return Response.json(
      { error: 'Failed to fetch member' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const existingMember = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        displayName: true,
        isActive: true,
        clanId: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    })

    if (!existingMember || !existingMember.isActive) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    if (!existingMember.clanId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Chantier 3 : l'arret de suivi coupe la synchronisation PUBG et fait disparaitre
    // le joueur de l'ecosysteme — c'est desormais une decision SuperUser. Un Owner
    // qui veut se separer d'un membre le bascule vers le clan systeme (PATCH), ce qui
    // garde le suivi actif et laisse une trace dans PlayerClanChange.
    const permissionError = await requireSuperUser(request)
    if (permissionError) {
      return permissionError
    }

    const isOwner = existingMember.roles.some((entry) => entry.role.name === 'Owner')
    if (isOwner) {
      return Response.json(
        { error: 'Le chef de clan (Owner) ne peut pas être retiré sans avoir préalablement réassigné son rôle.' },
        { status: 403 }
      )
    }

    const hardDelete = request.nextUrl.searchParams.get('hard') === 'true'

    if (hardDelete) {
      await prisma.clanMember.delete({
        where: { id: memberId },
      })

      return Response.json({
        success: true,
        memberId,
        deleted: 'hard',
      })
    }

    await prisma.clanMember.update({
      where: { id: memberId },
      data: { isActive: false },
    })

    // Le suivi s'arrete : le compte redevient un joueur externe, son clan PUBG
    // sera re-resolu par le cron des joueurs croises.
    await syncOpponentIdentityForMemberId(memberId)

    if (existingMember.clanId) {
      try {
        await syncTrackedClanStats(existingMember.clanId)
      } catch (syncError) {
        console.warn('Unable to synchronize clan stats after member deactivation:', syncError)
      }
    }

    return Response.json({
      success: true,
      memberId,
      deleted: 'soft',
    })
  } catch (error) {
    console.error('Error deleting member:', error)
    return Response.json(
      { error: 'Failed to delete member' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const body = await request.json()
    const validated = MoveMemberClanSchema.parse(body)

    const [member, targetClan] = await Promise.all([
      prisma.clanMember.findUnique({
        where: { id: memberId },
        select: {
          id: true,
          displayName: true,
          isActive: true,
          clanId: true,
          platformShard: true,
          pubgAccountId: true,
          clan: {
            select: {
              name: true,
              tag: true,
              isSystem: true,
              pubgClanId: true,
            },
          },
          roles: {
            select: {
              role: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.clan.findUnique({
        where: { id: validated.clanId },
        select: {
          id: true,
          name: true,
          tag: true,
          platformShard: true,
          isActive: true,
          isSystem: true,
          pubgClanId: true,
        },
      }),
    ])

    if (!member || !member.isActive) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    if (!targetClan || !targetClan.isActive) {
      return Response.json({ error: 'Target clan not found' }, { status: 404 })
    }

    // Déplacer un membre est une opération cross-clan, donc SuperUser par défaut.
    // Exception étroite du chantier 3 : basculer un de ses propres membres vers le
    // clan système du même shard reste ouvert à un Owner (permission
    // `manage_members` sur le clan ACTUEL du membre). C'est la seule action de
    // sortie qui lui reste depuis que `DELETE` est réservé au SuperUser, et elle est
    // moins définitive puisque le suivi PUBG continue.
    const isDemotionToSystemClan =
      targetClan.isSystem && targetClan.platformShard === member.platformShard

    const permissionError = isDemotionToSystemClan && member.clanId
      ? await requirePermission('manage_members')(request, { clanId: member.clanId })
      : await requireSuperUser(request)

    if (permissionError) {
      return permissionError
    }

    const isOwner = member.roles.some((entry) => entry.role.name === 'Owner')
    // Un Owner du clan technique peut en sortir : ce role n'y a pas de sens, il
    // n'est qu'un artefact du parking. Ailleurs, un Owner doit etre retrograde avant.
    const isSystemClanOwner = isOwner && member.clan?.isSystem === true
    if (isOwner && !isSystemClanOwner) {
      return Response.json(
        { error: 'Owner member cannot be moved to another clan' },
        { status: 403 }
      )
    }

    if (targetClan.platformShard !== member.platformShard) {
      return Response.json(
        { error: 'Member platform and clan platform must match' },
        { status: 400 }
      )
    }

    if (member.clanId === targetClan.id) {
      return Response.json({
        success: true,
        memberId: member.id,
        clanId: targetClan.id,
        clan: {
          id: targetClan.id,
          name: targetClan.name,
          tag: targetClan.tag,
        },
      })
    }

    const previousClanId = member.clanId
    const actorSession = await getSessionFromRequest(request)

    // Le mouvement et sa trace sont ecrits ensemble : un mouvement sans trace serait
    // invisible dans le journal, une trace sans mouvement serait un faux positif
    // (« Surete d'execution » C du todo).
    await prisma.$transaction(async (tx) => {
      await tx.clanMember.update({
        where: { id: member.id },
        data: { clanId: targetClan.id },
      })

      await tx.clanMemberRole.deleteMany({
        where: { memberId: member.id },
      })

      await recordPlayerClanChange(tx, {
        clanMemberId: member.id,
        pubgAccountId: member.pubgAccountId,
        platformShard: member.platformShard,
        previousClanId,
        newClanId: targetClan.id,
        previousPubgClanId: member.clan?.pubgClanId ?? null,
        previousPubgClanTag: member.clan?.tag ?? null,
        newPubgClanId: targetClan.pubgClanId ?? null,
        newPubgClanTag: targetClan.tag,
        source: isDemotionToSystemClan
          ? PLAYER_CLAN_CHANGE_SOURCES.manualDemotion
          : PLAYER_CLAN_CHANGE_SOURCES.manualTransfer,
        triggeredByUserId: actorSession?.userId ?? null,
      })
    })

    // Miroir adversaire : sans ce realignement, `/settings/opponents` continue
    // de proposer le membre comme candidat de son clan precedent.
    await syncOpponentIdentityForMemberId(member.id)

    await initializeDefaultRoles(targetClan.id)
    await assignDefaultMemberRole(member.id, targetClan.id)

    if (previousClanId) {
      try {
        await syncTrackedClanStats(previousClanId)
      } catch (syncError) {
        console.warn('Unable to synchronize previous clan stats after move:', syncError)
      }
    }

    try {
      await syncTrackedClanStats(targetClan.id)
    } catch (syncError) {
      console.warn('Unable to synchronize target clan stats after move:', syncError)
    }

    return Response.json({
      success: true,
      memberId: member.id,
      clanId: targetClan.id,
      clan: {
        id: targetClan.id,
        name: targetClan.name,
        tag: targetClan.tag,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error moving member to clan:', error)
    return Response.json({ error: 'Failed to move member to clan' }, { status: 500 })
  }
}
