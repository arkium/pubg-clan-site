import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

type PermissionMap = Record<string, boolean>

type PermissionCatalogItem = {
  key: string
  name: string
  description: string
  category: string
}

const PERMISSION_TTL_MS = 30_000

const permissionCache = new Map<
  number,
  {
    expiresAt: number
    permissions: Set<string>
    wildcard: boolean
  }
>()

const PERMISSION_CATALOG: PermissionCatalogItem[] = [
  { key: 'edit_clan', name: 'Edit Clan', description: 'Edit clan profile', category: 'clan_management' },
  { key: 'edit_clan_settings', name: 'Edit Clan Settings', description: 'Edit clan settings', category: 'clan_management' },
  { key: 'delete_clan', name: 'Delete Clan', description: 'Delete clan', category: 'clan_management' },
  { key: 'manage_members', name: 'Manage Members', description: 'Manage clan members', category: 'member_management' },
  { key: 'invite_members', name: 'Invite Members', description: 'Invite new members', category: 'member_management' },
  { key: 'remove_members', name: 'Remove Members', description: 'Remove members', category: 'member_management' },
  { key: 'kick_members', name: 'Kick Members', description: 'Kick members from clan', category: 'member_management' },
  { key: 'ban_members', name: 'Ban Members', description: 'Ban members from clan', category: 'member_management' },
  { key: 'manage_roles', name: 'Manage Roles', description: 'Manage clan roles', category: 'role_management' },
  { key: 'assign_roles', name: 'Assign Roles', description: 'Assign roles to members', category: 'role_management' },
  { key: 'revoke_roles', name: 'Revoke Roles', description: 'Revoke roles from members', category: 'role_management' },
  { key: 'view_reports', name: 'View Reports', description: 'View clan reports', category: 'reports' },
  { key: 'view_leaderboard', name: 'View Leaderboard', description: 'View leaderboard', category: 'reports' },
  { key: 'view_notifications', name: 'View Notifications', description: 'View notifications', category: 'reports' },
  { key: 'export_reports', name: 'Export Reports', description: 'Export reports', category: 'reports' },
  { key: 'moderate_members', name: 'Moderate Members', description: 'Moderate members', category: 'moderation' },
  { key: 'manage_notifications', name: 'Manage Notifications', description: 'Manage notifications', category: 'moderation' },
  { key: 'manage_channels', name: 'Manage Channels', description: 'Manage channels', category: 'moderation' },
  { key: 'manage_settings', name: 'Manage Settings', description: 'Manage settings', category: 'settings' },
  { key: 'manage_integrations', name: 'Manage Integrations', description: 'Manage integrations', category: 'settings' },
]

export const PREDEFINED_ROLES = {
  OWNER: {
    name: 'Owner',
    description: 'Full control of the clan',
    permissions: ['*'],
  },
  ADMIN: {
    name: 'Admin',
    description: 'Manage members and settings',
    permissions: ['edit_clan', 'manage_members', 'view_reports', 'manage_roles', 'manage_settings', 'assign_roles', 'revoke_roles'],
  },
  MODERATOR: {
    name: 'Moderator',
    description: 'Moderation and basic management',
    permissions: ['moderate_members', 'view_reports', 'manage_notifications'],
  },
  MEMBER: {
    name: 'Member',
    description: 'Standard clan access',
    permissions: ['view_reports', 'view_leaderboard', 'view_notifications'],
  },
} as const

function permissionListToMap(permissionKeys: readonly string[]): Prisma.InputJsonValue {
  return permissionKeys.reduce<PermissionMap>((acc, key) => {
    acc[key] = true
    return acc
  }, {})
}

function readPermissionMap(value: Prisma.JsonValue): PermissionMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const parsed: PermissionMap = {}
  for (const [key, current] of Object.entries(value)) {
    if (current === true) {
      parsed[key] = true
    }
  }
  return parsed
}

function invalidateMemberPermissionCache(memberId: number) {
  permissionCache.delete(memberId)
}

async function ensurePermissionCatalog() {
  await Promise.all(
    PERMISSION_CATALOG.map((permission) =>
      prisma.permission.upsert({
        where: { key: permission.key },
        update: {
          name: permission.name,
          description: permission.description,
          category: permission.category,
        },
        create: permission,
      })
    )
  )
}

async function ensureOwnerBootstrap(clanId: number) {
  const ownerRole = await prisma.clanRole.findUnique({
    where: { clanId_name: { clanId, name: PREDEFINED_ROLES.OWNER.name } },
    select: { id: true },
  })

  if (!ownerRole) {
    return
  }

  const ownerAssigned = await prisma.clanMemberRole.findFirst({
    where: { roleId: ownerRole.id },
    select: { id: true },
  })

  if (ownerAssigned) {
    return
  }

  const firstClanMember = await prisma.clanMember.findFirst({
    where: { clanId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })

  if (!firstClanMember) {
    return
  }

  await prisma.clanMemberRole.upsert({
    where: { memberId_roleId: { memberId: firstClanMember.id, roleId: ownerRole.id } },
    update: {},
    create: { memberId: firstClanMember.id, roleId: ownerRole.id },
  })

  invalidateMemberPermissionCache(firstClanMember.id)
}

export async function initializeDefaultRoles(clanId: number) {
  await ensurePermissionCatalog()

  for (const role of Object.values(PREDEFINED_ROLES)) {
    await prisma.clanRole.upsert({
      where: { clanId_name: { clanId, name: role.name } },
      update: {
        description: role.description,
        permissions: permissionListToMap(role.permissions),
      },
      create: {
        clanId,
        name: role.name,
        description: role.description,
        permissions: permissionListToMap(role.permissions),
      },
    })
  }

  await ensureOwnerBootstrap(clanId)

  return prisma.clanRole.findMany({
    where: { clanId },
    orderBy: { name: 'asc' },
  })
}

export async function assignDefaultMemberRole(memberId: number, clanId: number) {
  await initializeDefaultRoles(clanId)

  const [memberRole, ownerRole] = await Promise.all([
    prisma.clanRole.findUnique({
      where: { clanId_name: { clanId, name: PREDEFINED_ROLES.MEMBER.name } },
      select: { id: true },
    }),
    prisma.clanRole.findUnique({
      where: { clanId_name: { clanId, name: PREDEFINED_ROLES.OWNER.name } },
      select: { id: true },
    }),
  ])

  if (!memberRole) {
    return null
  }

  // The clan owner should not receive the default Member role.
  if (ownerRole) {
    const hasOwnerRole = await prisma.clanMemberRole.findUnique({
      where: { memberId_roleId: { memberId, roleId: ownerRole.id } },
      select: { memberId: true },
    })

    if (hasOwnerRole) {
      return null
    }
  }

  const result = await prisma.clanMemberRole.upsert({
    where: { memberId_roleId: { memberId, roleId: memberRole.id } },
    update: {},
    create: { memberId, roleId: memberRole.id },
  })

  invalidateMemberPermissionCache(memberId)
  return result
}

export async function hasAnyRole(memberId: number, roleNames: string[]) {
  if (roleNames.length === 0) return true

  const count = await prisma.clanMemberRole.count({
    where: {
      memberId,
      role: {
        name: {
          in: roleNames,
        },
      },
    },
  })

  return count > 0
}

async function resolveMemberPermissionState(memberId: number) {
  const cached = permissionCache.get(memberId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached
  }

  const memberRoles = await prisma.clanMemberRole.findMany({
    where: { memberId },
    include: {
      role: {
        select: { permissions: true },
      },
    },
  })

  const permissions = new Set<string>()
  let wildcard = false

  for (const memberRole of memberRoles) {
    const map = readPermissionMap(memberRole.role.permissions)
    if (map['*']) {
      wildcard = true
    }

    for (const key of Object.keys(map)) {
      if (map[key]) {
        permissions.add(key)
      }
    }
  }

  const computed = {
    expiresAt: Date.now() + PERMISSION_TTL_MS,
    permissions,
    wildcard,
  }

  permissionCache.set(memberId, computed)
  return computed
}

export async function getMemberPermissionKeys(memberId: number) {
  const state = await resolveMemberPermissionState(memberId)
  const keys = Array.from(state.permissions).sort((a, b) => a.localeCompare(b))

  if (state.wildcard) {
    return ['*', ...keys]
  }

  return keys
}

export async function hasPermission(memberId: number, permission: string) {
  const state = await resolveMemberPermissionState(memberId)
  return state.wildcard || state.permissions.has(permission)
}

export async function assignRole(memberId: number, roleId: number, assignedBy: number) {
  const actor = await prisma.clanMember.findUnique({
    where: { id: assignedBy },
    select: { id: true, clanId: true, isActive: true },
  })

  if (!actor || !actor.isActive || !actor.clanId) {
    throw new Error('Assigning member not found in a clan')
  }

  const canAssign = (await hasPermission(assignedBy, 'assign_roles')) || (await hasPermission(assignedBy, 'manage_roles'))
  if (!canAssign) {
    throw new Error('Insufficient permission to assign role')
  }

  const [member, role] = await Promise.all([
    prisma.clanMember.findUnique({
      where: { id: memberId },
      select: { id: true, clanId: true, isActive: true },
    }),
    prisma.clanRole.findUnique({
      where: { id: roleId },
      select: { id: true, clanId: true, name: true },
    }),
  ])

  if (!member || !member.isActive || !member.clanId) {
    throw new Error('Member not found in a clan')
  }

  if (!role || role.clanId !== member.clanId || role.clanId !== actor.clanId) {
    throw new Error('Role not found for member clan')
  }

  if (role.name === PREDEFINED_ROLES.OWNER.name && assignedBy !== memberId) {
    throw new Error('Owner role can only be self-assigned during bootstrap')
  }

  const assigned = await prisma.clanMemberRole.upsert({
    where: { memberId_roleId: { memberId, roleId } },
    update: { assignedBy },
    create: { memberId, roleId, assignedBy },
  })

  invalidateMemberPermissionCache(memberId)
  console.info(`[RoleAudit] Role ${roleId} assigned to member ${memberId} by ${assignedBy}`)
  return assigned
}

export async function revokeRole(memberId: number, roleId: number, revokedBy?: number) {
  const existing = await prisma.clanMemberRole.findUnique({
    where: { memberId_roleId: { memberId, roleId } },
    include: { role: { select: { id: true, name: true } } },
  })

  if (!existing) {
    return null
  }

  if (existing.role.name === PREDEFINED_ROLES.OWNER.name) {
    throw new Error('Owner role cannot be revoked')
  }

  if (revokedBy) {
    const canRevoke =
      (await hasPermission(revokedBy, 'revoke_roles')) || (await hasPermission(revokedBy, 'manage_roles'))
    if (!canRevoke) {
      throw new Error('Insufficient permission to revoke role')
    }
  }

  await prisma.clanMemberRole.delete({
    where: { memberId_roleId: { memberId, roleId } },
  })

  invalidateMemberPermissionCache(memberId)
  console.info(`[RoleAudit] Role ${roleId} revoked from member ${memberId}${revokedBy ? ` by ${revokedBy}` : ''}`)
  return existing
}

export function clearPermissionCache(memberId?: number) {
  if (typeof memberId === 'number') {
    invalidateMemberPermissionCache(memberId)
    return
  }

  permissionCache.clear()
}

export async function canEditClan(memberId: number) {
  return hasPermission(memberId, 'edit_clan')
}

export async function canManageMembers(memberId: number) {
  return hasPermission(memberId, 'manage_members')
}

export async function canViewReports(memberId: number) {
  return hasPermission(memberId, 'view_reports')
}

export async function canManageRoles(memberId: number) {
  return hasPermission(memberId, 'manage_roles')
}
