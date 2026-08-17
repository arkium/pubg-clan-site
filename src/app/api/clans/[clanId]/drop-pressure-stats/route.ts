import {
  getDropPressureDashboardStats,
  getDropPressureMemberRanking,
  getDropPressureTimeline,
} from '@/lib/drop-pressure-stats'
import { requireNavPermission } from '@/middleware/auth-permission'
import type { DropPressurePeriod } from '@/types/drop-pressure'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): DropPressurePeriod {
  if (value === 'month' || value === 'all') return value
  return 'week'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)
  if (!parsedClanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const permissionError = await requireNavPermission('clan.overview')(request, {
    clanId: parsedClanId,
  })
  if (permissionError) return permissionError

  const period = parsePeriod(new URL(request.url).searchParams.get('period'))
  const [stats, ranking, timeline] = await Promise.all([
    getDropPressureDashboardStats({ clanId: parsedClanId, period }),
    getDropPressureMemberRanking({ clanId: parsedClanId, period }),
    getDropPressureTimeline({ clanId: parsedClanId }),
  ])
  return Response.json({ stats, ranking, timeline, period })
}