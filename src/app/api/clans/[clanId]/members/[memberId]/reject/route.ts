import { NextRequest } from 'next/server'

import { withAdminActionLog } from '@/lib/admin-action-log'
import { requireClanFeature } from '@/lib/auth/admin-guards'
import { prisma } from '@/lib/prisma'

function parsePositiveInt(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function handlePost(
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

    const roleError = await requireClanFeature(request, parsedClanId, 'clan-members')
    if (roleError) {
      return roleError
    }

    const member = await prisma.clanMember.findUnique({
      where: { id: parsedMemberId },
      select: {
        id: true,
        displayName: true,
        clanId: true,
        isActive: true,
        joinStatus: true,
      },
    })

    if (!member || member.clanId !== parsedClanId) {
      return Response.json({ error: 'Member not found in clan' }, { status: 404 })
    }

    if (member.isActive || member.joinStatus !== 'pending') {
      return Response.json({ error: 'Member is not pending' }, { status: 400 })
    }

    const rejectedMember = await prisma.clanMember.update({
      where: { id: parsedMemberId },
      data: {
        isActive: false,
        joinStatus: 'rejected',
      },
      select: {
        id: true,
        displayName: true,
        joinStatus: true,
      },
    })

    return Response.json({
      message: `${rejectedMember.displayName} has been rejected`,
      member: rejectedMember,
    })
  } catch (error) {
    console.error('Member rejection error:', error)
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ error: 'Failed to reject member' }, { status: 500 })
  }
}

export const POST = withAdminActionLog('clans/[clanId]/members/[memberId]/reject', handlePost)
