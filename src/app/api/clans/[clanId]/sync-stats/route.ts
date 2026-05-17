import { NextResponse } from 'next/server'

import { syncTrackedClanStats } from '@/lib/clan-service'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const clan = await syncTrackedClanStats(parsedClanId)

    return NextResponse.json({
      clanId: clan.id,
      clanName: clan.name,
      tag: clan.tag,
      platformShard: clan.platformShard,
      pubgClanId: clan.pubgClanId,
      clanStats: clan.clanStats,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Clan not found') {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    console.error('Error syncing clan stats:', error)
    return NextResponse.json(
      { error: 'Failed to synchronize clan stats' },
      { status: 500 }
    )
  }
}
