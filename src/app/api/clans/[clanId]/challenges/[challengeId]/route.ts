import { NextRequest } from 'next/server'

import { requireNavPermission } from '@/middleware/auth-permission'
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
      return Response.json({ error: 'Challenge not found' }, { status: 404 })
    }

    return Response.json({ challenge })
  } catch (error) {
    console.error('Error fetching challenge:', error)
    return Response.json({ error: 'Failed to fetch challenge' }, { status: 500 })
  }
}
