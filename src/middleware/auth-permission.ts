import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth-session'
import { getNavItemRole } from '@/lib/nav-permissions-service'
import { prisma } from '@/lib/prisma'
import { hasAnyRole, hasPermission } from '@/lib/role-service'

const ALLOW_LEGACY_ACTOR_RESOLUTION = process.env.AUTH_ALLOW_LEGACY_ACTOR_ID === 'true'

function parseMemberId(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function getActorMemberId(request: Request) {
  const session = await getSessionFromRequest(request)
  if (session?.activeMemberId) {
    return session.activeMemberId
  }

  if (!ALLOW_LEGACY_ACTOR_RESOLUTION) {
    return null
  }

  const fromHeader = parseMemberId(
    request.headers.get('x-member-id') ?? request.headers.get('x-clan-member-id')
  )
  if (fromHeader) return fromHeader

  const url = new URL(request.url)
  return parseMemberId(url.searchParams.get('actorMemberId') ?? url.searchParams.get('memberId'))
}

type PermissionGuardOptions = {
  clanId?: number
  allowMissingActor?: boolean
}

async function ensureMemberInClan(memberId: number, clanId: number) {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
    select: { clanId: true, isActive: true },
  })

  return !!member && member.isActive && member.clanId === clanId
}

export function requirePermission(permission: string) {
  return async function checkPermission(request: Request, options?: PermissionGuardOptions) {
    const actorMemberId = await getActorMemberId(request)

    if (!actorMemberId) {
      if (options?.allowMissingActor) {
        return null
      }

      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (options?.clanId) {
      const inClan = await ensureMemberInClan(actorMemberId, options.clanId)
      if (!inClan) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const allowed = await hasPermission(actorMemberId, permission)
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return null
  }
}

export function requireRole(roleNames: string[]) {
  return async function checkRole(request: Request, options?: PermissionGuardOptions) {
    const actorMemberId = await getActorMemberId(request)

    if (!actorMemberId) {
      if (options?.allowMissingActor) {
        return null
      }

      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (options?.clanId) {
      const inClan = await ensureMemberInClan(actorMemberId, options.clanId)
      if (!inClan) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const allowed = await hasAnyRole(actorMemberId, roleNames)
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return null
  }
}

export function requireNavPermission(navKey: string) {
  return async function checkNavPermission(request: Request, options?: PermissionGuardOptions) {
    const actorMemberId = await getActorMemberId(request)

    if (!actorMemberId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (options?.clanId) {
      const inClan = await ensureMemberInClan(actorMemberId, options.clanId)
      if (!inClan) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const role = await getNavItemRole(navKey)

    if (role === 'hidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (role === 'none' || role === 'member') {
      return null
    }

    if (role === 'admin') {
      const isAdmin = await hasPermission(actorMemberId, '*')
        || await hasPermission(actorMemberId, 'manage_members')
        || await hasPermission(actorMemberId, 'manage_roles')
        || await hasPermission(actorMemberId, 'manage_settings')
      if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return null
    }

    // role === 'owner'
    const isOwner = await hasPermission(actorMemberId, '*')
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return null
  }
}
