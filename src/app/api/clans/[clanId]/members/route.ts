import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { assignDefaultMemberRole, initializeDefaultRoles } from '@/lib/role-service'
import { getActorMemberId, requirePermission } from '@/middleware/auth-permission'

type PermissionMap = Record<string, boolean>

const ROLE_PRIORITY: Record<string, number> = {
  Owner: 4,
  Admin: 3,
  Moderator: 2,
  Member: 1,
}

function resolvePrimaryRoleName(roleNames: string[]) {
  if (roleNames.length === 0) {
    return 'Member'
  }

  return [...roleNames].sort((left, right) => {
    const leftPriority = ROLE_PRIORITY[left] ?? 0
    const rightPriority = ROLE_PRIORITY[right] ?? 0

    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority
    }

    return left.localeCompare(right)
  })[0]
}

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
      allowMissingActor: true,
    })
    if (permissionError) {
      return permissionError
    }

    const actorMemberId = await getActorMemberId(request)
    if (!actorMemberId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
            user: {
              select: {
                avatarUrl: true,
              },
            },
          },
        },
        invites: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
          select: {
            id: true,
            email: true,
            expiresAt: true,
            acceptedAt: true,
            revokedAt: true,
            createdAt: true,
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
            user: {
              select: {
                avatarUrl: true,
              },
            },
          },
        },
        invites: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
          select: {
            id: true,
            email: true,
            expiresAt: true,
            acceptedAt: true,
            revokedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const payload = refreshedMembers.map((member) => {
      const roleNames = member.roles.map((entry) => entry.role.name)
      const primaryRole = resolvePrimaryRoleName(roleNames)
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
        role: primaryRole,
        roles: member.roles.map((entry) => ({
          id: entry.id,
          roleId: entry.roleId,
          name: entry.role.name,
          assignedAt: entry.assignedAt,
        })),
        permissions: Array.from(permissionKeys),
        joinedAt: member.createdAt,
        hasAccount: member.identities.length > 0,
        avatarUrl: member.identities[0]?.user.avatarUrl ?? null,
        pendingInvite:
          member.invites.find(
            (invite) => !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date()
          ) ?? null,
        recentInvites: member.invites.map((invite) => ({
          id: invite.id,
          email: invite.email,
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
          acceptedAt: invite.acceptedAt,
          revokedAt: invite.revokedAt,
        })),
      }
    })

    return NextResponse.json({ members: payload })
  } catch (error) {
    console.error('Error fetching clan members with roles:', error)
    return NextResponse.json({ error: 'Failed to fetch clan members' }, { status: 500 })
  }
}
