import { NextRequest } from 'next/server'

import { requireRole } from '@/middleware/auth-permission'
import { getCachedOrComputeClanAwards, type AwardPeriod } from '@/lib/awards-service'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): AwardPeriod {
  if (value === 'month' || value === 'all') return value
  return 'week'
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

    const roleError = await requireRole(['Owner', 'Admin', 'Member'])(request, {
      clanId: parsedClanId,
      readOnly: true,
    })
    if (roleError) return roleError

    const url = new URL(request.url)
    const period = parsePeriod(url.searchParams.get('period'))

    const awards = await getCachedOrComputeClanAwards(parsedClanId, period)

    return Response.json(awards)
  } catch (error) {
    console.error('[awards] GET error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
