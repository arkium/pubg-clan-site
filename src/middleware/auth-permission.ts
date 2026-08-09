import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth-session'
import { getNavItemRole } from '@/lib/nav-permissions-service'
import { prisma } from '@/lib/prisma'
import { hasAnyRole, hasPermission } from '@/lib/role-service'

export async function isSuperUserSession(request: Request): Promise<boolean> {
  const session = await getSessionFromRequest(request)
  if (!session) return false
  const user = await prisma.userAccount.findUnique({
    where: { id: session.userId },
    select: { isSuperUser: true },
  })
  return user?.isSuperUser === true
}

export async function requireSuperUser(request: Request): Promise<NextResponse | null> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.userAccount.findUnique({
    where: { id: session.userId },
    select: { isSuperUser: true },
  })
  if (!user?.isSuperUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

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

/**
 * Ensures the caller belongs to the same clan as the target member.
 * SuperUsers bypass this check. Returns a 401/403/404 Response on failure, null on success.
 */
export async function requireSameClanAsMember(
  targetMemberId: number,
  request: Request
): Promise<NextResponse | null> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.userAccount.findUnique({
    where: { id: session.userId },
    select: { isSuperUser: true },
  })
  if (user?.isSuperUser) return null

  const actorMemberId = session.activeMemberId
  if (!actorMemberId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const targetMember = await prisma.clanMember.findUnique({
    where: { id: targetMemberId },
    select: { clanId: true },
  })
  if (!targetMember) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (!targetMember.clanId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actorMember = await prisma.clanMember.findUnique({
    where: { id: actorMemberId },
    select: { clanId: true, isActive: true },
  })
  if (!actorMember || !actorMember.isActive || actorMember.clanId !== targetMember.clanId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return null
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

    // SuperUsers bypass clan membership and permission checks
    if (await isSuperUserSession(request)) {
      return null
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

    // SuperUsers bypass clan membership and role checks
    if (await isSuperUserSession(request)) {
      return null
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

    // SuperUsers bypass clan membership checks (they may browse any clan)
    const isSU = await isSuperUserSession(request)

    if (!isSU && options?.clanId) {
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
      if (isSU) {
        return null
      }
      const isAdmin = await hasPermission(actorMemberId, '*')
        || await hasPermission(actorMemberId, 'manage_members')
        || await hasPermission(actorMemberId, 'manage_roles')
        || await hasPermission(actorMemberId, 'manage_settings')
      if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return null
    }

    if (role === 'superuser') {
      if (!isSU) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return null
    }

    // role === 'owner'
    if (isSU) {
      return null
    }
    const isOwner = await hasPermission(actorMemberId, '*')
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return null
  }
}
