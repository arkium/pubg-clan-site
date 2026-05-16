import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clanId: string; challengeId: string }> }
) {
  try {
    const { clanId, challengeId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        participants: {
          orderBy: { progress: 'desc' },
          include: { member: { select: { id: true, displayName: true } } },
        },
      },
    })

    if (!challenge || challenge.clanId !== parsedClanId) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 })
    }

    return NextResponse.json({ challenge })
  } catch (error) {
    console.error('Error fetching challenge:', error)
    return NextResponse.json({ error: 'Failed to fetch challenge' }, { status: 500 })
  }
}
