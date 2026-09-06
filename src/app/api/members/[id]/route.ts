import { NextRequest } from 'next/server'
import { z } from 'zod'

import { syncTrackedClanStats } from '@/lib/clan-service'
import { prisma } from '@/lib/prisma'
import { assignDefaultMemberRole, initializeDefaultRoles } from '@/lib/role-service'
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

    const permissionError = await requirePermission('manage_members')(request, {
      clanId: existingMember.clanId,
    })
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

    // Déplacer un membre entre clans = opération cross-clan → SuperUser uniquement
    const permissionError = await requireSuperUser(request)
    if (permissionError) {
      return permissionError
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
          clan: {
            select: {
              name: true,
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
        },
      }),
    ])

    if (!member || !member.isActive) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    if (!targetClan || !targetClan.isActive) {
      return Response.json({ error: 'Target clan not found' }, { status: 404 })
    }

    const isOwner = member.roles.some((entry) => entry.role.name === 'Owner')
    const isUngroupedOwner = isOwner && member.clan?.name === 'Ungrouped'
    if (isOwner && !isUngroupedOwner) {
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

    await prisma.$transaction(async (tx) => {
      await tx.clanMember.update({
        where: { id: member.id },
        data: { clanId: targetClan.id },
      })

      await tx.clanMemberRole.deleteMany({
        where: { memberId: member.id },
      })
    })

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
