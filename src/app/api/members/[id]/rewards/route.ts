import { NextRequest } from 'next/server'

import { prisma } from '@/lib/prisma'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

function parseMemberId(memberId: string) {
  const parsed = Number(memberId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const parsedMemberId = parseMemberId(id)

    if (!parsedMemberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(parsedMemberId, request, { readOnly: true })
    if (authError) return authError

    const member = await prisma.clanMember.findUnique({
      where: { id: parsedMemberId },
      select: {
        id: true,
        displayName: true,
        isActive: true,
        playerRewards: true,
      },
    })

    if (!member || !member.isActive) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    return Response.json({
      displayName: member.displayName,
      rewards: member.playerRewards
        ? {
            totalPoints: member.playerRewards.totalPoints,
            badges: member.playerRewards.badges as string[],
          }
        : null,
    })
  } catch (error) {
    console.error('Error fetching member rewards:', error)
    return Response.json({ error: 'Failed to fetch rewards' }, { status: 500 })
  }
}
