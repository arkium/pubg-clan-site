import { NextRequest } from 'next/server'

import { requireNavPermission } from '@/middleware/auth-permission'
import { getLeaderboard } from '@/lib/challenge-service'
import { prisma } from '@/lib/prisma'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string; challengeId: string }> }
) {
  try {
    const { clanId, challengeId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireNavPermission('clan.challenges')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    const challengeExists = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, clanId: true },
    })

    if (!challengeExists || challengeExists.clanId !== parsedClanId) {
      return Response.json({ error: 'Challenge not found' }, { status: 404 })
    }

    const { challenge, leaderboard } = await getLeaderboard(challengeId)

    return Response.json({ challenge, leaderboard })
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    return Response.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
