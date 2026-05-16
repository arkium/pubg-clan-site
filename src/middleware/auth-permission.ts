import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { hasAnyRole, hasPermission } from '@/lib/role-service'

function parseMemberId(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function getActorMemberId(request: Request) {
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
    const actorMemberId = getActorMemberId(request)

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
    const actorMemberId = getActorMemberId(request)

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
