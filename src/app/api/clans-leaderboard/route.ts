import { NextRequest } from 'next/server'

import { computeClansLeaderboard, type ClanLeaderboardEntry, type ClansLeaderboardPeriod } from '@/lib/clans-leaderboard'

export type { ClanLeaderboardEntry } from '@/lib/clans-leaderboard'

export interface ClansLeaderboardResponse {
  period: ClansLeaderboardPeriod
  leaderboard: ClanLeaderboardEntry[]
}

function parsePeriod(value: string | null): ClansLeaderboardPeriod {
  if (value === 'week') return 'week'
  if (value === 'month') return 'month'
  return 'all'
}

export async function GET(request: NextRequest) {
  try {
    const period = parsePeriod(request.nextUrl.searchParams.get('period'))
    return Response.json({ period, leaderboard: await computeClansLeaderboard(period) })
  } catch (error) {
    console.error('Error fetching clans leaderboard:', error)
    return Response.json({ error: 'Failed to fetch clans leaderboard' }, { status: 500 })
  }
}
