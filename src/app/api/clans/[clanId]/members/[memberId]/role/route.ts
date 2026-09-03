import { NextRequest } from 'next/server'

import { prisma } from '@/lib/prisma'
import { assignRole, initializeDefaultRoles, PREDEFINED_ROLES, revokeRole } from '@/lib/role-service'
import { getActorMemberId, isSuperUserSession, requirePermission } from '@/middleware/auth-permission'

function parsePositiveInt(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clanId: string; memberId: string }> }
) {
  try {
    const { clanId, memberId } = await params
    const parsedClanId = parsePositiveInt(clanId)
    const parsedMemberId = parsePositiveInt(memberId)

    if (!parsedClanId || !parsedMemberId) {
      return Response.json({ error: 'Invalid clan or member id' }, { status: 400 })
    }

    const isSuperUser = await isSuperUserSession(request)

    if (!isSuperUser) {
      const permissionError = await requirePermission('assign_roles')(request, {
        clanId: parsedClanId,
        allowMissingActor: true,
      })
      if (permissionError) {
        return permissionError
      }
    }

    const actorMemberId = await getActorMemberId(request)
    if (!actorMemberId && !isSuperUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { roleId?: number } | null
    if (!body || typeof body.roleId !== 'number' || !Number.isInteger(body.roleId) || body.roleId <= 0) {
      return Response.json({ error: 'Invalid role id' }, { status: 400 })
    }

    await initializeDefaultRoles(parsedClanId)

    const member = await prisma.clanMember.findUnique({
      where: { id: parsedMemberId },
      include: {
        roles: {
          include: { role: true },
        },
      },
    })

    if (!member || !member.isActive || member.clanId !== parsedClanId) {
      return Response.json({ error: 'Member not found in clan' }, { status: 404 })
    }

    const nextRole = await prisma.clanRole.findUnique({
      where: { id: body.roleId },
      select: { id: true, name: true, clanId: true },
    })

    if (!nextRole || nextRole.clanId !== parsedClanId) {
      return Response.json({ error: 'Role not found in clan' }, { status: 404 })
    }

    const memberHasOwnerRole = member.roles.some((entry) => entry.role.name === PREDEFINED_ROLES.OWNER.name)
    const targetIsOwnerRole = nextRole.name === PREDEFINED_ROLES.OWNER.name

    // Assigner ou révoquer le rôle Owner est réservé au SuperUser
    if (memberHasOwnerRole || targetIsOwnerRole) {
      if (!isSuperUser) {
        return Response.json(
          { error: 'Forbidden: only SuperUser can assign or revoke the Owner role' },
          { status: 403 }
        )
      }
    }

    const currentRoleIds = member.roles.map((entry) => entry.roleId)
    for (const roleId of currentRoleIds) {
      if (roleId !== nextRole.id) {
        await revokeRole(parsedMemberId, roleId, actorMemberId, { isSuperUser })
      }
    }

    await assignRole(parsedMemberId, nextRole.id, actorMemberId, { isSuperUser })

    const refreshedMember = await prisma.clanMember.findUnique({
      where: { id: parsedMemberId },
      include: {
        roles: {
          include: { role: true },
          orderBy: { assignedAt: 'desc' },
        },
      },
    })

    return Response.json({
      member: refreshedMember,
      roles: refreshedMember?.roles ?? [],
    })
  } catch (error) {
    console.error('Error assigning role:', error)
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 403 })
    }
    return Response.json({ error: 'Failed to assign role' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clanId: string; memberId: string }> }
) {
  try {
    const { clanId, memberId } = await params
    const parsedClanId = parsePositiveInt(clanId)
    const parsedMemberId = parsePositiveInt(memberId)

    if (!parsedClanId || !parsedMemberId) {
      return Response.json({ error: 'Invalid clan or member id' }, { status: 400 })
    }

    const isSuperUser = await isSuperUserSession(request)

    if (!isSuperUser) {
      const permissionError = await requirePermission('revoke_roles')(request, {
        clanId: parsedClanId,
        allowMissingActor: true,
      })
      if (permissionError) {
        return permissionError
      }
    }

    const actorMemberId = await getActorMemberId(request)
    if (!actorMemberId && !isSuperUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const member = await prisma.clanMember.findUnique({
      where: { id: parsedMemberId },
      include: {
        roles: {
          include: { role: true },
        },
      },
    })

    if (!member || !member.isActive || member.clanId !== parsedClanId) {
      return Response.json({ error: 'Member not found in clan' }, { status: 404 })
    }

    const memberHasOwnerRole = member.roles.some((entry) => entry.role.name === PREDEFINED_ROLES.OWNER.name)
    if (memberHasOwnerRole && !isSuperUser) {
      return Response.json(
        { error: 'Forbidden: only SuperUser can assign or revoke the Owner role' },
        { status: 403 }
      )
    }

    for (const entry of member.roles) {
      await revokeRole(parsedMemberId, entry.roleId, actorMemberId, { isSuperUser })
    }

    // Réassigner le rôle de base Member
    const defaultMemberRole = await prisma.clanRole.findUnique({
      where: { clanId_name: { clanId: parsedClanId, name: PREDEFINED_ROLES.MEMBER.name } },
      select: { id: true },
    })
    if (defaultMemberRole) {
      await assignRole(parsedMemberId, defaultMemberRole.id, actorMemberId, { isSuperUser })
    }

    const refreshedMember = await prisma.clanMember.findUnique({
      where: { id: parsedMemberId },
      include: {
        roles: {
          include: { role: true },
          orderBy: { assignedAt: 'desc' },
        },
      },
    })

    return Response.json({
      member: refreshedMember,
      roles: refreshedMember?.roles ?? [],
    })
  } catch (error) {
    console.error('Error revoking roles:', error)
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 403 })
    }
    return Response.json({ error: 'Failed to revoke roles' }, { status: 500 })
  }
}
