import { NextRequest } from 'next/server'

import { syncTrackedClanStats } from '@/lib/clan-service'
import { isInternalCronRequest } from '@/lib/internal-api'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    if (!isInternalCronRequest(request)) {
      const roleError = await requireRole(['Owner'])(request, {
        clanId: parsedClanId,
      })

      if (roleError) {
        return roleError
      }
    }

    const clan = await syncTrackedClanStats(parsedClanId)

    return Response.json({
      clanId: clan.id,
      clanName: clan.name,
      tag: clan.tag,
      platformShard: clan.platformShard,
      pubgClanId: clan.pubgClanId,
      clanStats: clan.clanStats,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Clan not found') {
      return Response.json({ error: 'Clan not found' }, { status: 404 })
    }

    console.error('Error syncing clan stats:', error)
    return Response.json(
      { error: 'Failed to synchronize clan stats' },
      { status: 500 }
    )
  }
}
