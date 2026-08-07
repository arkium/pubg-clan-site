import { NextRequest, NextResponse } from 'next/server'

import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import { SquadPeriod } from '@/types/squad-matches'

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
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireNavPermission('clan.overview')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    const period = parsePeriod(request.nextUrl.searchParams.get('period'))

    const cacheEntry = await prisma.clanMatchesCache.findUnique({
      where: {
        clanId_period: {
          clanId: parsedClanId,
          period,
        },
      },
    })

    if (!cacheEntry) {
      // For the very first time, if cron hasn't run yet, we might return empty state
      // but ideally we'd compute on the fly or just return null.
      return NextResponse.json({ error: 'Stats not ready for this period' }, { status: 404 })
    }

    return NextResponse.json({
      period: cacheEntry.period,
      periodKey: cacheEntry.periodKey,
      payload: cacheEntry.payload,
      computedAt: cacheEntry.computedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching matches stats cache:', error)
    return NextResponse.json({ error: 'Failed to fetch matches stats cache' }, { status: 500 })
  }
}
