import { NextRequest } from 'next/server'

import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import { SquadPeriod } from '@/types/squad-matches'
import { parseClanMatchTypeFilter } from '@/lib/match-type-filter'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(period: string | null): SquadPeriod {
  if (period === 'month' || period === 'month-1' || period === 'month-2' || period === 'all') {
    return period
  }

  return 'week'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireNavPermission('clan.overview')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    const period = parsePeriod(request.nextUrl.searchParams.get('period'))
    const matchType = parseClanMatchTypeFilter(request.nextUrl.searchParams.get('matchType'))

    const cacheEntry = await prisma.clanMatchesCache.findUnique({
      where: {
        clanId_period_matchType: {
          clanId: parsedClanId,
          period,
          matchType,
        },
      },
    })

    if (!cacheEntry) {
      // For the very first time, if cron hasn't run yet, we might return empty state
      // but ideally we'd compute on the fly or just return null.
      return Response.json({ error: 'Stats not ready for this period' }, { status: 404 })
    }

    return Response.json({
      period: cacheEntry.period,
      matchType: cacheEntry.matchType,
      periodKey: cacheEntry.periodKey,
      payload: cacheEntry.payload,
      computedAt: cacheEntry.computedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching matches stats cache:', error)
    return Response.json({ error: 'Failed to fetch matches stats cache' }, { status: 500 })
  }
}
