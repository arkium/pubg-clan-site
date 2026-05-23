import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { assignRole, initializeDefaultRoles, PREDEFINED_ROLES, revokeRole } from '@/lib/role-service'
import { getActorMemberId, requirePermission } from '@/middleware/auth-permission'

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
      return NextResponse.json({ error: 'Invalid clan or member id' }, { status: 400 })
    }

    const permissionError = await requirePermission('assign_roles')(request, {
      clanId: parsedClanId,
    })
    if (permissionError) {
      return permissionError
    }

    const actorMemberId = await getActorMemberId(request)
    if (!actorMemberId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { roleId?: number } | null
    if (!body || typeof body.roleId !== 'number' || !Number.isInteger(body.roleId) || body.roleId <= 0) {
      return NextResponse.json({ error: 'Invalid role id' }, { status: 400 })
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
      return NextResponse.json({ error: 'Member not found in clan' }, { status: 404 })
    }

    const nextRole = await prisma.clanRole.findUnique({
      where: { id: body.roleId },
      select: { id: true, name: true, clanId: true },
    })

    if (!nextRole || nextRole.clanId !== parsedClanId) {
      return NextResponse.json({ error: 'Role not found in clan' }, { status: 404 })
    }

    const hasOwnerRole = member.roles.some((entry) => entry.role.name === PREDEFINED_ROLES.OWNER.name)
    if (hasOwnerRole && nextRole.name !== PREDEFINED_ROLES.OWNER.name) {
      return NextResponse.json({ error: 'Owner role cannot be modified' }, { status: 403 })
    }

    if (!hasOwnerRole && nextRole.name === PREDEFINED_ROLES.OWNER.name) {
      return NextResponse.json({ error: 'Owner role cannot be assigned manually' }, { status: 403 })
    }

    const currentRoleIds = member.roles.map((entry) => entry.roleId)
    for (const roleId of currentRoleIds) {
      if (roleId !== nextRole.id) {
        await revokeRole(parsedMemberId, roleId, actorMemberId)
      }
    }

    await assignRole(parsedMemberId, nextRole.id, actorMemberId)

    const refreshedMember = await prisma.clanMember.findUnique({
      where: { id: parsedMemberId },
      include: {
        roles: {
          include: { role: true },
          orderBy: { assignedAt: 'desc' },
        },
      },
    })

    return NextResponse.json({
      member: refreshedMember,
      roles: refreshedMember?.roles ?? [],
    })
  } catch (error) {
    console.error('Error assigning role:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 })
  }
}
