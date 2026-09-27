import { getClanLeague, type ClanLeaguePayload } from '@/lib/clan-league-service'
import type { StandardPeriod } from '@/lib/period'

export type { ClanLeaderboardEntry } from '@/lib/clans-leaderboard'

/**
 * Ligue Inter-Clans (`/clans-leaderboard`, docs/features/ligue-clans.md) : classement de la période au Power score,
 * rang sur la période précédente, clans sans partie, fil de la ligue et titres — calculés à la volée depuis les parties
 * officielles, 5 minutes en mémoire. Route publique, comme la page (vitrine de l'accueil).
 */
export type ClansLeaderboardResponse = ClanLeaguePayload

function parsePeriod(value: string | null): StandardPeriod {
  return value === 'month' || value === 'all' ? value : 'week'
}

export async function GET(request: Request) {
  try {
    const period = parsePeriod(new URL(request.url).searchParams.get('period'))
    return Response.json(await getClanLeague(period))
  } catch (error) {
    console.error('Error fetching clans leaderboard:', error)
    return Response.json({ error: 'Failed to fetch clans leaderboard' }, { status: 500 })
  }
}
