import { getSessionFromRequest } from '@/lib/auth-session'
import { getClanComparatorStats } from '@/lib/clan-comparator-service'
import { buildClanPairs, getHeadToHeadStats } from '@/lib/head-to-head-service'
import type { SquadPeriod } from '@/types/squad-matches'

const MAX_CLAN_IDS = 3

function parsePeriod(period: string | null): SquadPeriod {
  if (period === 'month' || period === 'all') return period
  return 'week'
}

function parseClanIds(clanIdsParam: string | null): number[] {
  if (!clanIdsParam) return []

  const parsed = clanIdsParam
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)

  return Array.from(new Set(parsed)).slice(0, MAX_CLAN_IDS)
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const clanIds = parseClanIds(url.searchParams.get('clanIds'))

    if (clanIds.length === 0) {
      return Response.json({ error: 'clanIds is required (comma-separated, up to 3 clan ids)' }, { status: 400 })
    }

    const period = parsePeriod(url.searchParams.get('period'))

    const [clans, headToHead] = await Promise.all([
      getClanComparatorStats(clanIds, period),
      Promise.all(buildClanPairs(clanIds).map(([a, b]) => getHeadToHeadStats(a, b))),
    ])

    return Response.json({ period, clans, headToHead })
  } catch (error) {
    console.error('Error fetching clan comparator stats:', error)
    return Response.json({ error: 'Failed to fetch clan comparator stats' }, { status: 500 })
  }
}
