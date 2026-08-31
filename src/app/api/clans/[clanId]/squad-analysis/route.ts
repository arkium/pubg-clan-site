import { NextRequest } from 'next/server'

import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import { getClanSquadAnalysis } from '@/lib/squad-detector'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireNavPermission('clan.stats')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: {
        id: true,
        name: true,
      },
    })

    if (!clan) {
      return Response.json({ error: 'Clan not found' }, { status: 404 })
    }

    const analysis = await getClanSquadAnalysis(clan.id)

    return Response.json({
      clanId: clan.id,
      clanName: clan.name,
      ...analysis,
    })
  } catch (error) {
    console.error('Error fetching squad analysis:', error)
    return Response.json(
      { error: 'Failed to fetch squad analysis' },
      { status: 500 }
    )
  }
}
