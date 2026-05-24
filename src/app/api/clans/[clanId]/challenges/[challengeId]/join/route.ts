import { NextResponse } from 'next/server'

import { joinChallenge } from '@/lib/challenge-service'
import { prisma } from '@/lib/prisma'
import { getActorMemberId } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string; challengeId: string }> }
) {
  try {
    const { clanId, challengeId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const memberId = await getActorMemberId(request)
    if (!memberId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: { clan: { select: { id: true } }, isActive: true },
    })

    if (!member || !member.isActive || member.clan?.id !== parsedClanId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const participant = await joinChallenge(challengeId, memberId)

    return NextResponse.json({ participant }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to join challenge'
    const status = message === 'Challenge is not active' ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
