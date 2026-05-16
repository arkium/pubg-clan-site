import { NextResponse } from 'next/server'

import { getLeaderboard } from '@/lib/challenge-service'
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

    const challengeExists = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, clanId: true },
    })

    if (!challengeExists || challengeExists.clanId !== parsedClanId) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 })
    }

    const { challenge, leaderboard } = await getLeaderboard(challengeId)

    return NextResponse.json({ challenge, leaderboard })
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
