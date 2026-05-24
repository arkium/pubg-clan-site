import { NextResponse } from 'next/server'

import { createOwnerBootstrapInvite } from '@/lib/auth-service'
import { getLoginWelcomeSettings, getPrimaryClanLabel } from '@/lib/login-welcome-service'
import { prisma } from '@/lib/prisma'
import { getSetupState } from '@/lib/setup-service'
import { PREDEFINED_ROLES } from '@/lib/role-service'

export const dynamic = 'force-dynamic'

async function getPendingOwnerInvite() {
  return prisma.memberInvite.findFirst({
    where: {
      acceptedAt: null,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
      member: {
        isActive: true,
        roles: {
          some: {
            role: {
              name: PREDEFINED_ROLES.OWNER.name,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      email: true,
      expiresAt: true,
      clanId: true,
      member: {
        select: {
          displayName: true,
        },
      },
    },
  })
}

export async function GET() {
  const setupState = await getSetupState()
  if (setupState !== 'pending_activation') {
    return NextResponse.json({ error: 'Pending activation not active' }, { status: 409 })
  }

  const [settings, clanLabel, invite] = await Promise.all([
    getLoginWelcomeSettings(),
    getPrimaryClanLabel(),
    getPendingOwnerInvite(),
  ])

  return NextResponse.json({
    settings,
    clanLabel,
    invite: invite
      ? {
          email: invite.email,
          expiresAt: invite.expiresAt,
          displayName: invite.member.displayName,
        }
      : null,
  })
}

export async function POST() {
  const setupState = await getSetupState()
  if (setupState !== 'pending_activation') {
    return NextResponse.json({ error: 'Pending activation not active' }, { status: 409 })
  }

  const invite = await getPendingOwnerInvite()
  if (!invite) {
    return NextResponse.json({ error: 'No pending owner invite found' }, { status: 404 })
  }

  const resent = await createOwnerBootstrapInvite({
    clanId: invite.clanId,
    email: invite.email,
  })

  return NextResponse.json({
    success: true,
    invite: {
      email: invite.email,
      expiresAt: resent.expiresAt,
      displayName: resent.ownerMember.displayName,
    },
  })
}