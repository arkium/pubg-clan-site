import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { assignDefaultMemberRole, initializeDefaultRoles } from '@/lib/role-service'
import { requirePermission } from '@/middleware/auth-permission'

type PermissionMap = Record<string, boolean>

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function readPermissionMap(value: unknown): PermissionMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const resolved: PermissionMap = {}
  for (const [key, current] of Object.entries(value)) {
    if (current === true) {
      resolved[key] = true
    }
  }

  return resolved
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requirePermission('manage_members')(request, {
      clanId: parsedClanId,
    })
    if (permissionError) {
      return permissionError
    }

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: { id: true },
    })

    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    await initializeDefaultRoles(parsedClanId)

    const members = await prisma.clanMember.findMany({
      where: { clanId: parsedClanId, isActive: true },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        identities: {
          select: {
            id: true,
          },
        },
        invites: {
          where: {
            acceptedAt: null,
            revokedAt: null,
            expiresAt: {
              gt: new Date(),
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            id: true,
            email: true,
            expiresAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    await Promise.all(
      members
        .filter((member) => member.roles.length === 0)
        .map((member) => assignDefaultMemberRole(member.id, parsedClanId))
    )

    const refreshedMembers = await prisma.clanMember.findMany({
      where: { clanId: parsedClanId, isActive: true },
      include: {
        roles: {
          include: {
            role: true,
          },
          orderBy: {
            assignedAt: 'desc',
          },
        },
        identities: {
          select: {
            id: true,
          },
        },
        invites: {
          where: {
            acceptedAt: null,
            revokedAt: null,
            expiresAt: {
              gt: new Date(),
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            id: true,
            email: true,
            expiresAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const payload = refreshedMembers.map((member) => {
      const roleNames = member.roles.map((entry) => entry.role.name)
      const permissionKeys = new Set<string>()

      for (const memberRole of member.roles) {
        const map = readPermissionMap(memberRole.role.permissions)
        for (const [key, value] of Object.entries(map)) {
          if (value) {
            permissionKeys.add(key)
          }
        }
      }

      return {
        id: member.id,
        name: member.displayName,
        role: roleNames[0] ?? 'Member',
        roles: member.roles.map((entry) => ({
          id: entry.id,
          roleId: entry.roleId,
          name: entry.role.name,
          assignedAt: entry.assignedAt,
        })),
        permissions: Array.from(permissionKeys),
        joinedAt: member.createdAt,
        hasAccount: member.identities.length > 0,
        pendingInvite: member.invites[0]
          ? {
              id: member.invites[0].id,
              email: member.invites[0].email,
              expiresAt: member.invites[0].expiresAt,
            }
          : null,
      }
    })

    return NextResponse.json({ members: payload })
  } catch (error) {
    console.error('Error fetching clan members with roles:', error)
    return NextResponse.json({ error: 'Failed to fetch clan members' }, { status: 500 })
  }
}
