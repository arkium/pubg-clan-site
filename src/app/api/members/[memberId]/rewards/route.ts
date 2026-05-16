import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

function parseMemberId(memberId: string) {
  const parsed = Number(memberId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params
    const parsedMemberId = parseMemberId(memberId)

    if (!parsedMemberId) {
      return NextResponse.json({ error: 'Invalid member id' }, { status: 400 })
    }

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
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    return NextResponse.json({
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
    return NextResponse.json({ error: 'Failed to fetch rewards' }, { status: 500 })
  }
}
