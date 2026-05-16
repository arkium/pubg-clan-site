import { NextResponse } from 'next/server'
import { syncAllActiveMembers } from '@/lib/sync-matches'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    console.log(`[sync-matches] Starting sync for clan "${clanId}"`)

    const result = await syncAllActiveMembers()

    console.log(
      `[sync-matches] Sync complete for clan "${clanId}": ` +
        `${result.synced}/${result.totalMembers} members, ` +
        `${result.totalImported} matches imported, ` +
        `${result.errors.length} error(s)`
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('[sync-matches] Fatal error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
